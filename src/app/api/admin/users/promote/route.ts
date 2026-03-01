import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { addAuditLog, promoteUserToAdmin } from "@/lib/store";

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

  const result = promoteUserToAdmin(username);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.code });
  }

  addAuditLog(admin.username, "user_promoted", "user", result.user.username, "Promoted user to admin");

  return NextResponse.json(result.user);
}
