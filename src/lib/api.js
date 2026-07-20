import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

// Mongo's ObjectId and Date don't survive JSON cleanly — flatten them so the
// client always sees plain strings.
export function serialize(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  const out = { id: _id.toString(), ...rest };
  for (const [k, v] of Object.entries(out)) {
    if (v instanceof Date) out[k] = v.toISOString();
  }
  return out;
}

export function toObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

export function badRequest(message) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function serverError(err) {
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
