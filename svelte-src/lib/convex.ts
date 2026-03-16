import { ConvexClient } from "convex/browser";
import { PUBLIC_CONVEX_URL } from "$env/static/public";

export const convex = new ConvexClient(PUBLIC_CONVEX_URL || "https://oceanic-barracuda-40.convex.cloud");
