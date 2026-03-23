import { ConvexHttpClient } from "convex/browser";
import { ensureServerEnv } from "./env";

export function getConvexUrl(): string {
  ensureServerEnv();

  const url =
    process.env.CONVEX_URL ||
    process.env.PUBLIC_CONVEX_URL ||
    process.env.VITE_CONVEX_URL ||
    "";

  if (!url) {
    throw new Error(
      "Missing CONVEX_URL (server) / PUBLIC_CONVEX_URL (client). Set it in your environment."
    );
  }

  return url;
}

export function getConvexHttpClient(): ConvexHttpClient {
  return new ConvexHttpClient(getConvexUrl());
}

