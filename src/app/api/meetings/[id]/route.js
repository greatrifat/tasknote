import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { badRequest, notFound, serialize, serverError, toObjectId } from "@/lib/api";
import { validateMeeting } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const _id = toObjectId(id);
    if (!_id) return badRequest("Invalid id");

    const meetings = await getCollection("meetings");
    const doc = await meetings.findOne({ _id });
    if (!doc) return notFound("Meeting not found");
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
    const { errors, data } = validateMeeting(body, { partial: true });
    if (errors.length) return badRequest(errors.join("; "));
    if (!Object.keys(data).length) return badRequest("No valid fields to update");

    const meetings = await getCollection("meetings");
    const updated = await meetings.findOneAndUpdate(
      { _id },
      { $set: { ...data, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
    if (!updated) return notFound("Meeting not found");
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

    const meetings = await getCollection("meetings");
    const result = await meetings.deleteOne({ _id });
    if (!result.deletedCount) return notFound("Meeting not found");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
