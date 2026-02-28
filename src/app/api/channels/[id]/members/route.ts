import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { setChannelMembers, getChannelMembers } from "@/lib/store";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const members = getChannelMembers(id);
  return NextResponse.json(members);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const body = await request.json();
  const { usernames } = body;

  if (!Array.isArray(usernames)) {
    return NextResponse.json(
      { error: "usernames array is required" },
      { status: 400 }
    );
  }

  setChannelMembers(id, usernames);
  return NextResponse.json({ ok: true });
}
