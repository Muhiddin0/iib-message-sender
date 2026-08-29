import "server-only";

import { randomBytes } from "node:crypto";

import { AppError } from "@/lib/errors";
import { getPocketBaseAdmin } from "@/lib/pocketbase/client";
import type {
  ActivityRecord,
  CampaignRecord,
  DeliveryRecord,
} from "@/lib/pocketbase/records";
import { isNotFoundError, nullable } from "@/lib/repositories/helpers";
import type {
  Activity,
  CampaignMode,
  CampaignSummary,
  DashboardData,
  Delivery,
  DeliveryStatus,
  MessageKind,
} from "@/types/domain";

function campaignDto(record: CampaignRecord): CampaignSummary {
  const sourceMessageLink = nullable(record.source_message_link);
  return {
    id: record.id,
    mode: sourceMessageLink ? "forward" : "compose",
    kind: record.kind,
    body: record.body,
    sourceMessageLink,
    sourceMessageId: nullable(record.source_message_id),
    sourceChatTitle: nullable(record.source_chat_title),
    status: record.status,
    totalCount: record.total_count,
    sentCount: record.sent_count,
    failedCount: record.failed_count,
    pendingCount: record.pending_count,
    created: record.created,
    finishedAt: nullable(record.finished_at),
  };
}

function deliveryDto(record: DeliveryRecord): Delivery {
  return {
    id: record.id,
    campaignId: record.campaign,
    chatTitle: record.chat_title,
    chatType: record.chat_type,
    status: record.status,
    telegramMessageId: nullable(record.telegram_message_id),
    telegramMessageLink: nullable(record.telegram_message_link),
    errorMessage: nullable(record.error_message),
    sentAt: nullable(record.sent_at),
    views: record.views_supported ? record.views : null,
    reactions: record.reactions_supported ? record.reactions : null,
    replies: record.replies_supported ? record.replies : null,
  };
}

function activityDto(record: ActivityRecord): Activity {
  return {
    id: record.id,
    campaignId: nullable(record.campaign),
    type: record.type,
    message: record.message,
    tone: record.tone,
    created: record.created,
  };
}

export function summarizeDeliveryStatuses(statuses: DeliveryStatus[]) {
  const sent = statuses.filter((status) => status === "sent").length;
  const failed = statuses.filter((status) =>
    ["failed", "unauthorized", "permission_denied", "cancelled"].includes(status),
  ).length;
  const pending = statuses.length - sent - failed;
  const status = pending > 0 ? "sending" : sent === statuses.length ? "completed" : sent > 0 ? "partial" : "failed";
  return { sent, failed, pending, status } as const;
}

export class CampaignRepository {
  async getDashboard(userId: string, account: DashboardData["account"]): Promise<DashboardData> {
    const pb = await getPocketBaseAdmin();
    const [campaignRecords, activities, recentLinks] = await Promise.all([
      pb.collection("campaigns").getFullList<CampaignRecord>({
        filter: pb.filter("user = {:user}", { user: userId }),
        sort: "-created",
      }),
      pb.collection("activities").getList<ActivityRecord>(1, 25, {
        filter: pb.filter("user = {:user}", { user: userId }),
        sort: "-created",
      }),
      pb.collection("campaign_deliveries").getList<DeliveryRecord>(1, 10, {
        filter: pb.filter(
          'user = {:user} && status = "sent" && telegram_message_link != ""',
          { user: userId },
        ),
        sort: "-sent_at",
      }),
    ]);
    const totals = campaignRecords.reduce(
      (sum, campaign) => ({
        campaigns: sum.campaigns + 1,
        sent: sum.sent + campaign.sent_count,
        failed: sum.failed + campaign.failed_count,
        pending: sum.pending + campaign.pending_count,
      }),
      { campaigns: 0, sent: 0, failed: 0, pending: 0 },
    );
    return {
      account,
      campaigns: campaignRecords.slice(0, 20).map(campaignDto),
      activities: activities.items.map(activityDto),
      recentMessageLinks: recentLinks.items.map((record) => ({
        id: record.id,
        campaignId: record.campaign,
        chatTitle: record.chat_title,
        telegramMessageLink: record.telegram_message_link,
        sentAt: nullable(record.sent_at),
      })),
      totals,
    };
  }

