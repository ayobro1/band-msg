import { removeCalendarEvent } from "@/lib/store";
import { requireApprovedUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = requireApprovedUser(request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const removed = removeCalendarEvent(id);
  if (!removed) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
