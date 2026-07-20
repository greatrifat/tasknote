export const TASK_STATUSES = ["todo", "in-progress", "done"];
export const TASK_PRIORITIES = ["low", "medium", "high"];
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
 * Validates a task payload. `partial` skips required-field checks so the same
 * rules can back both POST and PATCH.
 * Returns { errors: string[], data: object }.
 */
export function validateTask(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  if (!partial || body.title !== undefined) {
    const title = str(body.title);
    if (!title) errors.push("title is required");
    else if (title.length > 200) errors.push("title must be 200 characters or fewer");
    else data.title = title;
  }

  if (body.description !== undefined) {
    const description = str(body.description);
    if (description.length > 5000) errors.push("description must be 5000 characters or fewer");
    else data.description = description;
  }

  if (body.status !== undefined) {
    const status = str(body.status);
    if (!TASK_STATUSES.includes(status)) errors.push(`status must be one of: ${TASK_STATUSES.join(", ")}`);
    else data.status = status;
  } else if (!partial) {
    data.status = "todo";
  }

  if (body.priority !== undefined) {
    const priority = str(body.priority);
    if (!TASK_PRIORITIES.includes(priority)) errors.push(`priority must be one of: ${TASK_PRIORITIES.join(", ")}`);
    else data.priority = priority;
  } else if (!partial) {
    data.priority = "medium";
  }

  if (body.dueDate !== undefined) {
    const raw = str(body.dueDate);
    if (!raw) {
      data.dueDate = null;
    } else {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) errors.push("dueDate must be a valid date");
      else data.dueDate = parsed;
    }
  } else if (!partial) {
    data.dueDate = null;
  }

  return { errors, data };
}

/**
 * Validates a meeting payload. Same partial/full contract as validateTask.
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

  if (body.location !== undefined) {
    const location = str(body.location);
    if (location.length > 200) errors.push("location must be 200 characters or fewer");
    else data.location = location;
  }

  if (body.attendees !== undefined) {
    // Accept either an array or a comma-separated string from the form.
    const raw = Array.isArray(body.attendees) ? body.attendees : str(body.attendees).split(",");
    const attendees = raw.map((a) => str(a)).filter(Boolean);
    if (attendees.length > 50) errors.push("attendees must be 50 entries or fewer");
    else data.attendees = attendees;
  } else if (!partial) {
    data.attendees = [];
  }

  optionalText(body, "notes", 10000, errors, data);

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
