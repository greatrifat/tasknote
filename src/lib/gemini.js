import { getSettings } from "@/lib/settings";

/**
 * Server-side Gemini client.
 *
 * The key comes from the settings collection, falling back to GEMINI_API_KEY.
 * Either way it never reaches the browser — this module is only imported by
 * route handlers. Do not prefix the variable with NEXT_PUBLIC_, which would
 * inline it into the client bundle.
 *
 * Several comma-separated keys are accepted. They are tried in order, which only
 * adds headroom when they belong to different Google accounts: the free-tier
 * quota is metered per project.
 */

/**
 * Tried in order. Free-tier requests-per-day is metered separately for each
 * model, so a model that is out of quota leaves the rest untouched. Models are
 * also retired for new accounts while older ones keep access, so the list
 * doubles as availability fallback.
 */
const MODELS = [
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

const endpointFor = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

class QuotaError extends Error {}
class ModelUnavailableError extends Error {}
class ModelBusyError extends Error {}
class InvalidKeyError extends Error {}

export async function hasGeminiKey() {
  return (await keys()).length > 0;
}

/**
 * From the settings collection, falling back to GEMINI_API_KEY — so a key set
 * on the settings page wins, and a deployment that only has the environment
 * variable keeps working unchanged.
 */
async function keys() {
  const { geminiKey } = await getSettings();
  return geminiKey
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

async function callOnce({ apiKey, model, prompt, schema }) {
  const res = await fetch(endpointFor(model), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        ...(schema ? { responseMimeType: "application/json", responseSchema: schema } : {}),
      },
    }),
  });

  const payload = await res.json().catch(() => null);
  const message = payload?.error?.message ?? "";

  if (res.status === 429) throw new QuotaError(message || "quota exceeded");
  if (res.status === 404 || /no longer available|not found|not supported/i.test(message)) {
    throw new ModelUnavailableError(message || `HTTP ${res.status}`);
  }
  if (res.status >= 500 || /high demand|overloaded/i.test(message)) {
    throw new ModelBusyError(message || `HTTP ${res.status}`);
  }
  if (res.status === 401 || res.status === 403 || /api key not valid|invalid api key/i.test(message)) {
    throw new InvalidKeyError(message || `HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(message || `HTTP ${res.status}`);

  const text = (payload?.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

/**
 * Walks models within a key before moving to the next key, because quota is
 * per model. A rejected key is abandoned immediately — no model will accept it.
 */
async function generate({ prompt, schema }) {
  const apiKeys = await keys();
  if (apiKeys.length === 0) throw new Error("GEMINI_API_KEY is not configured");

  let lastError = null;
  for (const apiKey of apiKeys) {
    for (const model of MODELS) {
      try {
        return await callOnce({ apiKey, model, prompt, schema });
      } catch (err) {
        lastError = err;
        if (err instanceof InvalidKeyError) break; // next key
        if (
          err instanceof QuotaError ||
          err instanceof ModelUnavailableError ||
          err instanceof ModelBusyError
        ) {
          continue; // next model
        }
        throw err;
      }
    }
  }
  throw lastError ?? new Error("Gemini request failed");
}

// Title and tags come back from one request rather than two. They are read off
// the same text and the free-tier budget is roughly 20 requests per model per
// day, so spending two on one meeting halves how many can be filed.
const META_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    tags: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["title", "tags"],
};

const META_PROMPT = [
  "Read the meeting below. Return a short title for it, and 2 to 5 topical tags.",
  "",
  "Title rules:",
  "- 3 to 8 words naming what was actually discussed or decided.",
  '- No date, no time, and no leading "Meeting"/"Call" — those are added',
  "  separately and would be duplicated.",
  "- Sentence case. No trailing full stop, no surrounding quotes.",
  "",
  "Tag rules:",
  "- Lowercase, one or two words each, singular where natural.",
  "- Describe what the meeting was ABOUT, not its format. Avoid generic filler",
  '  like "meeting", "discussion", "transcript", "misc".',
  "- Prefer concrete nouns a person would actually search for later:",
  '  project names, people, technologies, decisions, deadlines.',
  "- ALWAYS write tags in English, even when the meeting was held in another",
  "  language. Translate the concept rather than transliterating it: a meeting",
  '  about "সিআরএম" is tagged "crm", one about "ফিডব্যাক" is tagged "feedback".',
  "  Keep proper nouns as they are normally written in English.",
  "- Return fewer tags rather than padding with weak ones.",
  "",
  "The title stays in the language of the meeting; only the tags are English.",
].join("\n");

/** Normalises tags to the shape validateMeeting enforces. */
function cleanTags(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const tags = [];
  for (const item of value) {
    const tag = String(item ?? "").trim().toLowerCase().slice(0, 40);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length === 5) break;
  }
  return tags;
}

/** Strips the quotes and trailing punctuation models like to add to a title. */
function cleanTitle(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/[.。]+$/, "")
    .slice(0, 120)
    .trim();
}

/**
 * Suggests a title and tags for a meeting. Returns empty values rather than
 * throwing when no key is configured, so callers can ask unconditionally.
 *
 * Prefers the summary over the transcript: it is already a distilled view of the
 * meeting, and it stops a long recording from dominating the request.
 */
export async function generateMeta({ title, summary, transcript }) {
  const empty = { title: "", tags: [] };
  if (!(await hasGeminiKey())) return empty;

  const source = summary?.trim() || transcript?.trim().slice(0, 20000) || "";
  // Without content there is nothing to name the meeting after; the existing
  // title alone would only produce a paraphrase of itself.
  if (!source) return empty;

  const body = `${META_PROMPT}\n\n---MEETING---\n${source}`;
  const raw = await generate({ prompt: body, schema: META_SCHEMA });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  return { title: cleanTitle(parsed?.title), tags: cleanTags(parsed?.tags) };
}
