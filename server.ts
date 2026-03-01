/// <reference path="./src/types/bun-globals.d.ts" />
import http from "node:http";
import { parse } from "node:url";
import next from "next";
import { addWsClient, removeWsClient, type WsClient } from "./src/lib/store";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT ?? "3000", 10);
const wsPort = parseInt(process.env.WS_PORT ?? "3001", 10);

// ─── Next.js app (Node.js http – Bun compatible) ───────────
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

http
  .createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    handle(req, res, parsedUrl);
  })
  .listen(port, hostname, () => {
    console.log(`> Next.js ready on http://${hostname}:${port}`);
  });

// ─── WebSocket server (Bun.serve) ──────────────────────────
Bun.serve({
  hostname,
  port: wsPort,
  fetch(req: Request, server: Bun.Server) {
    if (server.upgrade(req)) return undefined;
    return new Response("WebSocket upgrade required", { status: 426 });
  },
  websocket: {
    open(ws: Bun.ServerWebSocket) {
      const client: WsClient = {
        send: (data: string) => ws.send(data),
        get readyState() {
          return ws.readyState;
        },
      };
      (ws as unknown as { _client: WsClient })._client = client;
      addWsClient(client);
    },
    message(_ws: Bun.ServerWebSocket, _message: string | ArrayBuffer) {
      // Clients don't send meaningful messages; ignore
    },
    close(ws: Bun.ServerWebSocket) {
      const client = (ws as unknown as { _client: WsClient })._client;
      if (client) removeWsClient(client);
    },
  },
});

console.log(`> WebSocket server ready on ws://${hostname}:${wsPort}`);
