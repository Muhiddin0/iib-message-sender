import { randomUUID } from "node:crypto";

import { requireApiUser } from "@/lib/auth/session";
import { AppError, toErrorResponse } from "@/lib/errors";
import { telegramRepository } from "@/lib/repositories/telegram-repository";

export async function POST() {
  try {
    const user = await requireApiUser();
    const account = await telegramRepository.getAccountRecord(user.id);
    if (!account) throw new AppError("TELEGRAM_UNAUTHORIZED", "Avval Telegram hisobini ulang.", 409);
    const pending = await telegramRepository.getPendingSyncJob(account.id);
    const job = pending ?? await telegramRepository.enqueueJob({
      userId: user.id,
      accountId: account.id,
      type: "sync_chats",
      idempotencyKey: `sync:${account.id}:${randomUUID()}`,
    });
    return Response.json({ queued: true, jobId: job.id, alreadyQueued: Boolean(pending) }, { status: 202 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
