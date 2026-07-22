"use client";

import { useCallback, useEffect, useState } from "react";
import { btnDangerSm, btnGhost, btnGhostSm, btnPrimary, input, label } from "@/components/ui";

const EMPTY = { title: "", content: "", tags: "" };

function formatWhen(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// One line of preview in the table; the full body lives in the detail row.
function preview(content) {
  if (!content) return "";
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat;
}

const th = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide opacity-55";
const td = "px-4 py-3 align-top text-sm";

export default function NotesPage() {
  const [notes, setNotes] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notes");
      if (!res.ok) throw new Error("Failed to load notes");
      setNotes(await res.json());
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setForm(EMPTY);
    setEditingId(null);
    setError("");
  }, []);

  // Escape closes the dialog, matching what a native <dialog> would do.
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

  function openEdit(note) {
    setEditingId(note.id);
    setForm({
      title: note.title || "",
      content: note.content || "",
      tags: (note.tags || []).join(", "),
    });
    setError("");
    setFormOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      // tags goes as the raw comma-separated string; the API splits it.
      const res = await fetch(editingId ? `/api/notes/${editingId}` : "/api/notes", {
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
    if (!confirm("Delete this note?")) return;
    try {
      const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      if (editingId === id) closeForm();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function togglePin(note) {
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !note.pinned }),
      });
      if (!res.ok) throw new Error("Update failed");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
        <button className={btnPrimary} onClick={openCreate}>
          Add note
        </button>
      </div>

      {error && !formOpen && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="mt-6 overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-black/10 bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.04]">
            <tr>
              <th className={`${th} w-8`} aria-label="Pinned" />
              <th className={th}>Title</th>
              <th className={th}>Preview</th>
              <th className={th}>Tags</th>
              <th className={th}>Updated</th>
              <th className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td className={`${td} opacity-60`} colSpan={6}>Loading…</td>
              </tr>
            )}

            {!loading && notes.length === 0 && (
              <tr>
                <td className={`${td} opacity-60`} colSpan={6}>No notes yet.</td>
              </tr>
            )}

            {notes.map((note) => {
              const expanded = expandedId === note.id;

              return [
                <tr
                  key={note.id}
                  className="border-b border-black/5 last:border-0 hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.03]"
                >
                  <td className={`${td} pr-0`}>
                    <button
                      onClick={() => togglePin(note)}
                      title={note.pinned ? "Unpin" : "Pin to top"}
                      aria-label={note.pinned ? `Unpin ${note.title}` : `Pin ${note.title}`}
                      className={note.pinned ? "opacity-100" : "opacity-25 hover:opacity-60"}
                    >
                      ★
                    </button>
                  </td>

                  <td className={`${td} font-medium`}>
                    {note.content ? (
                      <button
                        className="text-left hover:underline"
                        onClick={() => setExpandedId(expanded ? null : note.id)}
                        aria-expanded={expanded}
                      >
                        {note.title}
                        <span className="ml-2 text-xs opacity-50">{expanded ? "▲" : "▼"}</span>
                      </button>
                    ) : (
                      note.title
                    )}
                  </td>

                  <td className={`${td} opacity-70`}>
                    {preview(note.content) || <span className="opacity-40">—</span>}
                  </td>

                  <td className={td}>
                    {note.tags?.length ? (
                      <span className="flex flex-wrap gap-1">
                        {note.tags.map((tag) => (
                          <span key={tag} className="rounded bg-zinc-500/15 px-2 py-0.5 text-xs">
                            {tag}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="opacity-40">—</span>
                    )}
                  </td>

                  <td className={`${td} whitespace-nowrap opacity-70`}>{formatWhen(note.updatedAt)}</td>

                  <td className={`${td} whitespace-nowrap text-right`}>
                    <span className="flex justify-end gap-2">
                      <button className={btnGhostSm} onClick={() => openEdit(note)}>Edit</button>
                      <button className={btnDangerSm} onClick={() => handleDelete(note.id)}>Delete</button>
                    </span>
                  </td>
                </tr>,

                // The full body would blow out the row height, so it lives in a
                // detail row the title toggles open.
                expanded && (
                  <tr key={`${note.id}-detail`} className="border-b border-black/5 bg-black/[0.02] dark:border-white/5 dark:bg-white/[0.03]">
                    <td className="px-4 py-4" colSpan={6}>
                      <p className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm opacity-80">
                        {note.content}
                      </p>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
          onMouseDown={(e) => {
            // Only a press that both starts and ends on the backdrop closes it,
            // so dragging a selection out of a field doesn't dismiss the form.
            if (e.target === e.currentTarget) closeForm();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="note-form-title"
            className="w-full max-w-2xl rounded-lg border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 id="note-form-title" className="text-lg font-medium">
                {editingId ? "Edit note" : "New note"}
              </h2>
              <button className={btnGhost} onClick={closeForm} aria-label="Close">✕</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid gap-4">
                <div>
                  <label className={label} htmlFor="title">Title</label>
                  <input id="title" className={input} value={form.title} onChange={set("title")} required maxLength={200} autoFocus />
                </div>

                <div>
                  <label className={label} htmlFor="content">Note</label>
                  <textarea id="content" rows={10} className={input} value={form.content} onChange={set("content")} />
                </div>

                <div>
                  <label className={label} htmlFor="tags">Tags (comma separated)</label>
                  <input id="tags" className={input} value={form.tags} onChange={set("tags")} placeholder="ideas, follow-up" />
                </div>
              </div>

              {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

              <div className="mt-6 flex justify-end gap-2">
                <button type="button" className={btnGhost} onClick={closeForm}>Cancel</button>
                <button type="submit" className={btnPrimary} disabled={saving}>
                  {saving ? "Saving…" : editingId ? "Update note" : "Add note"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
