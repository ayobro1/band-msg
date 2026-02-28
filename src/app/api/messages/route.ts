import {
  addMessage,
  broadcastTyping,
  channelExists,
  getMessagesByChannel,
  trackUser,
} from "@/lib/store";
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

  const msg = addMessage(content, channel_id, user.username);
  trackUser(user.username);
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
