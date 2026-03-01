import next from "next";
import { createServer } from "node:http";
import { verifyJwt } from "./src/lib/jwt";

const dev = process.env.NODE_ENV !== "production";
const WS_PORT = parseInt(process.env.WS_PORT || "3001", 10);
const HTTP_PORT = parseInt(process.env.PORT || "3000", 10);
const SESSION_COOKIE = "band_chat_session";

// Initialize WebSocket clients set on globalThis
interface WsClient { send: (data: string) => void; readyState: number }
declare global {
  var __wsClients: Set<WsClient>;
}
globalThis.__wsClients = globalThis.__wsClients || new Set();

// Start Next.js
const app = next({ dev, hostname: "localhost", port: HTTP_PORT });
const handle = app.getRequestHandler();
await app.prepare();

const httpServer = createServer((req, res) => {
  handle(req, res);
});

httpServer.listen(HTTP_PORT, () => {
  console.log(`> Next.js ready on http://localhost:${HTTP_PORT}`);
});

// Parse cookies from header string
function parseCookies(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx > 0) {
      result[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    }
  }
  return result;
}

// Start WebSocket server using Bun.serve
interface WsData {
  username: string;
}

Bun.serve<WsData>({
  port: WS_PORT,
  fetch(req, server) {
    const cookies = parseCookies(req.headers.get("cookie") || "");
    const token = cookies[SESSION_COOKIE];
    const payload = verifyJwt(token);

    if (!payload || payload.status !== "approved") {
      return new Response("Unauthorized", { status: 401 });
    }

    if (server.upgrade(req, { data: { username: payload.sub } })) {
      return undefined;
    }

    return new Response("WebSocket upgrade failed", { status: 426 });
  },
  websocket: {
    open(ws) {
      globalThis.__wsClients.add(ws);
    },
    close(ws) {
      globalThis.__wsClients.delete(ws);
    },
    message() {
      // No client-to-server messages expected
    },
  },
});

console.log(`> WebSocket server on ws://localhost:${WS_PORT}`);
