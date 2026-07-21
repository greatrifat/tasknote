import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { badRequest, serialize, serverError } from "@/lib/api";
import { validateMeeting } from "@/lib/validate";
import { generateTags } from "@/lib/gemini";

export const dynamic = "force-dynamic";

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

    const meetings = await getCollection("meetings");
    const docs = await meetings.find(filter).sort({ startsAt: 1 }).toArray();
    return NextResponse.json(docs.map(serialize));
  } catch (err) {
    return serverError(err);
  }
}

/**
 * Fills in tags when the client did not supply any. Tags that were sent are
 * never replaced — the model fills a blank, it does not overrule a decision.
 *
 * Failures are swallowed on purpose: tagging is a convenience, and a Gemini
 * outage or an exhausted quota must never stop a meeting from being stored.
 */
async function autoTags(data, existing) {
  if (data.tags?.length) return data.tags;
  if (existing?.length) return existing;
  try {
    return await generateTags({
      title: data.title,
      summary: data.summary,
      transcript: data.transcript,
    });
  } catch (err) {
    console.error("auto-tagging failed:", err.message);
    return [];
  }
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
      const tags = await autoTags(data, existing?.tags);

      // Only fields actually present in the request are written. Defaulting the
      // absent ones into $set would let a retry that omits `durationMinutes`
      // reset it to 30, or flip `source` back to "manual".
      const onInsert = Object.fromEntries(
        Object.entries(defaults).filter(([key]) => data[key] === undefined && key !== "tags")
      );

      const updated = await meetings.findOneAndUpdate(
        { externalId: data.externalId },
        {
          $set: { ...data, ...(tags.length ? { tags } : {}), updatedAt: now },
          $setOnInsert: { ...onInsert, ...(tags.length ? {} : { tags: [] }), createdAt: now },
        },
        { upsert: true, returnDocument: "after" }
      );
      return NextResponse.json(serialize(updated), { status: 201 });
    }

    const result = await meetings.insertOne({
      ...defaults,
      ...data,
      tags: await autoTags(data),
      createdAt: now,
      updatedAt: now,
    });
    const created = await meetings.findOne({ _id: result.insertedId });
    return NextResponse.json(serialize(created), { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}
