import { NextRequest, NextResponse } from "next/server";
import { loginUser } from "@/lib/store";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { username, password } = body;

  if (typeof username !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "username and password are required" }, { status: 400 });
  }

  const result = loginUser(username, password);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.code });
  }

  const response = NextResponse.json(result.user);
  response.cookies.set({
    name: SESSION_COOKIE,
    value: result.token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 24 * 60 * 60,
  });

  return response;
}
