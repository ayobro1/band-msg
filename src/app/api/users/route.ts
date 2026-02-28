import { getActiveUsers, trackUser } from "@/lib/store";
import { requireApprovedUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const user = requireApprovedUser(request);
  if (user instanceof NextResponse) {
    return user;
  }

  return NextResponse.json(getActiveUsers());
}

export async function POST(request: NextRequest) {
  const user = requireApprovedUser(request);
  if (user instanceof NextResponse) {
    return user;
  }

  trackUser(user.username);
  return NextResponse.json({ ok: true });
}
