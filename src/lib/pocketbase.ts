import PocketBase from "pocketbase";

const pocketbaseUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "";

export const pb = pocketbaseUrl
  ? new PocketBase(pocketbaseUrl)
  : (new Proxy({} as PocketBase, {
      get: () => () => {
        throw new Error(
          "PocketBase client not configured. Please set NEXT_PUBLIC_POCKETBASE_URL environment variable."
        );
      },
    }) as PocketBase);
