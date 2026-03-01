import { addSseClient, removeSseClient } from "@/lib/store";
import { requireApprovedUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const user = requireApprovedUser(request);
  if (user instanceof NextResponse) return user;

  const encoder = new TextEncoder();
  let ctrl: ReadableStreamDefaultController<Uint8Array> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      ctrl = controller;
      controller.enqueue(encoder.encode(": connected\n\n"));
      addSseClient(controller);
    },
    cancel() {
      if (ctrl) removeSseClient(ctrl);
    },
  });

  request.signal.addEventListener("abort", () => {
    if (ctrl) removeSseClient(ctrl);
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
