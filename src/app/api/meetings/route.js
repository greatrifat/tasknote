import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { badRequest, serialize, serverError } from "@/lib/api";
import { validateMeeting } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");

    const filter = {};
    if (q) filter.title = { $regex: q, $options: "i" };

    const meetings = await getCollection("meetings");
    const docs = await meetings.find(filter).sort({ startsAt: 1 }).toArray();
    return NextResponse.json(docs.map(serialize));
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { errors, data } = validateMeeting(body);
    if (errors.length) return badRequest(errors.join("; "));

    const now = new Date();
    const meetings = await getCollection("meetings");
    const result = await meetings.insertOne({
      ...data,
      location: data.location ?? "",
      notes: data.notes ?? "",
      createdAt: now,
      updatedAt: now,
    });

    const created = await meetings.findOne({ _id: result.insertedId });
    return NextResponse.json(serialize(created), { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}
