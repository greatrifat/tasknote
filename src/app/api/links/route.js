import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { badRequest, serialize, serverError } from "@/lib/api";
import { validateLink } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** Escapes a user's query so regex characters are matched literally. */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const tag = searchParams.get("tag");

    const filter = {};
    if (q) {
      // The URL is searched too: half-remembering a domain is at least as
      // common as remembering what the link was called.
      const rx = { $regex: escapeRegex(q), $options: "i" };
      filter.$or = [{ title: rx }, { url: rx }, { note: rx }, { tags: rx }];
    }
    if (tag) filter.tags = tag;

    const links = await getCollection("links");
    const docs = await links.find(filter).sort({ createdAt: -1 }).toArray();
    return NextResponse.json(docs.map(serialize));
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { errors, data } = validateLink(body);
    if (errors.length) return badRequest(errors.join("; "));

    const now = new Date();
    const links = await getCollection("links");
    const result = await links.insertOne({
      note: "",
      ...data,
      createdAt: now,
      updatedAt: now,
    });

    const created = await links.findOne({ _id: result.insertedId });
    return NextResponse.json(serialize(created), { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}
