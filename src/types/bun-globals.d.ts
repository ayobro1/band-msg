// Minimal Bun global type declarations for server.ts
// These are overridden by @types/bun when installed via `bun install`.

declare namespace Bun {
  interface ServeOptions {
    hostname?: string;
    port?: number;
    fetch(req: Request, server: Server): Response | undefined | Promise<Response | undefined>;
    websocket?: WebSocketHandler;
  }

  interface Server {
    upgrade(req: Request): boolean;
  }

  interface WebSocketHandler {
    open?(ws: ServerWebSocket): void;
    message?(ws: ServerWebSocket, message: string | ArrayBuffer): void;
    close?(ws: ServerWebSocket): void;
  }

  interface ServerWebSocket {
    send(data: string | ArrayBuffer): void;
    readonly readyState: number;
  }

  function serve(options: ServeOptions): Server;
}
