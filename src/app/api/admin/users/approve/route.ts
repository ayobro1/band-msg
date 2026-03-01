import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { addAuditLog, approveUser } from "@/lib/store";

export async function POST(request: NextRequest) {
  const admin = requireAdmin(request);
  if (admin instanceof NextResponse) {
    return admin;
  }

  const body = await request.json();
  const { username } = body;

  if (typeof username !== "string") {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }

  const result = approveUser(username);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.code });
  }

  addAuditLog(admin.username, "user_approved", "user", result.user.username, "Approved pending account");

  return NextResponse.json(result.user);
}
