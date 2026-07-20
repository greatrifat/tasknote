import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { badRequest, serialize, serverError } from "@/lib/api";
import { validateNote } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const tag = searchParams.get("tag");

    const filter = {};
    // Search titles and bodies together — hunting a note by a phrase inside it
    // is at least as common as remembering its title.
    if (q) filter.$or = [
      { title: { $regex: q, $options: "i" } },
      { content: { $regex: q, $options: "i" } },
    ];
    if (tag) filter.tags = tag;

    const notes = await getCollection("notes");
    // Pinned first, then most recently touched.
    const docs = await notes.find(filter).sort({ pinned: -1, updatedAt: -1 }).toArray();
    return NextResponse.json(docs.map(serialize));
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { errors, data } = validateNote(body);
    if (errors.length) return badRequest(errors.join("; "));

    const now = new Date();
    const notes = await getCollection("notes");
    const result = await notes.insertOne({
      content: "",
      ...data,
      createdAt: now,
      updatedAt: now,
    });

    const created = await notes.findOne({ _id: result.insertedId });
    return NextResponse.json(serialize(created), { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}
