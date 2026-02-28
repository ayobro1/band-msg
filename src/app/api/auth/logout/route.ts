import { NextRequest, NextResponse } from "next/server";
import { getSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { logoutSession } from "@/lib/store";

export async function POST(request: NextRequest) {
  const token = getSessionToken(request);
  logoutSession(token);

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
  });

  return response;
}
