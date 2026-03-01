import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { demoteAdminToMember } from "@/lib/store";

export async function POST(request: NextRequest) {
  const admin = requireAdmin(request);
  if (admin instanceof NextResponse) {
    return admin;
  }

  const body = await request.json().catch(() => ({} as { username?: unknown }));
  const username = typeof body.username === "string" ? body.username : "";

  if (!username) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }

  if (username.toLowerCase() === admin.username.toLowerCase()) {
    return NextResponse.json({ error: "You cannot demote yourself" }, { status: 400 });
  }

  const result = demoteAdminToMember(username);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.code });
  }

  return NextResponse.json(result.user);
}
