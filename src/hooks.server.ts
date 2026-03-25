import { clearSessionCookie, createCsrfToken, getCsrfToken, getSessionToken, setCsrfCookie } from "./lib/server/auth";
import { getSessionUser } from "./lib/server/db";
import { getSessionBinding } from "./lib/server/request";

function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

export const handle = async ({ event, resolve }: any) => {
  const rawSessionToken = getSessionToken(event.cookies);
  event.locals.sessionBinding = getSessionBinding(event.request);
  event.locals.sessionToken = null;
  event.locals.sessionFromHeader = false;
  let csrfToken = getCsrfToken(event.cookies);

  if (!csrfToken) {
    csrfToken = createCsrfToken();
    setCsrfCookie(event.cookies, csrfToken);
  }

  event.locals.csrfToken = csrfToken;

  if (rawSessionToken) {
    const user = await getSessionUser(rawSessionToken, event.locals.sessionBinding);
    if (user) {
      event.locals.sessionToken = rawSessionToken;
      event.locals.user = user;
    } else {
      clearSessionCookie(event.cookies);
    }
  }

  if (!isSafeMethod(event.request.method) && event.url.pathname.startsWith("/api/")) {
    const origin = event.request.headers.get("origin");
    const referer = event.request.headers.get("referer") || "";
    const csrfHeader = event.request.headers.get("x-csrf-token");
    const sameOrigin =
      origin === event.url.origin ||
      (origin === null && referer.startsWith(`${event.url.origin}/`));

    if (!sameOrigin || csrfHeader !== csrfToken) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" }
      });
    }
  }

  const response = await resolve(event);

  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (event.url.protocol === "https:") {
    response.headers.set("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }

  if ((response.headers.get("content-type") || "").includes("text/html")) {
    response.headers.set(
      "Content-Security-Policy",
      "base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"
    );
  }

  return response;
};
