import {
  addMessage,
  broadcastTyping,
  channelExists,
  canAccessChannel,
  getMessagesByChannel,
  trackUser,
} from "@/lib/store";
import { sendPushNotifications } from "@/lib/push";
import { requireApprovedUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const user = requireApprovedUser(request);
  if (user instanceof NextResponse) {
    return user;
  }

  const channelId = request.nextUrl.searchParams.get("channelId");
  if (!channelId) {
    return NextResponse.json(
      { error: "channelId is required" },
      { status: 400 }
    );
  }

  if (!canAccessChannel(channelId, user.username, user.role)) {
    return NextResponse.json({ error: "access denied" }, { status: 403 });
  }

  return NextResponse.json(getMessagesByChannel(channelId));
}

export async function POST(request: NextRequest) {
  const user = requireApprovedUser(request);
  if (user instanceof NextResponse) {
    return user;
  }

  const body = await request.json();
  const { content, channel_id } = body;

  if (!content || !channel_id) {
    return NextResponse.json(
      { error: "content and channel_id are required" },
      { status: 400 }
    );
  }

  if (!channelExists(channel_id)) {
    return NextResponse.json(
      { error: "channel not found" },
      { status: 404 }
    );
  }

  if (!canAccessChannel(channel_id, user.username, user.role)) {
    return NextResponse.json({ error: "access denied" }, { status: 403 });
  }

  const msg = addMessage(content, channel_id, user.username);
  trackUser(user.username);

  // Send push notifications in background (non-blocking)
  sendPushNotifications(user.username, channel_id, content).catch(() => {});

  return NextResponse.json(msg, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const user = requireApprovedUser(request);
  if (user instanceof NextResponse) {
    return user;
  }

  const body = await request.json();
  const { channel_id } = body;

  if (!channel_id) {
    return NextResponse.json(
      { error: "channel_id is required" },
      { status: 400 }
    );
  }

  broadcastTyping(channel_id, user.username);
  return NextResponse.json({ ok: true });
}
