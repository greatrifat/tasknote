import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { badRequest, serialize, serverError } from "@/lib/api";
import { validateMeeting } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const source = searchParams.get("source");

    const filter = {};
    if (q) filter.title = { $regex: q, $options: "i" };
    if (source) filter.source = source;

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

    // Text fields default to "" on create so every document has the same shape.
    const blanks = {
      location: "",
      notes: "",
      transcript: "",
      summary: "",
      folderUrl: "",
      audioUrl: "",
      transcriptUrl: "",
    };

    // A recorder whose POST succeeded but whose response was lost will send the
    // same externalId again; upserting means that retry updates the meeting
    // instead of creating a duplicate.
    if (data.externalId) {
      // Only fields actually present in the request are written. Defaulting the
      // absent ones here instead would let a retry that omits `transcript`
      // erase the transcript already stored.
      const onInsert = Object.fromEntries(
        Object.entries(blanks).filter(([key]) => data[key] === undefined)
      );
      const updated = await meetings.findOneAndUpdate(
        { externalId: data.externalId },
        { $set: { ...data, updatedAt: now }, $setOnInsert: { ...onInsert, createdAt: now } },
        { upsert: true, returnDocument: "after" }
      );
      return NextResponse.json(serialize(updated), { status: 201 });
    }

    const result = await meetings.insertOne({
      ...blanks,
      ...data,
      createdAt: now,
      updatedAt: now,
    });
    const created = await meetings.findOne({ _id: result.insertedId });
    return NextResponse.json(serialize(created), { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}
