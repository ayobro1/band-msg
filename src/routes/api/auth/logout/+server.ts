import { clearSessionCookie } from "$lib/server/auth";
import { logoutSession } from "$lib/server/db";
import { getSessionBinding } from "$lib/server/request";
import { api } from "../../../../../convex/_generated/api";
import { getConvexHttpClient } from "$lib/server/convex";

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const POST = async ({ cookies, locals, request }: any) => {
  const sessionToken = locals.sessionToken;
  const sessionBinding = getSessionBinding(request);
  if (sessionToken) {
    await Promise.allSettled([
      logoutSession(sessionToken, sessionBinding),
      getConvexHttpClient().then((convex) =>
        convex.mutation(api.auth.removeSession, { sessionToken, userAgentHash: sessionBinding })
      )
    ]);
  }

  clearSessionCookie(cookies);
  return toJson({ ok: true });
};
