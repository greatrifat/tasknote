import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { badRequest, serialize, serverError } from "@/lib/api";
import { validateMeeting } from "@/lib/validate";
import { generateMeta } from "@/lib/gemini";

export const dynamic = "force-dynamic";

/** Enough to fill a screen without scrolling far; overridable per request. */
const DEFAULT_PER_PAGE = 10;

/** Escapes a user's query so regex characters are matched literally. */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const source = searchParams.get("source");
    const tag = searchParams.get("tag");

    const filter = {};
    if (q) {
      // Search the whole meeting, not just its title: the transcript is by far
      // the largest body of text here, and a phrase someone half-remembers is
      // much more likely to be inside it than in a generated title.
      const rx = { $regex: escapeRegex(q), $options: "i" };
      filter.$or = [
        { title: rx },
        { summary: rx },
        { transcript: rx },
        { tags: rx },
      ];
    }
    if (source) filter.source = source;
    if (tag) filter.tags = tag;

    // Paged in the database rather than the browser: the point is that rows the
    // user cannot see are never read, serialised or sent.
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const perPage = Math.min(100, Math.max(1, Number(searchParams.get("perPage")) || DEFAULT_PER_PAGE));

    const meetings = await getCollection("meetings");
    const total = await meetings.countDocuments(filter);

    // The list deliberately does not carry transcripts. One meeting's transcript
    // can run to hundreds of kilobytes, so sending every one to render a table
    // of titles made the page's payload grow without bound. The row only needs
    // to know whether a transcript exists; the text itself is fetched from
    // /api/meetings/[id] when a row is actually opened.
    const docs = await meetings
      .aggregate([
        { $match: filter },
        // Newest first, so page one is the meetings anyone actually wants.
        { $sort: { startsAt: -1 } },
        { $skip: (page - 1) * perPage },
        { $limit: perPage },
        {
          $addFields: {
            hasSummary: { $gt: [{ $strLenCP: { $ifNull: ["$summary", ""] } }, 0] },
            hasTranscript: { $gt: [{ $strLenCP: { $ifNull: ["$transcript", ""] } }, 0] },
          },
        },
        { $project: { transcript: 0, summary: 0 } },
      ])
      .toArray();

    // The body stays a plain array so existing clients keep working; the paging
    // counts ride along in headers.
    return NextResponse.json(docs.map(serialize), {
      headers: {
        "X-Total-Count": String(total),
        "X-Page": String(page),
        "X-Per-Page": String(perPage),
      },
    });
  } catch (err) {
    return serverError(err);
  }
}

/**
 * VoiceToText names every recording after its clock, e.g. "Meeting 2026-07-21
 * 08:33". That is a placeholder, not a decision, so it may be replaced — and it
 * is resent on every retry, so a stored generated title has to survive one.
 */
function isPlaceholderTitle(title) {
  const value = (title ?? "").trim();
  if (!value) return true;
  if (/^untitled$/i.test(value)) return true;
  // A generic word followed by a date, time or number and *nothing else*. The
  // anchor matters: "Meeting about Q3 2026" is somebody's actual title and
  // must not be overwritten.
  return /^(meeting|recording)\s*\d[\d\s:/.-]*$/i.test(value);
}

/**
 * Fills in the title and tags the client did not decide for itself. Anything
 * supplied is kept — the model fills a blank, it does not overrule a decision.
 *
 * Failures are swallowed on purpose: this is a convenience, and a Gemini outage
 * or an exhausted quota must never stop a meeting from being stored.
 */
async function autoMeta(data, existing) {
  const wantTags = !data.tags?.length && !existing?.tags?.length;
  // A generated title already stored is a decision too; only a placeholder on
  // both sides is still open.
  const wantTitle =
    isPlaceholderTitle(data.title) && isPlaceholderTitle(existing?.title);

  const result = {
    tags: data.tags?.length ? data.tags : existing?.tags ?? [],
    title: "",
  };
  if (!wantTags && !wantTitle) return result;

  let meta = { title: "", tags: [] };
  try {
    meta = await generateMeta({
      title: data.title,
      summary: data.summary,
      transcript: data.transcript,
    });
  } catch (err) {
    console.error("auto-titling failed:", err.message);
  }

  if (wantTags && meta.tags.length) result.tags = meta.tags;
  // 200 is validateMeeting's ceiling; the title is stored bypassing it.
  if (wantTitle && meta.title) result.title = meta.title.slice(0, 200);
  return result;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { errors, data } = validateMeeting(body);
    if (errors.length) return badRequest(errors.join("; "));

    const now = new Date();
    const meetings = await getCollection("meetings");

    // Defaults for a brand-new document, so every meeting has the same shape.
    // These are applied on insert only — see the upsert below for why.
    const defaults = {
      durationMinutes: 30,
      source: "manual",
      tags: [],
      transcript: "",
      summary: "",
      folderUrl: "",
      audioUrl: "",
      transcriptUrl: "",
    };

    // A recorder whose POST succeeded but whose response was lost will send the
    // same externalId again; upserting means that retry updates the meeting
    // instead of creating a duplicate.
    if (data.externalId) {
      const existing = await meetings.findOne({ externalId: data.externalId });
      const { tags, title } = await autoMeta(data, existing);

      // A retry resends the placeholder title, so an already-generated one is
      // carried forward explicitly rather than being overwritten by $set.
      const keptTitle =
        title ||
        (isPlaceholderTitle(data.title) && !isPlaceholderTitle(existing?.title)
          ? existing.title
          : "");

      // Only fields actually present in the request are written. Defaulting the
      // absent ones into $set would let a retry that omits `durationMinutes`
      // reset it to 30, or flip `source` back to "manual".
      const onInsert = Object.fromEntries(
        Object.entries(defaults).filter(([key]) => data[key] === undefined && key !== "tags")
      );

      const updated = await meetings.findOneAndUpdate(
        { externalId: data.externalId },
        {
          $set: {
            ...data,
            ...(tags.length ? { tags } : {}),
            ...(keptTitle ? { title: keptTitle } : {}),
            updatedAt: now,
          },
          $setOnInsert: { ...onInsert, ...(tags.length ? {} : { tags: [] }), createdAt: now },
        },
        { upsert: true, returnDocument: "after" }
      );
      return NextResponse.json(serialize(updated), { status: 201 });
    }

    const meta = await autoMeta(data, null);
    const result = await meetings.insertOne({
      ...defaults,
      ...data,
      ...(meta.title ? { title: meta.title } : {}),
      tags: meta.tags,
      createdAt: now,
      updatedAt: now,
    });
    const created = await meetings.findOne({ _id: result.insertedId });
    return NextResponse.json(serialize(created), { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}
