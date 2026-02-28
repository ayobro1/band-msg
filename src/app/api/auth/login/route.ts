import { NextRequest, NextResponse } from "next/server";
import { loginUser } from "@/lib/store";
import { SESSION_COOKIE } from "@/lib/auth";

function resolveSecureCookie(request: NextRequest): boolean {
  const mode = (process.env.AUTH_COOKIE_SECURE ?? "auto").toLowerCase();
  if (mode === "true") return true;
  if (mode === "false") return false;

  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    .trim()
    .toLowerCase();

  return forwardedProto === "https" || request.nextUrl.protocol === "https:";
}

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
    secure: resolveSecureCookie(request),
    path: "/",
    maxAge: 24 * 60 * 60,
  });

  return response;
}
