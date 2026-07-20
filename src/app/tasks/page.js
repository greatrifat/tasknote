"use client";

import { useCallback, useEffect, useState } from "react";
import { btnDanger, btnGhost, btnPrimary, card, input, label } from "@/components/ui";

const STATUSES = ["todo", "in-progress", "done"];
const PRIORITIES = ["low", "medium", "high"];

const EMPTY = { title: "", description: "", status: "todo", priority: "medium", dueDate: "" };

const STATUS_STYLES = {
  todo: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
  "in-progress": "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  done: "bg-green-500/15 text-green-600 dark:text-green-300",
};

const PRIORITY_STYLES = {
  low: "opacity-60",
  medium: "text-amber-600 dark:text-amber-400",
  high: "text-red-600 dark:text-red-400",
};

// <input type="date"> wants YYYY-MM-DD; the API hands back a full ISO string.
function toDateInput(iso) {
  return iso ? iso.slice(0, 10) : "";
}

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks${filter ? `?status=${filter}` : ""}`);
      if (!res.ok) throw new Error("Failed to load tasks");
      setTasks(await res.json());
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

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
      const res = await fetch(editingId ? `/api/tasks/${editingId}` : "/api/tasks", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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

  function startEdit(task) {
    setEditingId(task.id);
    setForm({
      title: task.title || "",
      description: task.description || "",
      status: task.status || "todo",
      priority: task.priority || "medium",
      dueDate: toDateInput(task.dueDate),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id) {
    if (!confirm("Delete this task?")) return;
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      if (editingId === id) resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleDone(task) {
    const next = task.status === "done" ? "todo" : "done";
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
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
      <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>

      <form onSubmit={handleSubmit} className={`${card} mt-6`}>
        <h2 className="mb-4 font-medium">{editingId ? "Edit task" : "New task"}</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label} htmlFor="title">Title</label>
            <input id="title" className={input} value={form.title} onChange={set("title")} required maxLength={200} />
          </div>

          <div className="sm:col-span-2">
            <label className={label} htmlFor="description">Description</label>
            <textarea id="description" rows={3} className={input} value={form.description} onChange={set("description")} />
          </div>

          <div>
            <label className={label} htmlFor="status">Status</label>
            <select id="status" className={input} value={form.status} onChange={set("status")}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className={label} htmlFor="priority">Priority</label>
            <select id="priority" className={input} value={form.priority} onChange={set("priority")}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div>
            <label className={label} htmlFor="dueDate">Due date</label>
            <input id="dueDate" type="date" className={input} value={form.dueDate} onChange={set("dueDate")} />
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving ? "Saving…" : editingId ? "Update task" : "Add task"}
          </button>
          {editingId && (
            <button type="button" className={btnGhost} onClick={resetForm}>Cancel</button>
          )}
        </div>
      </form>

      <div className="mt-8 flex items-center gap-2">
        <span className="text-sm opacity-60">Filter:</span>
        {["", ...STATUSES].map((s) => (
          <button
            key={s || "all"}
            onClick={() => setFilter(s)}
            className={filter === s ? btnPrimary : btnGhost}
          >
            {s || "all"}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {loading && <p className="opacity-60">Loading…</p>}
        {!loading && tasks.length === 0 && <p className="opacity-60">No tasks yet.</p>}

        {tasks.map((task) => (
          <div key={task.id} className={`${card} flex items-start gap-4`}>
            <input
              type="checkbox"
              className="mt-1 size-4 cursor-pointer"
              checked={task.status === "done"}
              onChange={() => toggleDone(task)}
              aria-label={`Mark ${task.title} as done`}
            />

            <div className="min-w-0 flex-1">
              <h3 className={`font-medium ${task.status === "done" ? "line-through opacity-50" : ""}`}>
                {task.title}
              </h3>
              {task.description && <p className="mt-1 text-sm opacity-70">{task.description}</p>}

              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                <span className={`rounded px-2 py-0.5 ${STATUS_STYLES[task.status] || ""}`}>{task.status}</span>
                <span className={PRIORITY_STYLES[task.priority] || ""}>{task.priority} priority</span>
                {task.dueDate && <span className="opacity-60">due {toDateInput(task.dueDate)}</span>}
              </div>
            </div>

            <div className="flex shrink-0 gap-2">
              <button className={btnGhost} onClick={() => startEdit(task)}>Edit</button>
              <button className={btnDanger} onClick={() => handleDelete(task.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
