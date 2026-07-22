import { getCollection } from "@/lib/mongodb";

/**
 * API keys, held in the database so they can be changed from the settings page
 * rather than by redeploying. Environment variables still work and are used as
 * the fallback, so an existing deployment keeps running untouched.
 *
 * This is only safe because the site is behind the password gate — see
 * proxy.js. Without it these would be world-readable.
 */
const DOC_ID = "app";

const EMPTY = { geminiKey: "", groqKey: "" };

/** Cached briefly so a page of requests does not hit Mongo for each one. */
let cache = null;
let cachedAt = 0;
const CACHE_MS = 10_000;

export async function getSettings() {
  if (cache && Date.now() - cachedAt < CACHE_MS) return cache;

  let stored = {};
  try {
    const settings = await getCollection("settings");
    stored = (await settings.findOne({ _id: DOC_ID })) ?? {};
  } catch {
    // A database that will not answer must not take the whole page down; the
    // environment fallback below still applies.
  }

  cache = {
    geminiKey: stored.geminiKey?.trim() || process.env.GEMINI_API_KEY?.trim() || "",
    groqKey: stored.groqKey?.trim() || process.env.GROQ_API_KEY?.trim() || "",
  };
  cachedAt = Date.now();
  return cache;
}

export async function saveSettings(values) {
  const settings = await getCollection("settings");
  const update = {};
  for (const field of Object.keys(EMPTY)) {
    if (values[field] !== undefined) update[field] = String(values[field]).trim();
  }

  await settings.updateOne(
    { _id: DOC_ID },
    { $set: { ...update, updatedAt: new Date() } },
    { upsert: true }
  );
  cache = null;
  return getSettings();
}
