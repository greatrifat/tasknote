"use client";

import { useCallback, useEffect, useState } from "react";
import { btnDanger, btnGhost, btnPrimary, card, input, label } from "@/components/ui";

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

function formatWhen(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
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

  function resetForm() {
    setForm(EMPTY);
    setEditingId(null);
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        durationMinutes: Number(form.durationMinutes),
        // The API splits a comma-separated string into an array for us.
        attendees: form.attendees,
      };
      const res = await fetch(editingId ? `/api/meetings/${editingId}` : "/api/meetings", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Save failed");
      resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(meeting) {
    setEditingId(meeting.id);
    setForm({
      title: meeting.title || "",
      startsAt: toLocalInput(meeting.startsAt),
      durationMinutes: meeting.durationMinutes ?? 30,
      location: meeting.location || "",
      attendees: (meeting.attendees || []).join(", "),
      notes: meeting.notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id) {
    if (!confirm("Delete this meeting?")) return;
    try {
      const res = await fetch(`/api/meetings/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      if (editingId === id) resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>

      <form onSubmit={handleSubmit} className={`${card} mt-6`}>
        <h2 className="mb-4 font-medium">{editingId ? "Edit meeting" : "New meeting"}</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label} htmlFor="title">Title</label>
            <input id="title" className={input} value={form.title} onChange={set("title")} required maxLength={200} />
          </div>

          <div>
            <label className={label} htmlFor="startsAt">Starts at</label>
            <input
              id="startsAt"
              type="datetime-local"
              className={input}
              value={form.startsAt}
              onChange={set("startsAt")}
              required
            />
          </div>

          <div>
            <label className={label} htmlFor="durationMinutes">Duration (minutes)</label>
            <input
              id="durationMinutes"
              type="number"
              min={1}
              max={1440}
              className={input}
              value={form.durationMinutes}
              onChange={set("durationMinutes")}
            />
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

        <div className="mt-5 flex gap-2">
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving ? "Saving…" : editingId ? "Update meeting" : "Add meeting"}
          </button>
          {editingId && <button type="button" className={btnGhost} onClick={resetForm}>Cancel</button>}
        </div>
      </form>

      <div className="mt-8 space-y-3">
        {loading && <p className="opacity-60">Loading…</p>}
        {!loading && meetings.length === 0 && <p className="opacity-60">No meetings scheduled.</p>}

        {meetings.map((meeting) => (
          <div key={meeting.id} className={`${card} flex items-start gap-4`}>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium">{meeting.title}</h3>

              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm opacity-70">
                <span>{formatWhen(meeting.startsAt)}</span>
                <span>{meeting.durationMinutes} min</span>
                {meeting.location && <span>{meeting.location}</span>}
              </div>

              {meeting.attendees?.length > 0 && (
                <p className="mt-2 text-xs opacity-60">With: {meeting.attendees.join(", ")}</p>
              )}
              {meeting.notes && <p className="mt-2 text-sm opacity-70">{meeting.notes}</p>}
            </div>

            <div className="flex shrink-0 gap-2">
              <button className={btnGhost} onClick={() => startEdit(meeting)}>Edit</button>
              <button className={btnDanger} onClick={() => handleDelete(meeting.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
