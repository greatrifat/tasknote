/**
 * Groq client, used for the work Gemini's free tier cannot afford.
 *
 * The division is deliberate: Gemini allows roughly 20 requests per model per
 * day and writes better Bengali, so it keeps the summaries. Groq allows
 * thousands and answers in a second, so it takes the volume work — questions
 * across every meeting, bulk re-tagging — where speed and quantity matter more
 * than prose quality.
 */
import { getSettings } from "@/lib/settings";

/**
 * Tried in order. All three carry a 131k context window, which is what makes
 * "ask across every meeting" possible without an embedding index.
 */
const MODELS = ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "llama-3.1-8b-instant"];

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

class RateLimitError extends Error {
  constructor(message, retryAfter) {
    super(message);
    /** Seconds Groq asked us to wait, or null when it did not say. */
    this.retryAfter = retryAfter ?? null;
  }
}
class ModelUnavailableError extends Error {}
class InvalidKeyError extends Error {}

/**
 * The prompt exceeds what one request may carry. Distinct from a rate limit
 * because no amount of waiting or retrying fixes it, and the fallback models
 * have *lower* per-minute limits — trying them would only fail again, slower.
 */
class RequestTooLargeError extends Error {}

export async function hasGroqKey() {
  return Boolean((await getSettings()).groqKey);
}

/**
 * Groq sends `retry-after` only on a 429, and it is the one number worth
 * having: a per-minute token limit clears in seconds, and telling someone to
 * "wait a minute" when the answer is four seconds away is needlessly wrong.
 *
 * Values are seconds, sometimes fractional ("2.5"). Anything unparseable
 * becomes null rather than a guess.
 */
export function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(String(value).replace(/s$/i, "").trim());
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : null;
}

/** Waits below this are simply taken, rather than handed back to the user. */
const AUTO_RETRY_MAX_SECONDS = 8;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callOnce({ apiKey, model, system, user, maxTokens }) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: maxTokens ?? 1500,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const payload = await res.json().catch(() => null);
  const message = payload?.error?.message ?? "";

  // Checked before the 429 branch: Groq reports an oversized prompt as a rate
  // limit too, and the two need opposite handling.
  if (res.status === 413 || /request too large|reduce your message size/i.test(message)) {
    throw new RequestTooLargeError(message || "request too large");
  }
  if (res.status === 429) {
    throw new RateLimitError(
      message || "rate limited",
      parseRetryAfter(res.headers.get("retry-after"))
    );
  }
  if (res.status === 404 || /does not exist|decommissioned/i.test(message)) {
    throw new ModelUnavailableError(message || `HTTP ${res.status}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new InvalidKeyError(message || `HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(message || `HTTP ${res.status}`);

  const text = payload?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq returned an empty response");
  return text;
}

/**
 * Walks the model list on rate limits and retirements. A rejected key fails
 * immediately — no other model will accept it.
 */
export async function askGroq({ system, user, maxTokens }) {
  const { groqKey } = await getSettings();
  if (!groqKey) throw new Error("No Groq API key configured. Add one in Settings.");

  let lastError = null;
  let waited = false;

  for (const model of MODELS) {
    try {
      return await callOnce({ apiKey: groqKey, model, system, user, maxTokens });
    } catch (err) {
      lastError = err;

      // A per-minute token limit clears on its own, and Groq says exactly when.
      // Waiting a few seconds beats falling back to a weaker model — but only
      // once per request, so a question can never hang for long.
      if (
        err instanceof RateLimitError &&
        !waited &&
        err.retryAfter !== null &&
        err.retryAfter <= AUTO_RETRY_MAX_SECONDS
      ) {
        waited = true;
        await sleep(err.retryAfter * 1000 + 250);
        try {
          return await callOnce({ apiKey: groqKey, model, system, user, maxTokens });
        } catch (retryErr) {
          lastError = retryErr;
        }
      }
      if (err instanceof InvalidKeyError) {
        throw new Error(`Groq rejected the API key: ${err.message}`);
      }
      if (err instanceof RequestTooLargeError) {
        throw new Error(
          "Too much meeting text for one request. Ask a narrower question, or one " +
            "that mentions the meeting you mean."
        );
      }
      if (err instanceof RateLimitError || err instanceof ModelUnavailableError) continue;
      throw err;
    }
  }

  // Every model rate-limited means the per-minute token budget is spent, which
  // clears on its own — worth saying, since the raw message reads like a wall.
  if (lastError instanceof RateLimitError) {
    const wait = lastError.retryAfter;
    throw new Error(
      wait
        ? `Groq's free tier is rate limited. Try again in ${wait} second${wait === 1 ? "" : "s"}.`
        : "Groq's free tier is rate limited (tokens per minute). Wait a minute and ask again."
    );
  }
  throw lastError ?? new Error("Groq request failed");
}
