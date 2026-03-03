import {
  createCsrfToken,
  getCsrfToken,
  getSessionToken,
  setCsrfCookie
} from "./lib/server/auth";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isApiMutation(event: any): boolean {
  return (
    event.url.pathname.startsWith("/api/") &&
    MUTATING_METHODS.has(event.request.method.toUpperCase())
  );
}

function isCsrfExemptPath(pathname: string): boolean {
  return pathname === "/api/auth/login" || pathname === "/api/auth/register";
}

function getBearerSessionToken(request: Request): string | null {
  const value = request.headers.get("authorization") || "";
  if (!value.toLowerCase().startsWith("bearer ")) return null;
  const token = value.slice(7).trim();
  return token || null;
}

export const handle = async ({ event, resolve }: any) => {
  const cookieSessionToken = getSessionToken(event.cookies);
  const headerSessionToken = getBearerSessionToken(event.request);
  const usingHeaderSession = !cookieSessionToken && !!headerSessionToken;

  event.locals.sessionToken = cookieSessionToken ?? headerSessionToken;
  event.locals.sessionFromHeader = usingHeaderSession;

  const csrfToken = getCsrfToken(event.cookies) ?? createCsrfToken();
  event.locals.csrfToken = csrfToken;
  if (!getCsrfToken(event.cookies)) {
    setCsrfCookie(event.cookies, csrfToken);
  }

  if (isApiMutation(event)) {
    const origin = event.request.headers.get("origin");
    if (origin && origin !== event.url.origin) {
      return new Response(JSON.stringify({ error: "Invalid origin" }), {
        status: 403,
        headers: { "content-type": "application/json" }
      });
    }

    if (event.locals.sessionToken && !usingHeaderSession && !isCsrfExemptPath(event.url.pathname)) {
      const tokenHeader = event.request.headers.get("x-csrf-token");
      const cookieToken = getCsrfToken(event.cookies);
      if (!tokenHeader || !cookieToken || tokenHeader !== cookieToken) {
        return new Response(JSON.stringify({ error: "CSRF validation failed" }), {
          status: 403,
          headers: { "content-type": "application/json" }
        });
      }
    }
  }

  const response = await resolve(event);
  
  // Security Headers
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  
  // Content Security Policy - allows inline scripts/styles for Svelte
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'", // Svelte needs inline scripts
    "style-src 'self' 'unsafe-inline'", // Svelte needs inline styles
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; ");
  response.headers.set("Content-Security-Policy", csp);
  
  // HSTS - Force HTTPS (only in production)
  if (event.url.protocol === "https:") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  
  return response;
};
