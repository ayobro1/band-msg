import { NextRequest, NextResponse } from "next/server";
import { AuthUser } from "./types";
import { verifyJwt } from "./jwt";

export const SESSION_COOKIE = "band_chat_session";

function unauthorized(message = "Unauthorized", status = 401) {
  return NextResponse.json({ error: message }, { status });
}

export function getSessionToken(request: NextRequest): string | undefined {
  return request.cookies.get(SESSION_COOKIE)?.value;
}

export function getRequestUser(request: NextRequest): AuthUser | null {
  const token = getSessionToken(request);
  if (!token) return null;
  const payload = verifyJwt(token);
  if (!payload) return null;
  return {
    username: payload.sub,
    role: payload.role as AuthUser["role"],
    status: payload.status as AuthUser["status"],
  };
}

export function requireApprovedUser(request: NextRequest): AuthUser | NextResponse {
  const user = getRequestUser(request);
  if (!user) {
    return unauthorized();
  }
  if (user.status !== "approved") {
    return unauthorized("Account is not approved", 403);
  }
  return user;
}

export function requireAdmin(request: NextRequest): AuthUser | NextResponse {
  const user = requireApprovedUser(request);
  if (user instanceof NextResponse) {
    return user;
  }
  if (user.role !== "admin") {
    return unauthorized("Admin access required", 403);
  }
  return user;
}
