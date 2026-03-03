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

export const handle = async ({ event, resolve }: any) => {
  event.locals.sessionToken = getSessionToken(event.cookies);
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

    if (event.locals.sessionToken && !isCsrfExemptPath(event.url.pathname)) {
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
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
};
