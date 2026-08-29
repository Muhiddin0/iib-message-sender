import "server-only";

import { InputMedia, type TelegramClient } from "@mtcute/node";
import { longFromBuffer } from "@mtcute/core/utils.js";

import { AppError } from "@/lib/errors";
import type { TelegramChallengeRecord, TelegramSessionRecord } from "@/lib/pocketbase/records";
import { telegramRepository } from "@/lib/repositories/telegram-repository";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import { createTelegramClient } from "@/lib/telegram/client";
import { isPasswordRequired, telegramError } from "@/lib/telegram/errors";
import { telegramChatPermissions } from "@/lib/telegram/permissions";
import type {
  TelegramAuthChallengePayload,
  TelegramIdentity,
  TelegramMessageMetrics,
  TelegramRemoteChat,
} from "@/lib/telegram/types";
import type { MessageKind } from "@/types/domain";

const AUTH_TTL_MS = 10 * 60_000;
const MAX_AUTH_ATTEMPTS = 5;

function envelope(record: TelegramSessionRecord | TelegramChallengeRecord) {
  return {
    ciphertext: record.ciphertext,
    iv: record.iv,
    authTag: record.auth_tag,
    keyVersion: record.key_version,
  };
}

function challengePayload(record: TelegramChallengeRecord, userId: string) {
  if (new Date(record.expires_at).getTime() <= Date.now() || record.attempts >= MAX_AUTH_ATTEMPTS) {
    throw new AppError("VALIDATION_ERROR", "Tasdiqlash jarayoni eskirgan. Qaytadan boshlang.", 400);
  }
  const raw = decryptSecret(envelope(record), { purpose: "telegram-challenge", userId });
  return JSON.parse(raw) as TelegramAuthChallengePayload;
}

function identity(user: {
  id: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
}): TelegramIdentity {
  return {
    id: String(user.id),
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
  };
}

function sentMessage(message: { id: number; link: string }) {
  let link: string | null = null;
  try {
    link = message.link;
  } catch {
    // Telegram basic groups and direct chats do not have message permalinks.
  }
  return { id: message.id, link };
}

async function withSession<T>(userId: string, work: (client: TelegramClient) => Promise<T>) {
  const session = await telegramRepository.getSession(userId);
  if (!session) throw new AppError("TELEGRAM_UNAUTHORIZED", "Telegram hisobini qayta ulang.", 401);
  const client = createTelegramClient();
  try {
    const value = decryptSecret(envelope(session), { purpose: "telegram-session", userId });
    await client.importSession(value);
    return await work(client);
  } catch (error) {
    throw telegramError(error);
  } finally {
    await client.destroy().catch(() => undefined);
  }
}

export class TelegramService {
  async beginAuthorization(userId: string, phone: string) {
    if (await telegramRepository.getAccount(userId)) {
      throw new AppError("CONFLICT", "Bu profilga Telegram hisobi allaqachon ulangan.", 409);
    }
    const client = createTelegramClient();
    try {
      const result = await client.sendCode({ phone });
      if (!("phoneCodeHash" in result)) {
        throw new AppError("CONFLICT", "Telegram sessiyasi allaqachon faol.", 409);
      }
      const payload: TelegramAuthChallengePayload = {
        session: await client.exportSession(),
        phone,
        phoneCodeHash: result.phoneCodeHash,
      };
      await telegramRepository.saveChallenge({
        userId,
        state: "code_required",
        envelope: encryptSecret(JSON.stringify(payload), { purpose: "telegram-challenge", userId }),
        expiresAt: new Date(Date.now() + AUTH_TTL_MS).toISOString(),
      });
      return { state: "code_required" as const, deliveryType: result.type, codeLength: result.length };
    } catch (error) {
      throw telegramError(error);
    } finally {
      await client.destroy().catch(() => undefined);
    }
  }

  async verifyCode(userId: string, code: string) {
    const challenge = await telegramRepository.getChallenge(userId);
    if (!challenge || challenge.state !== "code_required") {
      throw new AppError("VALIDATION_ERROR", "Avval tasdiqlash kodini so‘rang.", 400);
    }
    const payload = challengePayload(challenge, userId);
    const client = createTelegramClient();
    try {
      await client.importSession(payload.session);
      const user = await client.signIn({
        phone: payload.phone,
        phoneCodeHash: payload.phoneCodeHash,
        phoneCode: code,
      });
      return await this.finishAuthorization(userId, client, identity(user));
    } catch (error) {
      if (isPasswordRequired(error)) {
        const nextPayload = { ...payload, session: await client.exportSession() };
        await telegramRepository.saveChallenge({
          userId,
          state: "password_required",
          envelope: encryptSecret(JSON.stringify(nextPayload), { purpose: "telegram-challenge", userId }),
          attempts: challenge.attempts,
          expiresAt: challenge.expires_at,
        });
        return { state: "password_required" as const };
      }
      await this.bumpChallenge(challenge, userId, payload, "code_required");
      throw telegramError(error);
    } finally {
      await client.destroy().catch(() => undefined);
    }
  }

