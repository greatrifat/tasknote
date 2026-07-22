import { NextResponse } from "next/server";

import { serverError } from "@/lib/api";
import { getSettings, saveSettings } from "@/lib/settings";
import { isPasswordConfigured } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Keys are returned in full rather than masked, which is only defensible
 * because this route sits behind the password gate. `protected` tells the page
 * whether that gate is actually switched on, so it can warn when it is not.
 */
export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({ ...settings, protected: isPasswordConfigured() });
  } catch (err) {
    return serverError(err);
  }
}

export async function PUT(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const saved = await saveSettings({
      geminiKey: body.geminiKey,
      groqKey: body.groqKey,
    });
    return NextResponse.json({ ...saved, protected: isPasswordConfigured() });
  } catch (err) {
    return serverError(err);
  }
}
