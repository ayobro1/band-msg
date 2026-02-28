import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { addReaction, getReactionsForMessages } from "@/lib/store";

export async function POST(request: NextRequest) {
  const user = requireApprovedUser(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const { message_id, gif_url, gif_id } = body;

  if (!message_id || !gif_url || !gif_id) {
    return NextResponse.json(
      { error: "message_id, gif_url, and gif_id are required" },
      { status: 400 }
    );
  }

  const reaction = addReaction(message_id, user.username, gif_url, gif_id);
  return NextResponse.json(reaction, { status: 201 });
}

export async function GET(request: NextRequest) {
  const user = requireApprovedUser(request);
  if (user instanceof NextResponse) return user;

  const messageId = request.nextUrl.searchParams.get("message_id");
  if (!messageId) {
    return NextResponse.json(
      { error: "message_id is required" },
      { status: 400 }
    );
  }

  const reactions = getReactionsForMessages([messageId]);
  return NextResponse.json(reactions.get(messageId) ?? []);
}