  async verifyPassword(userId: string, password: string) {
    const challenge = await telegramRepository.getChallenge(userId);
    if (!challenge || challenge.state !== "password_required") {
      throw new AppError("VALIDATION_ERROR", "Ikki bosqichli himoya jarayoni topilmadi.", 400);
    }
    const payload = challengePayload(challenge, userId);
    const client = createTelegramClient();
    try {
      await client.importSession(payload.session);
      const user = await client.checkPassword(password);
      return await this.finishAuthorization(userId, client, identity(user));
    } catch (error) {
      await this.bumpChallenge(challenge, userId, payload, "password_required");
      throw telegramError(error);
    } finally {
      await client.destroy().catch(() => undefined);
    }
  }

  private async bumpChallenge(
    current: TelegramChallengeRecord,
    userId: string,
    payload: TelegramAuthChallengePayload,
    state: TelegramChallengeRecord["state"],
  ) {
    const attempts = current.attempts + 1;
    if (attempts >= MAX_AUTH_ATTEMPTS) {
      await telegramRepository.deleteChallenge(userId);
      return;
    }
    await telegramRepository.saveChallenge({
      userId,
      state,
      envelope: encryptSecret(JSON.stringify(payload), { purpose: "telegram-challenge", userId }),
      attempts,
      expiresAt: current.expires_at,
    });
  }

  private async finishAuthorization(userId: string, client: TelegramClient, user: TelegramIdentity) {
    const current = await telegramRepository.getAccount(userId);
    if (current) throw new AppError("CONFLICT", "Telegram hisobi allaqachon ulangan.", 409);
    const session = await client.exportSession();
    const account = await telegramRepository.createAccount({
      userId,
      telegramUserId: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
    });
    try {
      await telegramRepository.saveSession(
        userId,
        account.id,
        encryptSecret(session, { purpose: "telegram-session", userId }),
      );
      await telegramRepository.deleteChallenge(userId);
      await telegramRepository.enqueueJob({
        userId,
        accountId: account.id,
        type: "sync_chats",
        idempotencyKey: `sync:${account.id}:${Date.now()}`,
      });
    } catch (error) {
      await telegramRepository.deleteAccount(account.id).catch(() => undefined);
      throw error;
    }
    return { state: "connected" as const, accountId: account.id };
  }

  async getChats(userId: string): Promise<TelegramRemoteChat[]> {
    return withSession(userId, async (client) => {
      const chats = new Map<string, TelegramRemoteChat>();
      for await (const dialog of client.iterDialogs({ archived: "keep" })) {
        const peer = dialog.peer;
        if (peer.type !== "chat") continue;
        if (["community", "monoforum"].includes(peer.chatType)) continue;
        const send = telegramChatPermissions(peer);
        const telegramPeerId = String(peer.id);
        chats.set(telegramPeerId, {
          telegramPeerId,
          title: peer.title,
          username: peer.username,
          type: peer.chatType === "group" ? "group" : peer.chatType === "channel" ? "channel" : "supergroup",
          participantCount: peer.membersCount,
          canSendText: send.text,
          canSendPhoto: send.photo,
          canSendVideo: send.video,
        });
      }
      return [...chats.values()];
    });
  }

  async sendMessage(input: {
    userId: string;
    peerId: string;
    kind: MessageKind;
    body: string;
    mediaPath?: string;
    randomIdHex: string;
  }) {
    return withSession(input.userId, async (client) => {
      const randomId = longFromBuffer(Buffer.from(input.randomIdHex, "hex"));
      const peerId = Number(input.peerId);
      if (input.kind === "text") {
        return sentMessage(await client.sendText(peerId, input.body, { randomId }));
      }
      if (!input.mediaPath) throw new AppError("VALIDATION_ERROR", "Media fayl topilmadi.", 400);
      const media = input.kind === "photo" ? InputMedia.photo(input.mediaPath) : InputMedia.video(input.mediaPath);
      return sentMessage(await client.sendMedia(peerId, media, { caption: input.body || undefined, randomId }));
    });
  }

