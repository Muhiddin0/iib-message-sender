import { requireApiUser } from "@/lib/auth/session";
import { campaignRepository } from "@/lib/repositories/campaign-repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  const { id } = await context.params;
  await campaignRepository.getOwnedRecord(user.id, id);

  const encoder = new TextEncoder();
  let cleanup: (() => void) | undefined;
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let sending = false;
      let lastPayload = "";
      const send = async () => {
        if (closed || sending) return;
        sending = true;
        try {
          const detail = await campaignRepository.getDetail(user.id, id);
          const payload = JSON.stringify(detail);
          if (payload !== lastPayload && !closed) {
            lastPayload = payload;
            controller.enqueue(encoder.encode(`event: snapshot\ndata: ${payload}\n\n`));
          }
        } catch {
          if (!closed) controller.enqueue(encoder.encode("event: error\ndata: {}\n\n"));
        } finally {
          sending = false;
        }
      };
      const polling = setInterval(() => void send(), 2_000);
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 15_000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(polling);
        clearInterval(heartbeat);
      };
      request.signal.addEventListener("abort", cleanup, { once: true });
      await send();
    },
    cancel() {
      cleanup?.();
    },
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
