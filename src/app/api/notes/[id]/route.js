import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { badRequest, notFound, serialize, serverError, toObjectId } from "@/lib/api";
import { validateNote } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const _id = toObjectId(id);
    if (!_id) return badRequest("Invalid id");

    const notes = await getCollection("notes");
    const doc = await notes.findOne({ _id });
    if (!doc) return notFound("Note not found");
    return NextResponse.json(serialize(doc));
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const _id = toObjectId(id);
    if (!_id) return badRequest("Invalid id");

    const body = await request.json();
    const { errors, data } = validateNote(body, { partial: true });
    if (errors.length) return badRequest(errors.join("; "));
    if (!Object.keys(data).length) return badRequest("No valid fields to update");

    const notes = await getCollection("notes");
    const updated = await notes.findOneAndUpdate(
      { _id },
      { $set: { ...data, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
    if (!updated) return notFound("Note not found");
    return NextResponse.json(serialize(updated));
  } catch (err) {
    return serverError(err);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const _id = toObjectId(id);
    if (!_id) return badRequest("Invalid id");

    const notes = await getCollection("notes");
    const result = await notes.deleteOne({ _id });
    if (!result.deletedCount) return notFound("Note not found");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