  async inspectForwardSource(userId: string, link: string) {
    return withSession(userId, async (client) => {
      const message = await client.getMessageByLink(link);
      if (!message || message.isService) {
        throw new AppError("VALIDATION_ERROR", "Telegram xabari topilmadi yoki undan foydalanib bo‘lmaydi.", 400);
      }
      if (!message.canBeForwarded) {
        throw new AppError("TELEGRAM_PERMISSION_DENIED", "Bu xabarni Telegram himoyasi sabab forward qilib bo‘lmaydi.", 403);
      }

      const mediaType = message.media?.type;
      const kind: MessageKind = mediaType === "photo" ? "photo" : mediaType === "video" ? "video" : "text";
      return {
        link,
        messageId: String(message.id),
        chatTitle: message.chat.displayName,
        body: message.text.slice(0, 4096),
        kind,
      };
    });
  }

  async forwardMessage(input: {
    userId: string;
    peerId: string;
    sourceMessageLink: string;
    randomIdHex: string;
  }) {
    return withSession(input.userId, async (client) => {
      const source = await client.getMessageByLink(input.sourceMessageLink);
      if (!source || source.isService) {
        throw new AppError("VALIDATION_ERROR", "Forward qilinadigan Telegram xabari topilmadi.", 400);
      }
      if (!source.canBeForwarded) {
        throw new AppError("TELEGRAM_PERMISSION_DENIED", "Telegram bu xabarni forward qilishga ruxsat bermaydi.", 403);
      }

      const randomId = longFromBuffer(Buffer.from(input.randomIdHex, "hex"));
      const result = await client.call({
        _: "messages.forwardMessages",
        fromPeer: source.chat.inputPeer,
        id: [source.id],
        randomId: [randomId],
        toPeer: await client.resolvePeer(Number(input.peerId)),
      });
      if (result._ !== "updates" && result._ !== "updatesCombined") {
        throw new AppError("TELEGRAM_TEMPORARY", "Telegram forward natijasini qaytarmadi.", 503);
      }
      client.handleClientUpdate(result, true);

      const mapped = result.updates.find(
        (update) => update._ === "updateMessageID" && update.randomId.eq(randomId),
      );
      const delivered = result.updates.find(
        (update) => update._ === "updateNewMessage" || update._ === "updateNewChannelMessage",
      );
      const messageId = mapped?._ === "updateMessageID"
        ? mapped.id
        : delivered && "message" in delivered
          ? delivered.message.id
          : null;
      if (!messageId) {
        throw new AppError("TELEGRAM_TEMPORARY", "Forward qilingan xabar ID si olinmadi.", 503);
      }

      try {
        const [message] = await client.getMessages(Number(input.peerId), [messageId]);
        if (message) return sentMessage(message);
      } catch {
        // The forward itself succeeded; a permalink lookup must not resend it.
      }
      return { id: messageId, link: null };
    });
  }

  async getMessageMetrics(userId: string, peerId: string, messageId: string): Promise<TelegramMessageMetrics> {
    return withSession(userId, async (client) => {
      const [message] = await client.getMessages(Number(peerId), [Number(messageId)]);
      if (!message) return { views: null, reactions: null, replies: null };

      const chatType = message.chat.type === "chat" ? message.chat.chatType : null;
      const reactions = message.reactions
        ? message.reactions.reactions.reduce((sum, reaction) => sum + reaction.count, 0)
        : null;
      const replies = message.replies?.count ?? null;
      const needsCapabilities = reactions === null || (chatType === "channel" && replies === null);
      const fullChat = needsCapabilities ? await client.getFullChat(Number(peerId)) : null;
      const availableReactions =
        fullChat && "availableReactions" in fullChat.full
          ? fullChat.full.availableReactions ?? null
          : null;
      const reactionsEnabled = availableReactions !== null && availableReactions._ !== "chatReactionsNone";
      const hasDiscussion = Boolean(fullChat?.linkedChat);

      return {
        views: message.views,
        reactions: reactions ?? (reactionsEnabled ? 0 : null),
        replies: replies ?? (chatType === "channel" ? (hasDiscussion ? 0 : null) : 0),
      };
    });
  }

  async disconnect(userId: string) {
    try {
      await withSession(userId, (client) => client.logOut());
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "TELEGRAM_UNAUTHORIZED") throw error;
    }
    const account = await telegramRepository.getAccountRecord(userId);
    if (account) await telegramRepository.deleteAccount(account.id);
    await telegramRepository.deleteChallenge(userId);
  }
}

export const telegramService = new TelegramService();
