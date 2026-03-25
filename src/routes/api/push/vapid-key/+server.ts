import { ensureServerEnv } from "$lib/server/env";

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const GET = async () => {
  ensureServerEnv();
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;

  if (!vapidPublicKey) {
    return toJson({ error: "Push notifications not configured" }, 503);
  }

  return toJson({ publicKey: vapidPublicKey });
};
