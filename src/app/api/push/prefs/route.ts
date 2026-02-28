import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { getNotificationPrefs, setNotificationPrefs } from "@/lib/store";

export async function GET(request: NextRequest) {
  const user = requireApprovedUser(request);
  if (user instanceof NextResponse) return user;

  const prefs = getNotificationPrefs(user.username);
  return NextResponse.json(prefs);
}

export async function PUT(request: NextRequest) {
  const user = requireApprovedUser(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const { enabled, muted_channels } = body;

  if (typeof enabled !== "boolean" || !Array.isArray(muted_channels)) {
    return NextResponse.json(
      { error: "enabled (boolean) and muted_channels (string[]) are required" },
      { status: 400 }
    );
  }

  setNotificationPrefs(user.username, enabled, muted_channels);
  return NextResponse.json({ ok: true });
}
