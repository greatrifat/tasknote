import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { badRequest, serialize, serverError } from "@/lib/api";
import { validateTask } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const q = searchParams.get("q");

    const filter = {};
    if (status) filter.status = status;
    if (q) filter.title = { $regex: q, $options: "i" };

    const tasks = await getCollection("tasks");
    const docs = await tasks.find(filter).sort({ createdAt: -1 }).toArray();
    return NextResponse.json(docs.map(serialize));
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { errors, data } = validateTask(body);
    if (errors.length) return badRequest(errors.join("; "));

    const now = new Date();
    const tasks = await getCollection("tasks");
    const result = await tasks.insertOne({
      ...data,
      description: data.description ?? "",
      createdAt: now,
      updatedAt: now,
    });

    const created = await tasks.findOne({ _id: result.insertedId });
    return NextResponse.json(serialize(created), { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}
