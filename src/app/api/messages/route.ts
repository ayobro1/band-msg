import { channels, messages, addMessage } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const channelId = request.nextUrl.searchParams.get("channelId");
  if (!channelId) {
    return NextResponse.json(
      { error: "channelId is required" },
      { status: 400 }
    );
  }
  const filtered = messages.filter((m) => m.channel_id === channelId);
  return NextResponse.json(filtered);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { content, channel_id, profile_id } = body;

  if (!content || !channel_id) {
    return NextResponse.json(
      { error: "content and channel_id are required" },
      { status: 400 }
    );
  }

  if (!channels.some((c) => c.id === channel_id)) {
    return NextResponse.json(
      { error: "channel not found" },
      { status: 404 }
    );
  }

  const msg = addMessage(content, channel_id, profile_id ?? "anonymous");
  return NextResponse.json(msg, { status: 201 });
}
