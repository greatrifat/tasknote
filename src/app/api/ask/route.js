import { NextResponse } from "next/server";

import { badRequest, serverError } from "@/lib/api";
import { getCollection } from "@/lib/mongodb";
import { askGroq } from "@/lib/groq";

export const dynamic = "force-dynamic";

/**
 * The binding limit is tokens-per-minute, not the context window.
 *
 * Groq's models hold 131k tokens, but the free tier allows 12,000 tokens per
 * MINUTE on the model we prefer — and the answer counts against the same
 * budget. 7,000 tokens of context leaves room for the instructions, the
 * question and the reply.
 */
const TOKEN_BUDGET = 7_000;

/** Answer length. Counts toward the same per-minute budget as the prompt. */
const MAX_ANSWER_TOKENS = 900;

/** So one very long meeting cannot consume the entire request. */
const PER_MEETING_TOKENS = 2_200;

/**
 * The routing pass sees only titles, so this is generous: about 300 tokens for
 * nine meetings, and still under the per-minute limit at several hundred.
 */
const ROUTER_TOKEN_BUDGET = 4_000;

/**
 * Tokens are not characters, and the ratio depends entirely on the script.
 *
 * Latin text runs about 4 characters per token. Bengali runs closer to 0.6 —
 * measured at 1.17 tokens per character across these meetings, which are ~69%
 * Bengali. Budgeting by character count made a 14k-character request arrive as
 * 16.5k tokens and get rejected outright. Non-ASCII is charged at 1.7 to stay
 * on the safe side of that.
 */
function estimateTokens(text) {
  const str = String(text ?? "");
  let nonAscii = 0;
  for (const char of str) if (char.codePointAt(0) > 127) nonAscii++;
  return Math.ceil((str.length - nonAscii) * 0.25 + nonAscii * 1.7);
}

/** Cuts text to roughly a token count, respecting the same script weighting. */
function clampToTokens(text, limit) {
  if (estimateTokens(text) <= limit) return text;
  let out = "";
  let used = 0;
  for (const char of String(text)) {
    used += char.codePointAt(0) > 127 ? 1.7 : 0.25;
    if (used > limit) break;
    out += char;
  }
  return `${out.trimEnd()}…`;
}

/**
 * Ranks meetings against the question so the token budget is spent on records
 * that might actually answer it. Without this the newest meetings win by
 * default, and with Bengali summaries only two or three fit at all.
 */
