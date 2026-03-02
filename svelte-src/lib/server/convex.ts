import { ConvexHttpClient } from "convex/browser";

export function getConvexClient() {
  const convexUrl = process.env.CONVEX_URL ?? process.env.PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("Missing CONVEX_URL (or PUBLIC_CONVEX_URL) environment variable");
  }
  return new ConvexHttpClient(convexUrl);
}
