import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "@/lib/store";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { username, password } = body;

  if (typeof username !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "username and password are required" }, { status: 400 });
  }

  const result = registerUser(username, password);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.code });
  }

  return NextResponse.json(result.user, { status: 201 });
}
