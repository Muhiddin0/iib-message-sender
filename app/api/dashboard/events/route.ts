import { requireApiUser } from "@/lib/auth/session";
import { createPocketBaseAdmin } from "@/lib/pocketbase/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await requireApiUser();
  const encoder = new TextEncoder();
  let cleanup: (() => void) | undefined;
  const stream = new ReadableStream({
    async start(controller) {
      const pb = await createPocketBaseAdmin();
      let closed = false;
      let checking = false;
      let fingerprint = "";
      const filter = pb.filter("user = {:user}", { user: user.id });
      const check = async () => {
        if (closed || checking) return;
        checking = true;
        try {
          const [campaigns, activities] = await Promise.all([
            pb.collection("campaigns").getList(1, 1, { filter, sort: "-updated", fields: "id,updated" }),
            pb.collection("activities").getList(1, 1, { filter, sort: "-updated", fields: "id,updated" }),
          ]);
          const next = JSON.stringify([campaigns.items[0] ?? null, activities.items[0] ?? null]);
          if (fingerprint && next !== fingerprint && !closed) {
            controller.enqueue(encoder.encode("event: update\ndata: {}\n\n"));
          }
          fingerprint = next;
        } catch {
          // A temporary PocketBase failure is retried on the next polling tick.
        } finally {
          checking = false;
        }
      };
      await check();
      const polling = setInterval(() => void check(), 2_000);
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
    },
    cancel() { cleanup?.(); },
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
