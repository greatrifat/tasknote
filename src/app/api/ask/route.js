import { NextResponse } from "next/server";

import { badRequest, serverError } from "@/lib/api";
import { getCollection } from "@/lib/mongodb";
import { askGroq } from "@/lib/groq";

export const dynamic = "force-dynamic";

/**
 * The binding limit is tokens-per-minute, not the context window.
 *
 * Groq's models hold 131k tokens, but the free tier allows only 6,000–15,000
 * tokens per MINUTE, so a request sized to the window is rejected outright —
 * and a couple of questions in quick succession share that same budget. At
 * roughly 4 characters per token, 16k characters is about 4k tokens, which
 * leaves room for the instructions, the question and a second question soon
 * after.
 */
const CONTEXT_CHAR_BUDGET = 16_000;

/**
 * Transcripts are the fallback, not the default: a summary says the same thing
 * in a fraction of the tokens, and tokens are the scarce resource here. A
 * meeting that never got summarised still contributes, just truncated.
 */
const PER_MEETING_LIMIT = 3_000;

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
function buildContext(meetings) {
  const blocks = [];
  const used = [];
  let total = 0;

  for (const [index, meeting] of meetings.entries()) {
    const number = index + 1;
    const date = meeting.startsAt ? new Date(meeting.startsAt).toISOString().slice(0, 10) : "unknown date";

    // Summary when there is one, transcript only when there is not. Sending
    // both would roughly triple the tokens for the same information.
    const summary = meeting.summary?.trim();
    const transcript = meeting.transcript?.trim();
    const body = summary
      ? `SUMMARY\n${summary}`
      : transcript
        ? `TRANSCRIPT (no summary)\n${transcript.slice(0, PER_MEETING_LIMIT)}`
        : "";

    if (!body) continue;

    const block = `[${number}] ${meeting.title || "Untitled"} — ${date}${
      meeting.tags?.length ? ` — tags: ${meeting.tags.join(", ")}` : ""
    }\n${body}`;

    if (total + block.length > CONTEXT_CHAR_BUDGET) break;
    total += block.length;
    blocks.push(block);
    used.push({ number, id: String(meeting._id), title: meeting.title, startsAt: meeting.startsAt });
  }

  return { text: blocks.join("\n\n---\n\n"), used, chars: total };
}

export async function POST(request) {
  try {
    const { question } = await request.json().catch(() => ({}));
    const trimmed = String(question ?? "").trim();
    if (!trimmed) return badRequest("question is required");
    if (trimmed.length > 2000) return badRequest("question must be 2000 characters or fewer");

    const meetings = await getCollection("meetings");
    const docs = await meetings.find({}).sort({ startsAt: -1 }).toArray();

    const context = buildContext(docs);
    if (!context.used.length) {
      return NextResponse.json({
        answer: "There are no meetings with a transcript or summary to search yet.",
        sources: [],
      });
    }

    const answer = await askGroq({
      system: SYSTEM,
      user: `MEETINGS\n\n${context.text}\n\n---\n\nQUESTION: ${trimmed}`,
    });

    return NextResponse.json({
      answer,
      sources: context.used,
      // Surfaced so the page can say when older meetings did not fit.
      searched: context.used.length,
      total: docs.length,
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
