import { addChannel, deleteChannel, getChannelsForUser } from "@/lib/store";
import { requireAdmin, requireApprovedUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const user = requireApprovedUser(request);
  if (user instanceof NextResponse) {
    return user;
  }
  return NextResponse.json(getChannelsForUser(user.username, user.role));
}

export async function POST(request: NextRequest) {
  const admin = requireAdmin(request);
  if (admin instanceof NextResponse) {
    return admin;
  }

  const body = await request.json();
  const { name, description, visibility, allowed_users } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  const channel = addChannel(
    name,
    description ?? "",
    visibility === "private" ? "private" : "public",
    Array.isArray(allowed_users) ? allowed_users : []
  );
  if (!channel) {
    return NextResponse.json(
      { error: "Invalid name or channel already exists" },
      { status: 409 }
    );
  }

  return NextResponse.json(channel, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const admin = requireAdmin(request);
  if (admin instanceof NextResponse) {
    return admin;
  }

  const body = await request.json().catch(() => ({} as { channel_id?: string }));
  const channelId = typeof body.channel_id === "string" ? body.channel_id : "";

  if (!channelId) {
    return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
  }

  const removed = deleteChannel(channelId);
  if (!removed) {
    return NextResponse.json({ error: "channel not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
