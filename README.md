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
| `/notes` | Note table; "Add note" button opens the create/edit dialog |
| `/meetings` | Meeting table; "Add meeting" button opens the create/edit dialog |

## API

All endpoints return JSON. Errors use `{ "error": "message" }` with a 400/404/500 status.

### Notes — `notes` collection

| Method | Route | Notes |
| --- | --- | --- |
| `GET` | `/api/notes` | Pinned first, then newest; supports `?q=` (title **and** body) and `?tag=` |
| `POST` | `/api/notes` | Creates a note |
| `GET` | `/api/notes/:id` | Single note |
| `PATCH` | `/api/notes/:id` | Partial update |
| `DELETE` | `/api/notes/:id` | Removes a note |

Fields: `title` (required, ≤200), `content` (≤50000), `tags` (array or
comma-separated string, ≤20 entries of ≤40 chars), `pinned` (boolean,
default false).

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
