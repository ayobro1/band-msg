import { subscribe } from "@/lib/store";
import { NextRequest } from "next/server";
import { requireApprovedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = requireApprovedUser(request);
  if (user instanceof Response) {
    return user;
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const unsubscribe = subscribe((event) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
      });

      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(interval);
          unsubscribe();
        }
      }, 15000);

      cleanup = () => {
        clearInterval(interval);
        unsubscribe();
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
