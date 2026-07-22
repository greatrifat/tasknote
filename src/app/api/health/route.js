import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Public liveness check, exempt from the password gate.
 *
 * VoiceToText's settings screen needs to confirm a pasted URL actually points
 * at TaskNote. It used to do that with GET /api/meetings, which the gate now
 * refuses — correctly, since that would mean handing out transcripts. This says
 * "yes, this is TaskNote, and it is up" and nothing else, so it is safe to
 * leave open.
 */
export async function GET() {
  return NextResponse.json({ ok: true, app: "tasknote" });
}
