import { createThreadChannel } from "@/lib/store";
import { requireApprovedUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const user = requireApprovedUser(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const { message_id, channel_id } = body as { message_id?: string; channel_id?: string };

  if (!message_id || !channel_id) {
    return NextResponse.json(
      { error: "message_id and channel_id are required" },
      { status: 400 }
    );
  }

  const thread = createThreadChannel(message_id, channel_id);
  if (!thread) {
    return NextResponse.json(
      { error: "Failed to create thread" },
      { status: 500 }
    );
  }

  return NextResponse.json(thread, { status: 201 });
}
