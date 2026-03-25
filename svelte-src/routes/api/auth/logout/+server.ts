import {
  clearSessionCookie,
  getRequestUserAgentHash,
  getSessionToken
} from "$lib/server/auth";
import { api } from "../../../../../convex/_generated/api";
import { getConvexHttpClient } from "$lib/server/convex";
import { logoutSession } from "$lib/server/db";

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const POST = async ({ cookies, request }: any) => {
  const sessionToken = getSessionToken(cookies);
  if (sessionToken) {
    try {
      const convex = await getConvexHttpClient();
      await convex.mutation(api.auth.removeSession, {
        sessionToken,
        userAgentHash: getRequestUserAgentHash(request)
      });
    } catch (error) {
      console.error("[Logout] Failed to remove Convex session:", error);
    }

    await logoutSession(sessionToken);
  }

  clearSessionCookie(cookies);
  return toJson({ ok: true });
};
