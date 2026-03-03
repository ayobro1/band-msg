import { getCsrfToken, getSessionToken } from "$lib/server/auth";
import { getUserBySession } from "$lib/server/db";

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const GET = async ({ cookies }: any) => {
  if (process.env.AUTH_DEBUG !== "true") {
    return toJson({ error: "not found" }, 404);
  }

  const sessionToken = getSessionToken(cookies);
  const csrfToken = getCsrfToken(cookies);
  const user = sessionToken ? await getUserBySession(sessionToken) : null;

  return toJson({
    authDebugEnabled: true,
    hasSessionCookie: Boolean(sessionToken),
    hasCsrfCookie: Boolean(csrfToken),
    authenticated: Boolean(user),
    user: user
      ? {
          id: user.id,
          username: user.username,
          role: user.role,
          status: user.status
        }
      : null
  });
};
