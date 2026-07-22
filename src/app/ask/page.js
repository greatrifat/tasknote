"use client";

import { useState } from "react";

const EXAMPLES = [
  "What did we decide about pricing?",
  "What action items are outstanding, and who owns them?",
  "Summarise everything discussed about the teacher portal.",
];

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function ask(e) {
    e?.preventDefault();
    const q = question.trim();
    if (!q) return;

    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Request failed");
      setResult(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Ask across meetings</h1>
        <p className="mt-1 text-sm opacity-60">
          Answers come only from your meeting transcripts and summaries, with the
          meetings used cited by number.
        </p>
      </div>

      <form onSubmit={ask} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question…"
          className="flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
        >
          {busy ? "Thinking…" : "Ask"}
        </button>
      </form>

      {!result && !busy && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              onClick={() => setQuestion(example)}
              className="rounded-full bg-zinc-500/10 px-3 py-1 text-xs hover:bg-zinc-500/20"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-4">
          <p className="whitespace-pre-wrap rounded-lg bg-black/[0.03] px-4 py-3 text-sm leading-relaxed dark:bg-white/[0.04]">
            {result.answer}
          </p>

          {result.sources?.length > 0 && (
            <div className="space-y-1">
              <h2 className="text-xs font-semibold uppercase tracking-wide opacity-50">
                Read {result.searched} of {result.total} meetings
              </h2>
              {result.sources.map((s) => (
                <p key={s.id} className="text-xs opacity-70">
                  [{s.number}] {s.title}
                  {s.startsAt ? ` — ${new Date(s.startsAt).toISOString().slice(0, 10)}` : ""}
                </p>
              ))}

              {/* Stated plainly rather than as a footnote: an answer of "not
                  found" means nothing unless you know what went unread. */}
              {result.skipped?.length > 0 && (
                <details className="pt-2">
                  <summary className="cursor-pointer text-xs text-amber-700 dark:text-amber-400">
                    {result.skipped.length} meeting{result.skipped.length > 1 ? "s were" : " was"} not
                    read — if the answer looks wrong, check these
                  </summary>
                  <div className="mt-1 space-y-0.5">
                    {result.skipped.map((s) => (
                      <p key={s.id} className="text-xs opacity-60">
                        {s.title}
                        {s.startsAt ? ` — ${new Date(s.startsAt).toISOString().slice(0, 10)}` : ""}
                      </p>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
