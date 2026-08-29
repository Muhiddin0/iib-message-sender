import "server-only";

import { z } from "zod";

import { AppError } from "@/lib/errors";
import { campaignRepository } from "@/lib/repositories/campaign-repository";
import { telegramRepository } from "@/lib/repositories/telegram-repository";
import { normalizeTelegramMessageLink } from "@/lib/telegram/message-link";
import { telegramService } from "@/lib/telegram/service";
import type { MessageKind } from "@/types/domain";

const MAX_PHOTO = 10 * 1024 * 1024;
const MAX_VIDEO = 50 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

const createSchema = z.object({
  mode: z.enum(["compose", "forward"]),
  kind: z.enum(["text", "photo", "video"]).optional(),
  body: z.string(),
  sourceMessageLink: z.string().max(1000),
  chatIds: z.array(z.string().min(1)).min(1).max(200),
  idempotencyKey: z.string().uuid(),
});

async function sniffMedia(file: File, kind: MessageKind) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]);
  const isWebp = new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  const isMp4 = new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp";
  const isWebm = bytes.slice(0, 4).every((value, index) => value === [0x1a, 0x45, 0xdf, 0xa3][index]);

  if (kind === "photo" && !(isJpeg || isPng || isWebp)) {
    throw new AppError("VALIDATION_ERROR", "Rasm fayli JPEG, PNG yoki WebP bo‘lishi kerak.", 400);
  }
  if (kind === "video" && !(isMp4 || isWebm)) {
    throw new AppError("VALIDATION_ERROR", "Video MP4, WebM yoki QuickTime konteynerida bo‘lishi kerak.", 400);
  }
}

function validateExtension(file: File, kind: MessageKind) {
  const name = file.name.toLowerCase();
  const allowed = kind === "photo" ? [".jpg", ".jpeg", ".png", ".webp"] : [".mp4", ".webm", ".mov"];
  if (!allowed.some((extension) => name.endsWith(extension))) {
    throw new AppError("VALIDATION_ERROR", "Fayl kengaytmasi media turiga mos emas.", 400);
  }
}

export class CampaignService {
  async create(userId: string, form: FormData) {
    let chatIds: unknown;
    try {
      chatIds = JSON.parse(String(form.get("chatIds") ?? "[]"));
    } catch {
      throw new AppError("VALIDATION_ERROR", "Chatlar ro‘yxati noto‘g‘ri.", 400);
    }
    const parsed = createSchema.safeParse({
      mode: form.get("mode") ?? "compose",
      kind: form.get("kind") ?? undefined,
      body: form.get("body") ?? "",
      sourceMessageLink: form.get("sourceMessageLink") ?? "",
      chatIds,
      idempotencyKey: form.get("idempotencyKey"),
    });
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Xabar ma’lumotlari noto‘g‘ri.", 400);

    const input = parsed.data;

    const account = await telegramRepository.getAccountRecord(userId);
    if (!account || account.status !== "connected") {
      throw new AppError("TELEGRAM_UNAUTHORIZED", "Avval Telegram hisobini ulang.", 409);
    }
    let kind: MessageKind;
    let body: string;
    let source: { link: string; messageId: string; chatTitle: string } | undefined;

    if (input.mode === "forward") {
      const link = normalizeTelegramMessageLink(input.sourceMessageLink);
      if (!link) {
        throw new AppError("VALIDATION_ERROR", "To‘g‘ri Telegram xabar linkini kiriting.", 400);
      }
      const inspected = await telegramService.inspectForwardSource(userId, link);
      kind = inspected.kind;
      body = inspected.body;
      source = {
        link: inspected.link,
        messageId: inspected.messageId,
        chatTitle: inspected.chatTitle,
      };
    } else {
      if (!input.kind) throw new AppError("VALIDATION_ERROR", "Xabar turini tanlang.", 400);
      kind = input.kind;
      body = input.body.trim();
      const maxBody = kind === "text" ? 4096 : 1024;
      if ((kind === "text" && !body) || body.length > maxBody) {
        throw new AppError("VALIDATION_ERROR", `Matn 1–${maxBody} belgi bo‘lishi kerak.`, 400);
      }
    }

    const uniqueChatIds = [...new Set(input.chatIds)];
    const chats = await telegramRepository.getOwnedChats(userId, uniqueChatIds);
    if (chats.length !== uniqueChatIds.length || chats.some((chat) => chat.account !== account.id)) {
      throw new AppError("FORBIDDEN", "Tanlangan chatlardan biri sizga tegishli emas.", 403);
    }
    const permission = kind === "text" ? "can_send_text" : kind === "photo" ? "can_send_photo" : "can_send_video";
    if (chats.some((chat) => !chat[permission])) {
      throw new AppError("TELEGRAM_PERMISSION_DENIED", "Tanlangan chatlardan birida yuborish ruxsati yo‘q.", 403);
    }

    const mediaValue = form.get("media");
    const media = mediaValue instanceof File && mediaValue.size > 0 ? mediaValue : undefined;
    if (input.mode === "forward") {
      if (media) throw new AppError("VALIDATION_ERROR", "Forward xabarga yangi media biriktirilmaydi.", 400);
    } else if (kind !== "text") {
      if (!media) throw new AppError("VALIDATION_ERROR", "Media faylni tanlang.", 400);
      const allowed = kind === "photo" ? PHOTO_TYPES : VIDEO_TYPES;
      const max = kind === "photo" ? MAX_PHOTO : MAX_VIDEO;
      if (!allowed.has(media.type) || media.size > max) {
        throw new AppError("VALIDATION_ERROR", "Media turi yoki hajmi qo‘llab-quvvatlanmaydi.", 400);
      }
      validateExtension(media, kind);
      await sniffMedia(media, kind);
    } else if (media) {
      throw new AppError("VALIDATION_ERROR", "Matnli xabarga fayl biriktirilmaydi.", 400);
    }

    const result = await campaignRepository.create({
      userId,
      mode: input.mode,
      kind,
      body,
      idempotencyKey: input.idempotencyKey,
      chats,
      media,
      source,
    });
    if (result.created) {
      await telegramRepository.enqueueJob({
        userId,
        accountId: account.id,
        campaignId: result.campaign.id,
        type: "send_campaign",
        idempotencyKey: `send:${result.campaign.id}`,
      });
    }
    return { id: result.campaign.id, created: result.created };
  }
}

export const campaignService = new CampaignService();
