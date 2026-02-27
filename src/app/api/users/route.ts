import { getActiveUsers, trackUser } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(getActiveUsers());
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { profile_id } = body;

  if (!profile_id || typeof profile_id !== "string") {
    return NextResponse.json(
      { error: "profile_id is required" },
      { status: 400 }
    );
  }

  trackUser(profile_id);
  return NextResponse.json({ ok: true });
}
