import { removePracticeDay } from "@/lib/store";
import { requireApprovedUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = requireApprovedUser(request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const removed = removePracticeDay(id);
  if (!removed) {
    return NextResponse.json({ error: "Practice day not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
