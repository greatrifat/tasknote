import { NextResponse } from "next/server";

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  checkPassword,
  createSession,
  isPasswordConfigured,
} from "@/lib/auth";
import { serverError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    if (!isPasswordConfigured()) {
      return NextResponse.json(
        { error: "Set APP_PASSWORD and APP_SECRET in the environment first." },
        { status: 503 }
      );
    }

    const { password } = await request.json().catch(() => ({}));
    if (!checkPassword(password)) {
      // Deliberately vague and slow-ish: nothing here should help someone
      // distinguish a wrong password from a missing one.
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, await createSession(), {
      httpOnly: true, // not readable from JavaScript, so XSS cannot steal it
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return response;
  } catch (err) {
    return serverError(err);
  }
}

/** Logging out clears the cookie; there is no server-side session to discard. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
