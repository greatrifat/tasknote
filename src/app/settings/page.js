"use client";

import { useEffect, useState } from "react";

const input =
  "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 font-mono text-xs outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40";

export default function SettingsPage() {
  const [form, setForm] = useState({ geminiKey: "", groqKey: "" });
  const [guarded, setGuarded] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings");
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load");
        setForm({ geminiKey: body.geminiKey || "", groqKey: body.groqKey || "" });
        setGuarded(body.protected);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(e) {
    e.preventDefault();
    setStatus("");
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Save failed");
      setStatus("Saved.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function signOut() {
    await fetch("/api/auth/login", { method: "DELETE" });
    window.location.href = "/login";
  }

  if (loading) return <p className="text-sm opacity-60">Loading…</p>;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm opacity-60">
          Keys are stored in the database, so changing one takes effect without a
          redeploy. An environment variable is still used when a field is left blank.
        </p>
      </div>

      {!guarded && (
        <p className="rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <strong>This site is not password protected.</strong> Set{" "}
          <code>APP_PASSWORD</code> and <code>APP_SECRET</code> in your environment
          variables and redeploy — until then, anyone with the URL can read these
          keys and your transcripts.
        </p>
      )}

      <form onSubmit={save} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide opacity-50" htmlFor="gemini">
            Gemini API key
          </label>
          <input
            id="gemini"
            className={input}
            value={form.geminiKey}
            onChange={(e) => setForm({ ...form, geminiKey: e.target.value })}
            placeholder="AQ.… — used for tags and titles"
          />
          <p className="text-xs opacity-50">
            Several keys can be given, separated by commas. They only add headroom if
            they belong to different Google accounts.
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide opacity-50" htmlFor="groq">
            Groq API key
          </label>
          <input
            id="groq"
            className={input}
            value={form.groqKey}
            onChange={(e) => setForm({ ...form, groqKey: e.target.value })}
            placeholder="gsk_… — used for Ask across meetings"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            Save
          </button>
          {status && <span className="text-sm opacity-60">{status}</span>}
          {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
        </div>
      </form>

      <button onClick={signOut} className="text-sm underline opacity-60 hover:opacity-100">
        Sign out
      </button>
    </div>
  );
}
