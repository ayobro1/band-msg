import { clearSessionCookie, getSessionToken } from "$lib/server/auth";
import { logoutSession } from "$lib/server/db";

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const POST = async ({ cookies }: any) => {
  const sessionToken = getSessionToken(cookies);
  if (sessionToken) {
    await logoutSession(sessionToken);
  }

  clearSessionCookie(cookies);
  return toJson({ ok: true });
};