function relevanceScore(meeting, question) {
  const words = question
    .toLowerCase()
    .split(/[\s,.?!;:()"'—–-]+/)
    .filter((w) => w.length > 2);
  if (!words.length) return 0;

  const haystack = [meeting.title, (meeting.tags || []).join(" "), meeting.summary, meeting.transcript]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let score = 0;
  for (const word of new Set(words)) if (haystack.includes(word)) score++;
  return score;
}

const SYSTEM = [
  "You answer questions about a person's meetings using only the records provided.",
  "",
  "Rules:",
  "- Cite the meetings you used by their [n] number, e.g. 'They agreed to drop it [2]'.",
  "- If the records do not contain the answer, say so plainly. Do not guess, and do",
  "  not fall back on general knowledge.",
  "- Quote the wording actually used when it matters.",
  "- Answer in the language of the question, even when the meetings are in another",
  "  language.",
  "- Be brief. Two or three sentences unless asked for detail.",
].join("\n");

/**
 * Builds the prompt from the most recent meetings backwards, stopping at the
 * budget. Recency wins because a question about "what did we decide" almost
 * always means lately — and an older meeting silently dropped is better than a
 * request that fails for being too large.
 */
/** Orders meetings by keyword overlap, newest first within equal scores. */
function rankByKeyword(meetings, question) {
  return meetings
    .map((meeting, index) => ({ meeting, index, score: relevanceScore(meeting, question) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.meeting);
}

const ROUTER_SYSTEM = [
  "You are given a numbered list of meetings — each with a title, a date and its",
  "tags — and asked a question. Reply with a JSON array of the numbers whose",
  "meetings might help answer it.",
  "",
  "- Use the TAGS as much as the title. Tags are always written in English even",
  "  when the meeting was held in another language, so they are often the clearest",
  "  match for an English question about a Bengali meeting.",
  "- Match by MEANING, not spelling. A question about 'tokens' matches a meeting",
  "  titled 'টোকেন ব্যবস্থাপনা' or tagged 'token management'.",
  "- A date in the question ('last week', 'Tuesday') should narrow the list.",
  "- Include anything plausibly related. Being wrong costs one wasted lookup;",
  "  missing the right meeting means the question cannot be answered at all.",
  "- Order the numbers most promising first, at most 8 of them.",
  "- Reply with the array and nothing else, e.g. [3,1,7]. Empty array if none fit.",
].join("\n");

/**
 * Picks which meetings to read, from their titles, dates and tags.
 *
 * This exists because keyword matching cannot see that "tokens" and "টোকেন" are
 * the same subject, and a meeting that never gets selected produces a confident
 * "the records do not contain the answer" — indistinguishable from the thing not
 * having happened. Titles are cheap: nine meetings cost roughly 300 tokens, so
 * the routing request is a rounding error against reading the summaries.
 *
 * Returns null when routing fails, so the caller falls back to keyword ranking
 * rather than losing the feature to a bad reply.
 */
async function routeToMeetings(meetings, question) {
  const list = meetings
    .map((m, i) => {
      const date = m.startsAt ? new Date(m.startsAt).toISOString().slice(0, 10) : "";
      // Labelled, not just appended: separated by the same dash as the date, a
      // tag list reads as part of the title.
      const tags = m.tags?.length ? ` — tags: ${m.tags.join(", ")}` : "";
      return `[${i + 1}] ${m.title || "Untitled"} — ${date}${tags}`;
    })
    .join("\n");

  try {
    const raw = await askGroq({
      system: ROUTER_SYSTEM,
      user: `MEETINGS\n${clampToTokens(list, ROUTER_TOKEN_BUDGET)}\n\nQUESTION: ${question}`,
      maxTokens: 120,
    });

    // Digits rather than JSON.parse: models wrap arrays in prose often enough
    // that a strict parse would throw away usable answers.
    const picked = [...new Set((raw.match(/\d+/g) || []).map(Number))]
      .filter((n) => n >= 1 && n <= meetings.length)
      .slice(0, 8);

    return picked.length ? picked.map((n) => meetings[n - 1]) : null;
  } catch {
    return null;
  }
}

function buildContext(ranked) {
  const blocks = [];
  const used = [];
  let total = 0;

  for (const [position, meeting] of ranked.entries()) {
    const number = position + 1;
    const date = meeting.startsAt ? new Date(meeting.startsAt).toISOString().slice(0, 10) : "unknown date";

    // Summary when there is one, transcript only when there is not. Sending
    // both would roughly triple the tokens for the same information.
    const summary = meeting.summary?.trim();
    const transcript = meeting.transcript?.trim();
    const body = summary
      ? `SUMMARY\n${clampToTokens(summary, PER_MEETING_TOKENS)}`
      : transcript
        ? `TRANSCRIPT (no summary)\n${clampToTokens(transcript, PER_MEETING_TOKENS)}`
        : "";

    if (!body) continue;

    const block = `[${number}] ${meeting.title || "Untitled"} — ${date}${
      meeting.tags?.length ? ` — tags: ${meeting.tags.join(", ")}` : ""
    }\n${body}`;

    const cost = estimateTokens(block);
    // `continue`, not `break`: a long meeting that does not fit should not stop
    // a shorter, equally relevant one further down the list from being included.
    if (total + cost > TOKEN_BUDGET) continue;
    total += cost;
    blocks.push(block);
    used.push({ number, id: String(meeting._id), title: meeting.title, startsAt: meeting.startsAt });
  }

  return { text: blocks.join("\n\n---\n\n"), used, tokens: total };
}

export async function POST(request) {
  try {
    const { question } = await request.json().catch(() => ({}));
    const trimmed = String(question ?? "").trim();
    if (!trimmed) return badRequest("question is required");
    if (trimmed.length > 2000) return badRequest("question must be 2000 characters or fewer");

    const meetings = await getCollection("meetings");
    const docs = await meetings.find({}).sort({ startsAt: -1 }).toArray();

    // First pass: choose from titles, dates and tags. Falls back to keyword
    // ranking if the router is unavailable, so the feature degrades rather than
    // breaking.
    const routed = await routeToMeetings(docs, trimmed);
    const ordered = routed ?? rankByKeyword(docs, trimmed);

    const context = buildContext(ordered);
    if (!context.used.length) {
      return NextResponse.json({
        answer: "There are no meetings with a transcript or summary to search yet.",
        sources: [],
        searched: 0,
        total: docs.length,
        skipped: [],
      });
    }

    const answer = await askGroq({
      system: SYSTEM,
      user: `MEETINGS\n\n${context.text}\n\n---\n\nQUESTION: ${trimmed}`,
      maxTokens: MAX_ANSWER_TOKENS,
    });

    // Which meetings were NOT read. A "not found" answer that only looked at
    // three of nine meetings is not the same as the thing never happening, and
    // the page cannot say so unless it knows what was left out.
    const readIds = new Set(context.used.map((u) => u.id));
    const skipped = docs
      .filter((d) => !readIds.has(String(d._id)))
      .map((d) => ({ id: String(d._id), title: d.title, startsAt: d.startsAt }));

    return NextResponse.json({
      answer,
      sources: context.used,
      searched: context.used.length,
      total: docs.length,
      skipped,
      routed: Boolean(routed),
    });
  } catch (err) {
    // A missing key or an exhausted Groq account is the user's problem to fix,
    // so the message is passed through rather than flattened to a 500.
    if (err instanceof Error && /Groq|API key/i.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return serverError(err);
  }
}