  async findByIdempotency(userId: string, key: string): Promise<CampaignRecord | null> {
    const pb = await getPocketBaseAdmin();
    try {
      return await pb.collection("campaigns").getFirstListItem<CampaignRecord>(
        pb.filter("user = {:user} && idempotency_key = {:key}", { user: userId, key }),
      );
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async getOwnedRecord(userId: string, campaignId: string): Promise<CampaignRecord> {
    const pb = await getPocketBaseAdmin();
    try {
      const record = await pb.collection("campaigns").getOne<CampaignRecord>(campaignId);
      if (record.user !== userId) throw new AppError("NOT_FOUND", "Kampaniya topilmadi.", 404);
      return record;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (isNotFoundError(error)) throw new AppError("NOT_FOUND", "Kampaniya topilmadi.", 404);
      throw error;
    }
  }

  async getDetail(userId: string, campaignId: string) {
    const campaign = await this.getOwnedRecord(userId, campaignId);
    const pb = await getPocketBaseAdmin();
    const records = await pb.collection("campaign_deliveries").getFullList<DeliveryRecord>({
      filter: pb.filter("user = {:user} && campaign = {:campaign}", { user: userId, campaign: campaignId }),
      sort: "chat_title",
    });
    return { campaign: campaignDto(campaign), deliveries: records.map(deliveryDto) };
  }

  async create(input: {
    userId: string;
    mode: CampaignMode;
    kind: MessageKind;
    body: string;
    idempotencyKey: string;
    chats: Array<{
      id: string;
      telegram_peer_id: string;
      title: string;
      type: "group" | "supergroup" | "channel";
    }>;
    media?: File;
    source?: {
      link: string;
      messageId: string;
      chatTitle: string;
    };
  }) {
    const pb = await getPocketBaseAdmin();
    const existing = await this.findByIdempotency(input.userId, input.idempotencyKey);
    if (existing) return { campaign: existing, created: false };

    const data = new FormData();
    data.set("user", input.userId);
    data.set("kind", input.kind);
    data.set("body", input.body);
    data.set("media_mime", input.media?.type ?? "");
    data.set("source_message_link", input.source?.link ?? "");
    data.set("source_message_id", input.source?.messageId ?? "");
    data.set("source_chat_title", input.source?.chatTitle ?? "");
    data.set("status", "queued");
    data.set("idempotency_key", input.idempotencyKey);
    data.set("total_count", String(input.chats.length));
    data.set("sent_count", "0");
    data.set("failed_count", "0");
    data.set("pending_count", String(input.chats.length));
    if (input.media) data.set("media", input.media);

    const campaign = await pb.collection("campaigns").create<CampaignRecord>(data);
    try {
      for (const chat of input.chats) {
        await pb.collection("campaign_deliveries").create({
          user: input.userId,
          campaign: campaign.id,
          chat: chat.id,
          telegram_peer_id: chat.telegram_peer_id,
          chat_title: chat.title,
          chat_type: chat.type,
          telegram_random_id: randomBytes(8).toString("hex"),
          status: "queued",
        });
      }
      await this.addActivity({
        userId: input.userId,
        campaignId: campaign.id,
        type: "campaign_created",
        message: input.mode === "forward"
          ? `${input.chats.length} ta chat uchun forward navbatga qo‘yildi.`
          : `${input.chats.length} ta chat uchun kampaniya navbatga qo‘yildi.`,
        tone: "info",
      });
      return { campaign, created: true };
    } catch (error) {
      await pb.collection("campaigns").delete(campaign.id).catch(() => undefined);
      throw error;
    }
  }

  async addActivity(input: {
    userId: string;
    campaignId?: string;
    deliveryId?: string;
    type: string;
    message: string;
    tone: ActivityRecord["tone"];
  }) {
    const pb = await getPocketBaseAdmin();
    await pb.collection("activities").create({
      user: input.userId,
      campaign: input.campaignId ?? "",
      delivery: input.deliveryId ?? "",
      type: input.type,
      message: input.message,
      tone: input.tone,
    });
  }

  async listRunnableDeliveries(campaignId: string): Promise<DeliveryRecord[]> {
    const pb = await getPocketBaseAdmin();
    const now = new Date().toISOString();
    return pb.collection("campaign_deliveries").getFullList<DeliveryRecord>({
      filter: pb.filter(
        'campaign = {:campaign} && (status = "queued" || status = "flood_wait") && (not_before = "" || not_before <= {:now})',
        { campaign: campaignId, now },
      ),
      sort: "created",
    });
  }

  async setCampaignStatus(campaignId: string, status: CampaignRecord["status"], data: Record<string, unknown> = {}) {
    const pb = await getPocketBaseAdmin();
    await pb.collection("campaigns").update(campaignId, { status, ...data });
  }

  async setDeliveryStatus(
    deliveryId: string,
    status: DeliveryStatus,
    data: Record<string, unknown> = {},
  ) {
    const pb = await getPocketBaseAdmin();
    await pb.collection("campaign_deliveries").update(deliveryId, { status, ...data });
  }

  async recount(campaignId: string) {
    const pb = await getPocketBaseAdmin();
    const deliveries = await pb.collection("campaign_deliveries").getFullList<DeliveryRecord>({
      filter: pb.filter("campaign = {:campaign}", { campaign: campaignId }),
    });
    const { sent, failed, pending, status } = summarizeDeliveryStatuses(
      deliveries.map((delivery) => delivery.status),
    );
    await pb.collection("campaigns").update(campaignId, {
      status,
      sent_count: sent,
      failed_count: failed,
      pending_count: pending,
      finished_at: pending === 0 ? new Date().toISOString() : "",
    });
    return { sent, failed, pending, status };
  }

  async updateMetrics(deliveryId: string, metrics: { views: number | null; reactions: number | null; replies: number | null }) {
    const pb = await getPocketBaseAdmin();
    await pb.collection("campaign_deliveries").update(deliveryId, {
      views: metrics.views ?? 0,
      views_supported: metrics.views !== null,
      reactions: metrics.reactions ?? 0,
      reactions_supported: metrics.reactions !== null,
      replies: metrics.replies ?? 0,
      replies_supported: metrics.replies !== null,
      analytics_updated_at: new Date().toISOString(),
    });
  }

  async listSentDeliveries(campaignId: string) {
    const pb = await getPocketBaseAdmin();
    return pb.collection("campaign_deliveries").getFullList<DeliveryRecord>({
      filter: pb.filter('campaign = {:campaign} && status = "sent" && telegram_message_id != ""', { campaign: campaignId }),
    });
  }

  async downloadMedia(record: CampaignRecord): Promise<Uint8Array | null> {
    if (!record.media) return null;
    const pb = await getPocketBaseAdmin();
    const token = await pb.files.getToken();
    const url = pb.files.getURL(record, record.media, { token });
    const response = await fetch(url);
    if (!response.ok) throw new Error("Campaign media could not be downloaded");
    return new Uint8Array(await response.arrayBuffer());
  }

  async clearMedia(campaignId: string) {
    const pb = await getPocketBaseAdmin();
    await pb.collection("campaigns").update(campaignId, { media: "" });
  }

  async failPending(campaignId: string, code: string, message: string) {
    const pb = await getPocketBaseAdmin();
    const records = await pb.collection("campaign_deliveries").getFullList<DeliveryRecord>({
      filter: pb.filter('campaign = {:campaign} && (status = "queued" || status = "sending" || status = "flood_wait")', { campaign: campaignId }),
    });
    await Promise.all(records.map((record) => pb.collection("campaign_deliveries").update(record.id, {
      status: "failed",
      error_code: code,
      error_message: message,
    })));
    return this.recount(campaignId);
  }
}

export const campaignRepository = new CampaignRepository();
