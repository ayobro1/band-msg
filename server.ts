/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="./src/types/bun-globals.d.ts" />
import http from "node:http";
import { parse } from "node:url";
import next from "next";

// Default to production mode; dev mode must be explicitly set to avoid Turbopack subprocess issues
const dev = process.env.NODE_ENV === "development";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT ?? "3000", 10);

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
  })
  .on("error", (err: NodeJS.ErrnoException) => {
    console.error(`HTTP server error (${err.code}): ${err.message}`);
    process.exit(1);
  });
