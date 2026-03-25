let cachedHashPromise: Promise<string> | null = null;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hashText(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toBase64Url(new Uint8Array(digest));
}

export function getBrowserUserAgentHash(): Promise<string> {
  if (!cachedHashPromise) {
    const userAgent = typeof navigator === "undefined" ? "unknown" : navigator.userAgent || "unknown";
    cachedHashPromise = hashText(userAgent);
  }

  return cachedHashPromise;
}
