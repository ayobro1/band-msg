import crypto from "node:crypto";
import { ensureServerEnv } from "./env";

export const SESSION_COOKIE = "band_chat_session";
export const CSRF_COOKIE = "band_chat_csrf";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function resolveSecureCookie(): boolean {
  ensureServerEnv();
  const mode = (process.env.AUTH_COOKIE_SECURE ?? "auto").toLowerCase();
  if (mode === "true") return true;
  if (mode === "false") return false;
  return process.env.NODE_ENV === "production";
}

function resolveSameSiteCookie(): "strict" | "lax" | "none" {
  ensureServerEnv();
  const mode = (process.env.AUTH_COOKIE_SAME_SITE ?? "lax").toLowerCase();
  if (mode === "strict") return "strict";
  if (mode === "none") return "none";
  return "lax";
}

export function getSessionToken(cookies: any): string | null {
  return cookies.get(SESSION_COOKIE) ?? null;
}

export function createSessionToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export function createCsrfToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function getCsrfToken(cookies: any): string | null {
  return cookies.get(CSRF_COOKIE) ?? null;
}

export function setCsrfCookie(cookies: any, token: string): void {
  cookies.set(CSRF_COOKIE, token, {
    httpOnly: false, // Must be false so JavaScript can read it
    secure: resolveSecureCookie(),
    sameSite: resolveSameSiteCookie(),
    path: "/",
    maxAge: SESSION_TTL_MS / 1000
  });
}

export function expiresAtMs(): number {
  return Date.now() + SESSION_TTL_MS;
}

export function setSessionCookie(cookies: any, token: string): void {
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: resolveSecureCookie(),
    sameSite: resolveSameSiteCookie(),
    path: "/",
    maxAge: SESSION_TTL_MS / 1000
  });
}

export function clearSessionCookie(cookies: any): void {
  cookies.delete(SESSION_COOKIE, {
    path: "/",
    httpOnly: true,
    secure: resolveSecureCookie(),
    sameSite: resolveSameSiteCookie()
  });
}

export async function hashPassword(password: string, salt?: string): Promise<{ salt: string; hash: string }> {
  const chosenSalt = salt ?? crypto.randomBytes(16).toString("hex");
  const derived = crypto.pbkdf2Sync(password, chosenSalt, 210000, 64, "sha512").toString("hex");
  return { salt: chosenSalt, hash: derived };
}
