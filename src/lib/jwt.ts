import crypto from "node:crypto";

const JWT_SECRET = process.env.JWT_SECRET ?? "change-me-in-production";
const JWT_EXPIRY_S = 24 * 60 * 60; // 24 hours

interface JwtPayload {
  sub: string; // username
  role: string;
  status: string;
  iat: number;
  exp: number;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

function base64urlDecode(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

export function signJwt(sub: string, role: string, status: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub,
      role,
      status,
      iat: now,
      exp: now + JWT_EXPIRY_S,
    } satisfies JwtPayload)
  );
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest();
  return `${header}.${payload}.${base64url(signature)}`;
}

export function verifyJwt(
  token: string
): { sub: string; role: string; status: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, payload, sig] = parts;
    const expected = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest();

    const actual = base64urlDecode(sig);
    if (!crypto.timingSafeEqual(expected, actual)) return null;

    const data: JwtPayload = JSON.parse(
      base64urlDecode(payload).toString("utf8")
    );

    if (data.exp < Math.floor(Date.now() / 1000)) return null;

    return { sub: data.sub, role: data.role, status: data.status };
  } catch {
    return null;
  }
}
