"use client";

import { useCallback, useEffect, useState } from "react";
import { btnDanger, btnGhost, btnPrimary, input, label } from "@/components/ui";

const EMPTY = {
  title: "",
  startsAt: "",
  durationMinutes: 30,
  location: "",
  attendees: "",
  notes: "",
};

// <input type="datetime-local"> needs local time as YYYY-MM-DDTHH:mm, while the
// API returns UTC ISO. Shift by the timezone offset so the displayed clock time
// matches what the user originally entered.
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, { timeStyle: "short" });
}

const th = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide opacity-55";
const td = "px-4 py-3 align-top text-sm";

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState([]);
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
      const res = await fetch("/api/meetings");
      if (!res.ok) throw new Error("Failed to load meetings");
      setMeetings(await res.json());
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

  function openEdit(meeting) {
    setEditingId(meeting.id);
    setForm({
      title: meeting.title || "",
      startsAt: toLocalInput(meeting.startsAt),
      durationMinutes: meeting.durationMinutes ?? 30,
      location: meeting.location || "",
      attendees: (meeting.attendees || []).join(", "),
      notes: meeting.notes || "",
    });
    setError("");
    setFormOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      // attendees goes as the raw comma-separated string; the API splits it.
      const payload = { ...form, durationMinutes: Number(form.durationMinutes) };
      const res = await fetch(editingId ? `/api/meetings/${editingId}` : "/api/meetings", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
    if (!confirm("Delete this meeting?")) return;
    try {
      const res = await fetch(`/api/meetings/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      if (editingId === id) closeForm();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
        <button className={btnPrimary} onClick={openCreate}>
          Add meeting
        </button>
      </div>

      {error && !formOpen && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="mt-6 overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-black/10 bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.04]">
            <tr>
              <th className={th}>Title</th>
              <th className={th}>Date</th>
              <th className={th}>Time</th>
              <th className={th}>Duration</th>
              <th className={th}>Location</th>
              <th className={th}>Attendees</th>
              <th className={th}>Source</th>
              <th className={th}>Recording</th>
              <th className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td className={`${td} opacity-60`} colSpan={9}>Loading…</td>
              </tr>
            )}

            {!loading && meetings.length === 0 && (
              <tr>
                <td className={`${td} opacity-60`} colSpan={9}>No meetings scheduled.</td>
              </tr>
            )}

            {meetings.map((meeting) => {
              const detail = meeting.notes || meeting.summary || meeting.transcript;
              const expanded = expandedId === meeting.id;

              return [
                <tr
                  key={meeting.id}
                  className="border-b border-black/5 last:border-0 hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.03]"
                >
                  <td className={`${td} font-medium`}>
                    {detail ? (
                      <button
                        className="text-left hover:underline"
                        onClick={() => setExpandedId(expanded ? null : meeting.id)}
                        aria-expanded={expanded}
                      >
                        {meeting.title}
                        <span className="ml-2 text-xs opacity-50">{expanded ? "▲" : "▼"}</span>
                      </button>
                    ) : (
                      meeting.title
                    )}
                  </td>

                  <td className={`${td} whitespace-nowrap`}>{formatDate(meeting.startsAt)}</td>
                  <td className={`${td} whitespace-nowrap`}>{formatTime(meeting.startsAt)}</td>
                  <td className={`${td} whitespace-nowrap`}>{meeting.durationMinutes} min</td>
                  <td className={td}>{meeting.location || <span className="opacity-40">—</span>}</td>

                  <td className={td}>
                    {meeting.attendees?.length ? (
                      meeting.attendees.join(", ")
                    ) : (
                      <span className="opacity-40">—</span>
                    )}
                  </td>

                  <td className={td}>
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        meeting.source === "voicetotext"
                          ? "bg-violet-500/15 text-violet-600 dark:text-violet-300"
                          : "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300"
                      }`}
                    >
                      {meeting.source || "manual"}
                    </span>
                  </td>

                  <td className={`${td} whitespace-nowrap`}>
                    {meeting.folderUrl || meeting.audioUrl || meeting.transcriptUrl ? (
                      <span className="flex gap-2 text-xs">
                        {meeting.folderUrl && (
                          <a className="text-blue-600 hover:underline dark:text-blue-400" href={meeting.folderUrl} target="_blank" rel="noreferrer">Folder</a>
                        )}
                        {meeting.audioUrl && (
                          <a className="text-blue-600 hover:underline dark:text-blue-400" href={meeting.audioUrl} target="_blank" rel="noreferrer">Audio</a>
                        )}
                        {meeting.transcriptUrl && (
                          <a className="text-blue-600 hover:underline dark:text-blue-400" href={meeting.transcriptUrl} target="_blank" rel="noreferrer">Text</a>
                        )}
                      </span>
                    ) : (
                      <span className="opacity-40">—</span>
                    )}
                  </td>

                  <td className={`${td} whitespace-nowrap text-right`}>
                    <span className="flex justify-end gap-2">
                      <button className={btnGhost} onClick={() => openEdit(meeting)}>Edit</button>
                      <button className={btnDanger} onClick={() => handleDelete(meeting.id)}>Delete</button>
                    </span>
                  </td>
                </tr>,

                // Long-form content would blow out the row height, so it lives in
                // a detail row the title toggles open.
                expanded && (
                  <tr key={`${meeting.id}-detail`} className="border-b border-black/5 bg-black/[0.02] dark:border-white/5 dark:bg-white/[0.03]">
                    <td className="px-4 py-4" colSpan={9}>
                      {meeting.notes && (
                        <div className="mb-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wide opacity-50">Notes</h4>
                          <p className="mt-1 whitespace-pre-wrap text-sm opacity-80">{meeting.notes}</p>
                        </div>
                      )}
                      {meeting.summary && (
                        <div className="mb-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wide opacity-50">Summary</h4>
                          <p className="mt-1 whitespace-pre-wrap text-sm opacity-80">{meeting.summary}</p>
                        </div>
                      )}
                      {meeting.transcript && (
                        <details>
                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide opacity-50">
                            Transcript
                          </summary>
                          <p className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap text-sm opacity-80">
                            {meeting.transcript}
                          </p>
                        </details>
                      )}
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
            aria-labelledby="meeting-form-title"
            className="w-full max-w-2xl rounded-lg border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 id="meeting-form-title" className="text-lg font-medium">
                {editingId ? "Edit meeting" : "New meeting"}
              </h2>
              <button className={btnGhost} onClick={closeForm} aria-label="Close">✕</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={label} htmlFor="title">Title</label>
                  <input id="title" className={input} value={form.title} onChange={set("title")} required maxLength={200} autoFocus />
                </div>

                <div>
                  <label className={label} htmlFor="startsAt">Starts at</label>
                  <input id="startsAt" type="datetime-local" className={input} value={form.startsAt} onChange={set("startsAt")} required />
                </div>

                <div>
                  <label className={label} htmlFor="durationMinutes">Duration (minutes)</label>
                  <input id="durationMinutes" type="number" min={1} max={1440} className={input} value={form.durationMinutes} onChange={set("durationMinutes")} />
                </div>

                <div>
                  <label className={label} htmlFor="location">Location</label>
                  <input id="location" className={input} value={form.location} onChange={set("location")} placeholder="Room 3 / Zoom link" />
                </div>

                <div>
                  <label className={label} htmlFor="attendees">Attendees (comma separated)</label>
                  <input id="attendees" className={input} value={form.attendees} onChange={set("attendees")} placeholder="Ana, Ben, Chi" />
                </div>

                <div className="sm:col-span-2">
                  <label className={label} htmlFor="notes">Notes</label>
                  <textarea id="notes" rows={3} className={input} value={form.notes} onChange={set("notes")} />
                </div>
              </div>

              {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

              <div className="mt-6 flex justify-end gap-2">
                <button type="button" className={btnGhost} onClick={closeForm}>Cancel</button>
                <button type="submit" className={btnPrimary} disabled={saving}>
                  {saving ? "Saving…" : editingId ? "Update meeting" : "Add meeting"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
