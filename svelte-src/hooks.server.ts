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

  // Get user info from session token if available
  if (event.locals.sessionToken) {
    try {
      const { ConvexHttpClient } = await import('convex/browser');
      const convex = new ConvexHttpClient(process.env.VITE_CONVEX_URL || '');
      const { api } = await import('../convex/_generated/api');
      
      const user = await convex.query(api.auth.getUser, { 
        sessionToken: event.locals.sessionToken 
      });
      
      if (user) {
        event.locals.user = user;
      }
    } catch (error) {
      console.error('[Hooks] Failed to get user:', error);
    }
  }

  // Always ensure CSRF token exists
  let csrfToken = getCsrfToken(event.cookies);
  if (!csrfToken) {
    csrfToken = createCsrfToken();
    setCsrfCookie(event.cookies, csrfToken);
  }
  event.locals.csrfToken = csrfToken;

  if (isApiMutation(event)) {
    const origin = event.request.headers.get("origin");
    if (origin && origin !== event.url.origin) {
      console.error('CSRF: Invalid origin', { origin, expected: event.url.origin });
      return new Response(JSON.stringify({ error: "Invalid origin" }), {
        status: 403,
        headers: { "content-type": "application/json" }
      });
    }

    // Only validate CSRF for cookie-based sessions (not header-based)
    if (event.locals.sessionToken && !usingHeaderSession && !isCsrfExemptPath(event.url.pathname)) {
      const tokenHeader = event.request.headers.get("x-csrf-token");
      const cookieToken = getCsrfToken(event.cookies);
      
      if (!tokenHeader) {
        console.error('CSRF: No token in header');
        return new Response(JSON.stringify({ error: "CSRF token missing" }), {
          status: 403,
          headers: { "content-type": "application/json" }
        });
      }
      
      if (!cookieToken) {
        console.error('CSRF: No token in cookie');
        return new Response(JSON.stringify({ error: "CSRF cookie missing" }), {
          status: 403,
          headers: { "content-type": "application/json" }
        });
      }
      
      if (tokenHeader !== cookieToken) {
        console.error('CSRF: Token mismatch', { header: tokenHeader.substring(0, 10), cookie: cookieToken.substring(0, 10) });
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
  
  // Content Security Policy - allows Firebase, Convex and external resources
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://www.gstatic.com https://va.vercel-scripts.com", // Allow Firebase and Vercel scripts
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:", // Allow images from any HTTPS source
    "font-src 'self'",
    "connect-src 'self' https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com https://fcm.googleapis.com https://va.vercel-scripts.com https://oceanic-barracuda-40.convex.cloud https://oceanic-barracuda-40.convex.site wss://oceanic-barracuda-40.convex.cloud wss://ws-us3.pusher.com https://sockjs-us3.pusher.com", // Allow Firebase, Convex, Pusher API calls and WebSockets
    "media-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self' blob:" // Allow service workers
  ].join("; ");
  response.headers.set("Content-Security-Policy", csp);
  
  // HSTS - Force HTTPS (only in production)
  if (event.url.protocol === "https:") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  
  return response;
};
