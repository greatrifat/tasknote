export const MEETING_SOURCES = ["manual", "voicetotext"];

function str(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Collects an optional free-text field, pushing a length error rather than
 * silently truncating — a half-stored transcript is worse than a rejected one.
 */
function optionalText(body, key, max, errors, data) {
  if (body[key] === undefined) return;
  const value = str(body[key]);
  if (value.length > max) errors.push(`${key} must be ${max} characters or fewer`);
  else data[key] = value;
}

/** Optional absolute URL. Empty clears the field. */
function optionalUrl(body, key, errors, data) {
  if (body[key] === undefined) return;
  const value = str(body[key]);
  if (!value) {
    data[key] = "";
  } else if (!/^https?:\/\//i.test(value) || value.length > 2000) {
    errors.push(`${key} must be an http(s) URL of 2000 characters or fewer`);
  } else {
    data[key] = value;
  }
}

/**
 * Validates a note payload. `partial` skips required-field checks so the same
 * rules can back both POST and PATCH.
 * Returns { errors: string[], data: object }.
 */
export function validateNote(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  if (!partial || body.title !== undefined) {
    const title = str(body.title);
    if (!title) errors.push("title is required");
    else if (title.length > 200) errors.push("title must be 200 characters or fewer");
    else data.title = title;
  }

  // The body of the note. Generous ceiling — a note is the long-form field here.
  optionalText(body, "content", 50000, errors, data);

  if (body.tags !== undefined) {
    // Accept either an array or a comma-separated string from the form.
    const raw = Array.isArray(body.tags) ? body.tags : str(body.tags).split(",");
    const tags = raw.map((t) => str(t)).filter(Boolean);
    if (tags.length > 20) errors.push("tags must be 20 entries or fewer");
    else if (tags.some((t) => t.length > 40)) errors.push("each tag must be 40 characters or fewer");
    else data.tags = tags;
  } else if (!partial) {
    data.tags = [];
  }

  if (body.pinned !== undefined) {
    if (typeof body.pinned !== "boolean") errors.push("pinned must be true or false");
    else data.pinned = body.pinned;
  } else if (!partial) {
    data.pinned = false;
  }

  return { errors, data };
}

/**
 * Validates a meeting payload. Same partial/full contract as validateNote.
 */
export function validateMeeting(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  if (!partial || body.title !== undefined) {
    const title = str(body.title);
    if (!title) errors.push("title is required");
    else if (title.length > 200) errors.push("title must be 200 characters or fewer");
    else data.title = title;
  }

  if (!partial || body.startsAt !== undefined) {
    const raw = str(body.startsAt);
    if (!raw) {
      errors.push("startsAt is required");
    } else {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) errors.push("startsAt must be a valid date/time");
      else data.startsAt = parsed;
    }
  }

  if (body.durationMinutes !== undefined) {
    const n = Number(body.durationMinutes);
    if (!Number.isInteger(n) || n < 1 || n > 1440) {
      errors.push("durationMinutes must be a whole number between 1 and 1440");
    } else {
      data.durationMinutes = n;
    }
  } else if (!partial) {
    data.durationMinutes = 30;
  }

  // Topical tags. Supplied by the client, or generated from the transcript when
  // absent — see autoTags in the meetings route.
  if (body.tags !== undefined) {
    // Accept either an array or a comma-separated string from the form.
    const raw = Array.isArray(body.tags) ? body.tags : str(body.tags).split(",");
    const tags = raw.map((t) => str(t)).filter(Boolean);
    if (tags.length > 20) errors.push("tags must be 20 entries or fewer");
    else if (tags.some((t) => t.length > 40)) errors.push("each tag must be 40 characters or fewer");
    else data.tags = tags;
  }

  // --- recording fields, written by VoiceToText -----------------------------
  // A whole meeting transcript is far longer than hand-typed notes, so it gets
  // its own field and its own ceiling instead of being crammed into `notes`.
  optionalText(body, "transcript", 500000, errors, data);
  optionalText(body, "summary", 50000, errors, data);
  optionalUrl(body, "folderUrl", errors, data);
  optionalUrl(body, "audioUrl", errors, data);
  optionalUrl(body, "transcriptUrl", errors, data);

  if (body.source !== undefined) {
    const source = str(body.source);
    if (!MEETING_SOURCES.includes(source)) {
      errors.push(`source must be one of: ${MEETING_SOURCES.join(", ")}`);
    } else {
      data.source = source;
    }
  } else if (!partial) {
    data.source = "manual";
  }

  // Stable per-device id. The recorder may retry a post whose response was lost,
  // so POST upserts on this rather than creating a second copy of the meeting.
  if (body.externalId !== undefined) {
    const externalId = str(body.externalId);
    if (externalId.length > 200) errors.push("externalId must be 200 characters or fewer");
    else if (externalId) data.externalId = externalId;
  }

  return { errors, data };
}
