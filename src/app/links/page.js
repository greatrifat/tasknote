"use client";

import { useCallback, useEffect, useState } from "react";
import { btnDangerSm, btnGhost, btnGhostSm, btnPrimary, input, label } from "@/components/ui";

const EMPTY = { url: "", title: "", note: "", tags: "" };

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatWhen(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

const th = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide opacity-55";
const td = "px-4 py-3 align-top text-sm";

export default function LinksPage() {
  const [links, setLinks] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = applied ? `/api/links?q=${encodeURIComponent(applied)}` : "/api/links";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load links");
      setLinks(await res.json());
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setTimeout(() => setApplied(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setForm(EMPTY);
    setEditingId(null);
    setError("");
  }, []);

  useEffect(() => {
    if (!formOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeForm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formOpen, closeForm]);

  function openCreate() {
    setForm(EMPTY);
    setEditingId(null);
    setError("");
    setFormOpen(true);
  }

  function openEdit(link) {
    setEditingId(link.id);
    setForm({
      url: link.url || "",
      title: link.title || "",
      note: link.note || "",
      tags: (link.tags || []).join(", "),
    });
    setError("");
    setFormOpen(true);
  }

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(editingId ? `/api/links/${editingId}` : "/api/links", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Save failed");
      closeForm();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this link?")) return;
    try {
      const res = await fetch(`/api/links/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      if (editingId === id) closeForm();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Links</h1>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search links…"
          className={`${input} max-w-xs`}
        />
        <button className={`${btnPrimary} ml-auto`} onClick={openCreate}>
          Add link
        </button>
      </div>

      {error && !formOpen && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full min-w-[42rem] border-collapse">
          <thead className="border-b border-black/10 dark:border-white/10">
            <tr>
              <th className={th}>Link</th>
              <th className={th}>Note</th>
              <th className={th}>Tags</th>
              <th className={th}>Saved</th>
              <th className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className={`${td} opacity-60`} colSpan={5}>Loading…</td>
              </tr>
            )}

            {!loading && links.length === 0 && (
              <tr>
                <td className={`${td} opacity-60`} colSpan={5}>
                  {applied ? "No links match that search." : "No links saved yet."}
                </td>
              </tr>
            )}

            {links.map((link) => (
              <tr
                key={link.id}
                className="border-b border-black/5 last:border-0 hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.03]"
              >
                <td className={td}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {link.title}
                  </a>
                  <span className="block text-xs opacity-50">{hostOf(link.url)}</span>
                </td>

                <td className={`${td} max-w-sm`}>
                  {link.note ? (
                    <span className="opacity-80">{link.note}</span>
                  ) : (
                    <span className="opacity-40">—</span>
                  )}
                </td>

                <td className={td}>
                  {link.tags?.length ? (
                    <span className="flex flex-wrap gap-1">
                      {link.tags.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => setQuery(tag)}
                          title={`Search for "${tag}"`}
                          className="rounded bg-zinc-500/15 px-2 py-0.5 text-xs hover:bg-zinc-500/30"
                        >
                          {tag}
                        </button>
                      ))}
                    </span>
                  ) : (
                    <span className="opacity-40">—</span>
                  )}
                </td>

                <td className={`${td} whitespace-nowrap opacity-70`}>{formatWhen(link.createdAt)}</td>

                <td className={`${td} whitespace-nowrap text-right`}>
                  <span className="flex justify-end gap-2">
                    <button className={btnGhostSm} onClick={() => openEdit(link)}>Edit</button>
                    <button className={btnDangerSm} onClick={() => handleDelete(link.id)}>Delete</button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeForm();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="link-form-title"
            className="w-full max-w-xl rounded-lg border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 id="link-form-title" className="text-lg font-medium">
                {editingId ? "Edit link" : "New link"}
              </h2>
              <button className={btnGhost} onClick={closeForm} aria-label="Close">✕</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid gap-4">
                <div>
                  <label className={label} htmlFor="url">URL</label>
                  <input
                    id="url"
                    className={input}
                    value={form.url}
                    onChange={set("url")}
                    required
                    autoFocus
                    placeholder="example.com/article — https:// is added if you omit it"
                  />
                </div>

                <div>
                  <label className={label} htmlFor="title">Title</label>
                  <input
                    id="title"
                    className={input}
                    value={form.title}
                    onChange={set("title")}
                    maxLength={200}
                    placeholder="left blank, the site's domain is used"
                  />
                </div>

                <div>
                  <label className={label} htmlFor="note">Note</label>
                  <textarea
                    id="note"
                    rows={3}
                    className={`${input} resize-y`}
                    value={form.note}
                    onChange={set("note")}
                    maxLength={2000}
                    placeholder="why this is worth keeping"
                  />
                </div>

                <div>
                  <label className={label} htmlFor="tags">Tags (comma separated)</label>
                  <input id="tags" className={input} value={form.tags} onChange={set("tags")} />
                </div>
              </div>

              {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

              <div className="mt-6 flex justify-end gap-2">
                <button type="button" className={btnGhost} onClick={closeForm}>Cancel</button>
                <button type="submit" className={btnPrimary} disabled={saving}>
                  {saving ? "Saving…" : editingId ? "Update link" : "Add link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
