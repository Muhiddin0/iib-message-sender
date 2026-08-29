import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { randomUUID } from "node:crypto";

import { getWorkerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { CampaignRecord, DeliveryRecord, TelegramJobRecord } from "@/lib/pocketbase/records";
import { campaignRepository } from "@/lib/repositories/campaign-repository";
import { telegramRepository } from "@/lib/repositories/telegram-repository";
import { telegramService } from "@/lib/telegram/service";

const workerId = `osing-${process.pid}-${randomUUID().slice(0, 8)}`;
let stopping = false;

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function safeMessage(error: unknown) {
  return error instanceof AppError ? error.message : "Fon jarayonida kutilmagan xatolik yuz berdi.";
}

function event(name: string, data: Record<string, string | number> = {}) {
  console.info(JSON.stringify({ time: new Date().toISOString(), worker: workerId, event: name, ...data }));
}

async function syncChats(job: TelegramJobRecord) {
  const account = await telegramRepository.getAccountRecord(job.user);
  if (!account || account.id !== job.account) throw new AppError("TELEGRAM_UNAUTHORIZED", "Telegram hisobi topilmadi.", 401);
  const chats = await telegramService.getChats(job.user);
  await telegramRepository.syncChats(job.user, account.id, chats);
  await campaignRepository.addActivity({
    userId: job.user,
    type: "chats_synced",
    message: `${chats.length} ta guruh va kanal sinxronlandi.`,
    tone: "success",
  });
  event("chats_synced", { userId: job.user, count: chats.length });
}

async function createMediaFile(campaign: CampaignRecord) {
  const bytes = await campaignRepository.downloadMedia(campaign);
  if (!bytes) return null;
  const env = getWorkerEnv();
  const max = campaign.kind === "photo" ? env.TELEGRAM_MAX_PHOTO_BYTES : env.TELEGRAM_MAX_VIDEO_BYTES;
  if (bytes.byteLength > max) throw new AppError("VALIDATION_ERROR", "Media fayli ruxsat etilgan hajmdan katta.", 400);
  const directory = await mkdtemp(join(tmpdir(), "osing-media-"));
  await mkdir(directory, { recursive: true });
  const extension = extname(basename(campaign.media)).slice(0, 10) || (campaign.kind === "photo" ? ".jpg" : ".mp4");
  const path = join(directory, `upload${extension}`);
  await writeFile(path, bytes, { mode: 0o600 });
  return { directory, path };
}

async function markSendError(job: TelegramJobRecord, campaign: CampaignRecord, delivery: DeliveryRecord, error: unknown) {
  const appError = error instanceof AppError ? error : new AppError("TELEGRAM_TEMPORARY", safeMessage(error), 503);
  if (appError.code === "TELEGRAM_FLOOD_WAIT") {
    const retryAfter = Math.max(30, appError.retryAfterSeconds ?? 60);
    const notBefore = new Date(Date.now() + retryAfter * 1000).toISOString();
    await campaignRepository.setDeliveryStatus(delivery.id, "flood_wait", {
      not_before: notBefore,
      error_code: appError.code,
      error_message: appError.message,
    });
    await campaignRepository.setCampaignStatus(campaign.id, "flood_wait", { last_error: appError.message });
    await telegramRepository.waitJob(job.id, notBefore, appError.message);
    await campaignRepository.addActivity({
      userId: job.user,
      campaignId: campaign.id,
      deliveryId: delivery.id,
      type: "flood_wait",
      message: `Telegram cheklovi sabab yuborish ${retryAfter} soniyaga pauza qilindi.`,
      tone: "warning",
    });
    event("flood_wait", { campaignId: campaign.id, retryAfter });
    return "pause" as const;
  }

  const status =
    appError.code === "TELEGRAM_UNAUTHORIZED"
      ? "unauthorized"
      : appError.code === "TELEGRAM_PERMISSION_DENIED"
        ? "permission_denied"
        : "failed";
  await campaignRepository.setDeliveryStatus(delivery.id, status, {
    error_code: appError.code,
    error_message: appError.message,
  });
  if (status === "unauthorized" && job.account) {
    await telegramRepository.updateAccountStatus(job.account, "session_expired", "Telegram sessiyasini qayta ulash kerak.");
  }
  await campaignRepository.addActivity({
    userId: job.user,
    campaignId: campaign.id,
    deliveryId: delivery.id,
    type: "delivery_failed",
    message: `${delivery.chat_title} — ${appError.message}`,
    tone: "danger",
  });
  event("delivery_failed", { campaignId: campaign.id, deliveryId: delivery.id, code: appError.code });
  return "continue" as const;
}

async function sendOne(job: TelegramJobRecord, campaign: CampaignRecord, delivery: DeliveryRecord, mediaPath?: string) {
  await campaignRepository.setDeliveryStatus(delivery.id, "sending", { error_code: "", error_message: "" });
  try {
    const message = campaign.source_message_link
      ? await telegramService.forwardMessage({
          userId: job.user,
          peerId: delivery.telegram_peer_id,
          sourceMessageLink: campaign.source_message_link,
          randomIdHex: delivery.telegram_random_id,
        })
      : await telegramService.sendMessage({
          userId: job.user,
          peerId: delivery.telegram_peer_id,
          kind: campaign.kind,
          body: campaign.body,
          mediaPath,
          randomIdHex: delivery.telegram_random_id,
        });
    await campaignRepository.setDeliveryStatus(delivery.id, "sent", {
      telegram_message_id: String(message.id),
      telegram_message_link: message.link ?? "",
      sent_at: new Date().toISOString(),
      not_before: "",
      error_code: "",
      error_message: "",
    });
    await campaignRepository.addActivity({
      userId: job.user,
      campaignId: campaign.id,
      deliveryId: delivery.id,
      type: "delivery_sent",
      message: campaign.source_message_link
        ? `${delivery.chat_title} chatiga forward qilindi.`
        : `${delivery.chat_title} chatiga yuborildi.`,
      tone: "success",
    });
    event("delivery_sent", { campaignId: campaign.id, deliveryId: delivery.id });
    return "continue" as const;
  } catch (error) {
    return markSendError(job, campaign, delivery, error);
  }
}

async function sendCampaign(job: TelegramJobRecord) {
  if (!job.campaign) throw new AppError("NOT_FOUND", "Kampaniya topilmadi.", 404);
  const campaign = await campaignRepository.getOwnedRecord(job.user, job.campaign);
  if (["completed", "partial", "failed", "cancelled"].includes(campaign.status)) return;
  await campaignRepository.setCampaignStatus(campaign.id, "sending", {
    started_at: campaign.started_at || new Date().toISOString(),
    last_error: "",
  });
  const mediaFile = campaign.source_message_link || campaign.kind === "text" ? null : await createMediaFile(campaign);
  const env = getWorkerEnv();
  let paused = false;
  try {
    const deliveries = await campaignRepository.listRunnableDeliveries(campaign.id);
    for (let index = 0; index < deliveries.length && !paused; index += env.TELEGRAM_SEND_CONCURRENCY) {
      const batch = deliveries.slice(index, index + env.TELEGRAM_SEND_CONCURRENCY);
      const outcomes = await Promise.all(
        batch.map((delivery) => sendOne(job, campaign, delivery, mediaFile?.path)),
      );
      paused = outcomes.includes("pause");
      await campaignRepository.recount(campaign.id);
      if (!paused && index + batch.length < deliveries.length) await wait(env.TELEGRAM_SEND_DELAY_MS);
    }

    const result = await campaignRepository.recount(campaign.id);
    if (paused) return;
    if (result.pending > 0) {
      await telegramRepository.waitJob(job.id, new Date(Date.now() + 30_000).toISOString(), "Keyingi yuborish oynasi kutilmoqda.");
      return;
    }
    await campaignRepository.addActivity({
      userId: job.user,
      campaignId: campaign.id,
      type: "campaign_finished",
      message: `Kampaniya yakunlandi: ${result.sent} yuborildi, ${result.failed} xato.`,
      tone: result.failed === 0 ? "success" : result.sent > 0 ? "warning" : "danger",
    });
    await campaignRepository.clearMedia(campaign.id).catch(() => undefined);
    await telegramRepository.enqueueJob({
      userId: job.user,
      accountId: job.account,
      campaignId: campaign.id,
      type: "refresh_analytics",
      idempotencyKey: `analytics:${campaign.id}:initial`,
      notBefore: new Date(Date.now() + 30_000).toISOString(),
    });
  } finally {
    if (mediaFile) await rm(mediaFile.directory, { recursive: true, force: true });
  }
}

async function refreshAnalytics(job: TelegramJobRecord) {
  if (!job.campaign) throw new AppError("NOT_FOUND", "Kampaniya topilmadi.", 404);
  await campaignRepository.getOwnedRecord(job.user, job.campaign);
  const deliveries = await campaignRepository.listSentDeliveries(job.campaign);
  for (const delivery of deliveries) {
    try {
      const metrics = await telegramService.getMessageMetrics(
        job.user,
        delivery.telegram_peer_id,
        delivery.telegram_message_id,
      );
      await campaignRepository.updateMetrics(delivery.id, metrics);
    } catch (error) {
      if (error instanceof AppError && error.code === "TELEGRAM_FLOOD_WAIT") {
        const notBefore = new Date(Date.now() + (error.retryAfterSeconds ?? 60) * 1000).toISOString();
        await telegramRepository.waitJob(job.id, notBefore, error.message);
        return;
      }
      if (error instanceof AppError && error.code === "TELEGRAM_UNAUTHORIZED") {
        if (job.account) {
          await telegramRepository.updateAccountStatus(job.account, "session_expired", error.message);
        }
        throw error;
      }
    }
    await wait(300);
  }
  event("analytics_refreshed", { campaignId: job.campaign, count: deliveries.length });
}

async function processJob(job: TelegramJobRecord) {
  event("job_started", { jobId: job.id, type: job.type });
  if (job.type === "sync_chats") await syncChats(job);
  else if (job.type === "send_campaign") await sendCampaign(job);
  else if (job.type === "refresh_analytics") await refreshAnalytics(job);
  else if (job.type === "disconnect") await telegramService.disconnect(job.user);
}

async function run() {
  const { TELEGRAM_WORKER_POLL_MS } = getWorkerEnv();
  event("worker_started");
  while (!stopping) {
    const next = await telegramRepository.getNextJob();
    if (!next) {
      await wait(TELEGRAM_WORKER_POLL_MS);
      continue;
    }
    let job: TelegramJobRecord | null = null;
    try {
      job = await telegramRepository.claimJob(next.id, workerId);
      await processJob(job);
      const current = await telegramRepository.getJob(job.id);
      // Flood control may have already put this job back into the queue.
      if (current.status === "running") await telegramRepository.completeJob(job.id);
    } catch (error) {
      const message = safeMessage(error);
      if (job) {
        if (error instanceof AppError && error.code === "TELEGRAM_FLOOD_WAIT") {
          const retryAfter = Math.max(30, error.retryAfterSeconds ?? 60);
          const notBefore = new Date(Date.now() + retryAfter * 1000).toISOString();
          await telegramRepository.waitJob(job.id, notBefore, message).catch(() => undefined);
          event("job_waiting", { jobId: job.id, type: job.type, retryAfter });
          continue;
        }
        if (job.type === "send_campaign" && job.campaign) {
          await campaignRepository.failPending(job.campaign, "WORKER_FAILURE", message).catch(() => undefined);
          await campaignRepository.clearMedia(job.campaign).catch(() => undefined);
        }
        if (job.type === "sync_chats" && job.account) {
          const status = error instanceof AppError && error.code === "TELEGRAM_UNAUTHORIZED" ? "session_expired" : "temporarily_unavailable";
          await telegramRepository.updateAccountStatus(job.account, status, message).catch(() => undefined);
        }
        await telegramRepository.failJob(job.id, message).catch(() => undefined);
      }
      event("job_failed", { jobId: next.id, type: next.type });
    }
  }
  event("worker_stopped");
}

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

void run().catch((error) => {
  event("worker_crashed", { message: safeMessage(error) });
  process.exitCode = 1;
});
