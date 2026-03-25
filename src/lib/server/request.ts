import crypto from "node:crypto";

export function getClientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;

  const xff = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (xff) return xff;

  return "unknown";
}

export function getSessionBinding(request: Request): string {
  const userAgent = request.headers.get("user-agent")?.trim() || "";
  const language = request.headers.get("accept-language")?.trim() || "";
  const platform = request.headers.get("sec-ch-ua-platform")?.trim() || "";
  const mobileHint = request.headers.get("sec-ch-ua-mobile")?.trim() || "";

  return crypto
    .createHash("sha256")
    .update([userAgent, language, platform, mobileHint].join("|"))
    .digest("hex");
}

export async function delayMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
