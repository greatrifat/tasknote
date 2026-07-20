# TaskNote

A Next.js + MongoDB app with CRUD for **tasks** and **meetings**.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in your MONGODB_URI
npm run dev
```

Open http://localhost:3000.

## Environment

| Variable | Description |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string (Atlas SRV or local) |
| `MONGODB_DB` | Database name, defaults to `tasknote` |

## Pages

| Route | Description |
| --- | --- |
| `/` | Landing page |
| `/tasks` | Task list, create/edit form, status filter, done toggle |
| `/meetings` | Meeting list with create/edit form |

## API

All endpoints return JSON. Errors use `{ "error": "message" }` with a 400/404/500 status.

### Tasks — `tasks` collection

| Method | Route | Notes |
| --- | --- | --- |
| `GET` | `/api/tasks` | Supports `?status=` and `?q=` (title regex) |
| `POST` | `/api/tasks` | Creates a task |
| `GET` | `/api/tasks/:id` | Single task |
| `PATCH` | `/api/tasks/:id` | Partial update |
| `DELETE` | `/api/tasks/:id` | Removes a task |

Fields: `title` (required, ≤200), `description` (≤5000), `status`
(`todo` \| `in-progress` \| `done`), `priority` (`low` \| `medium` \| `high`),
`dueDate` (date or null).

### Meetings — `meetings` collection

| Method | Route | Notes |
| --- | --- | --- |
| `GET` | `/api/meetings` | Sorted by `startsAt`; supports `?q=` and `?source=` |
| `POST` | `/api/meetings` | Creates a meeting |
| `GET` | `/api/meetings/:id` | Single meeting |
| `PATCH` | `/api/meetings/:id` | Partial update |
| `DELETE` | `/api/meetings/:id` | Removes a meeting |

Fields: `title` (required, ≤200), `startsAt` (required, date/time),
`durationMinutes` (1–1440, default 30), `location` (≤200), `attendees`
(array or comma-separated string, ≤50), `notes` (≤10000).

Recording fields, written by the VoiceToText app after it transcribes a meeting
and uploads it to Drive: `transcript` (≤500000), `summary` (≤50000), and the
http(s) links `folderUrl`, `audioUrl`, `transcriptUrl` (≤2000 each).
`source` is `manual` (default) or `voicetotext`.

`externalId` (≤200) is an optional stable id from the recording device. When
present, `POST` **upserts** on it rather than inserting, so a client retrying a
post whose response was lost updates the existing meeting instead of creating a
duplicate. An upsert only writes the fields present in the request, so a retry
that omits `transcript` will not erase the stored one.

Both resources get server-set `createdAt` / `updatedAt`, and `_id` is
serialized to a string `id` in every response.
