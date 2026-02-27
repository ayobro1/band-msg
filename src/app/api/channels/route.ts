import { channels, addChannel } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(channels);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, description } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  const channel = addChannel(name, description ?? "");
  if (!channel) {
    return NextResponse.json(
      { error: "Invalid name or channel already exists" },
      { status: 409 }
    );
  }

  return NextResponse.json(channel, { status: 201 });
}
