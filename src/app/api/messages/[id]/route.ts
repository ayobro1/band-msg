import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { addAuditLog, canAccessChannel, deleteMessage } from "@/lib/store";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = requireApprovedUser(request);
  if (user instanceof NextResponse) {
    return user;
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "message id is required" }, { status: 400 });
  }

  const result = deleteMessage(id, user.username, user.role);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.code });
  }

  if (!canAccessChannel(result.channel_id, user.username, user.role)) {
    return NextResponse.json({ error: "access denied" }, { status: 403 });
  }

  addAuditLog(user.username, "message_unsent", "message", id, `Unsent message in channel ${result.channel_id}`);

  return NextResponse.json({ ok: true });
}
