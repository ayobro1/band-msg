import { getSessionUser } from "$lib/server/db";

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const GET = async ({ locals }: any) => {
  try {
    if (!locals.sessionToken) {
      return toJson({ error: "unauthorized" }, 401);
    }

    const user = await getSessionUser(locals.sessionToken);

    if (!user) {
      return toJson({ error: "unauthorized" }, 401);
    }

    return toJson(user);
  } catch (error: any) {
    const expose = process.env.AUTH_DEBUG === "true";
    return toJson(
      {
        error: expose
          ? `Auth check failed: ${error?.message ?? "unknown server error"}`
          : "Auth check failed due to server configuration"
      },
      500
    );
  }
};
