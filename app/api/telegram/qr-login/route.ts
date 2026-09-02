import { requireApiUser } from "@/lib/auth/session";
import { AppError, toErrorResponse } from "@/lib/errors";
import { telegramService } from "@/lib/telegram/service";

export const dynamic = "force-dynamic";

function safeError(error: unknown) {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }
  return { code: "INTERNAL_ERROR", message: "Kutilmagan xatolik yuz berdi." };
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const encoder = new TextEncoder();
    let abortController: AbortController | undefined;

    const stream = new ReadableStream({
      start(controller) {
        let closed = false;
        abortController = new AbortController();
        const send = (event: object) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            closed = true;
          }
        };
        const close = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            // The browser may have already cancelled the response stream.
          }
        };
        const abort = () => abortController?.abort(request.signal.reason);
        request.signal.addEventListener("abort", abort, { once: true });
        if (request.signal.aborted) abort();

        void telegramService.authorizeWithQr(user.id, {
          signal: abortController.signal,
          onUrlUpdated(url, expiresAt) {
            send({ state: "qr_pending", url, expiresAt: expiresAt.toISOString() });
          },
          onQrScanned() {
            send({ state: "qr_scanned" });
          },
        }).then((result) => {
          send(result);
          close();
        }).catch((error) => {
          if (!abortController?.signal.aborted) send({ state: "error", error: safeError(error) });
          close();
        }).finally(() => {
          request.signal.removeEventListener("abort", abort);
        });
      },
      cancel() {
        abortController?.abort();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
