import "server-only";

import { getPocketBaseAdmin } from "@/lib/pocketbase/client";
import type {
  TelegramAccountRecord,
  TelegramChallengeRecord,
  TelegramChatRecord,
  TelegramJobRecord,
  TelegramSessionRecord,
} from "@/lib/pocketbase/records";
import { isNotFoundError, nullable } from "@/lib/repositories/helpers";
import type { EncryptedEnvelope } from "@/lib/security/encryption";
import type { TelegramAccount, TelegramChat, TelegramChatType } from "@/types/domain";

function accountDto(record: TelegramAccountRecord): TelegramAccount {
  return {
    id: record.id,
    telegramUserId: record.telegram_user_id,
    username: nullable(record.username),
    firstName: record.first_name,
    lastName: nullable(record.last_name),
    status: record.status,
    statusDetail: nullable(record.status_detail),
    lastSyncAt: nullable(record.last_sync_at),
    lastConnectedAt: nullable(record.last_connected_at),
  };
}

function chatDto(record: TelegramChatRecord): TelegramChat {
  return {
    id: record.id,
    telegramPeerId: record.telegram_peer_id,
    title: record.title,
    username: nullable(record.username),
    type: record.type,
    participantCount: record.participant_count || null,
    canSendText: record.can_send_text,
    canSendPhoto: record.can_send_photo,
    canSendVideo: record.can_send_video,
    active: record.active,
    lastSyncedAt: nullable(record.last_synced_at),
  };
}

export interface SyncedChatInput {
  telegramPeerId: string;
  peerData?: string;
  title: string;
  username?: string | null;
  type: TelegramChatType;
  participantCount?: number | null;
  canSendText: boolean;
  canSendPhoto: boolean;
  canSendVideo: boolean;
}

export class TelegramRepository {
  async getAccount(userId: string): Promise<TelegramAccount | null> {
    const record = await this.getAccountRecord(userId);
    return record ? accountDto(record) : null;
  }

  async getAccountRecord(userId: string): Promise<TelegramAccountRecord | null> {
    const pb = await getPocketBaseAdmin();
    try {
      return await pb
        .collection("telegram_accounts")
        .getFirstListItem<TelegramAccountRecord>(pb.filter("user = {:user}", { user: userId }));
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async createAccount(input: {
    userId: string;
    telegramUserId: string;
    username?: string | null;
    firstName: string;
    lastName?: string | null;
  }): Promise<TelegramAccountRecord> {
    const pb = await getPocketBaseAdmin();
    return pb.collection("telegram_accounts").create<TelegramAccountRecord>({
      user: input.userId,
      telegram_user_id: input.telegramUserId,
      username: input.username ?? "",
      first_name: input.firstName,
      last_name: input.lastName ?? "",
      status: "connected",
      status_detail: "",
      last_connected_at: new Date().toISOString(),
    });
  }

  async updateAccountStatus(
    accountId: string,
    status: TelegramAccountRecord["status"],
    statusDetail = "",
  ) {
    const pb = await getPocketBaseAdmin();
    await pb.collection("telegram_accounts").update(accountId, {
      status,
      status_detail: statusDetail,
    });
  }

  async deleteAccount(accountId: string) {
    const pb = await getPocketBaseAdmin();
    await pb.collection("telegram_accounts").delete(accountId);
  }

  async saveSession(userId: string, accountId: string, envelope: EncryptedEnvelope) {
    const pb = await getPocketBaseAdmin();
    await pb.collection("telegram_sessions").create({
      user: userId,
      account: accountId,
      ciphertext: envelope.ciphertext,
      iv: envelope.iv,
      auth_tag: envelope.authTag,
      key_version: envelope.keyVersion,
    });
  }

  async getSession(userId: string): Promise<TelegramSessionRecord | null> {
    const pb = await getPocketBaseAdmin();
    try {
      return await pb
        .collection("telegram_sessions")
        .getFirstListItem<TelegramSessionRecord>(pb.filter("user = {:user}", { user: userId }));
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async deleteSession(userId: string) {
    const pb = await getPocketBaseAdmin();
    const record = await this.getSession(userId);
    if (record) await pb.collection("telegram_sessions").delete(record.id);
  }

  async getChallenge(userId: string): Promise<TelegramChallengeRecord | null> {
    const pb = await getPocketBaseAdmin();
    try {
      return await pb
        .collection("telegram_auth_challenges")
        .getFirstListItem<TelegramChallengeRecord>(pb.filter("user = {:user}", { user: userId }));
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async getActiveChallenge(userId: string): Promise<TelegramChallengeRecord | null> {
    const challenge = await this.getChallenge(userId);
    return challenge && new Date(challenge.expires_at).getTime() > Date.now() ? challenge : null;
  }

  async saveChallenge(input: {
    userId: string;
    state: TelegramChallengeRecord["state"];
    envelope: EncryptedEnvelope;
    attempts?: number;
    expiresAt: string;
  }) {
    const pb = await getPocketBaseAdmin();
    const existing = await this.getChallenge(input.userId);
    const data = {
      user: input.userId,
      state: input.state,
      ciphertext: input.envelope.ciphertext,
      iv: input.envelope.iv,
      auth_tag: input.envelope.authTag,
      key_version: input.envelope.keyVersion,
      attempts: input.attempts ?? 0,
      expires_at: input.expiresAt,
    };
    if (existing) {
      return pb.collection("telegram_auth_challenges").update(existing.id, data);
    }
    return pb.collection("telegram_auth_challenges").create(data);
  }

  async deleteChallenge(userId: string) {
    const pb = await getPocketBaseAdmin();
    const existing = await this.getChallenge(userId);
    if (existing) await pb.collection("telegram_auth_challenges").delete(existing.id);
  }

  async listChats(userId: string): Promise<TelegramChat[]> {
    const pb = await getPocketBaseAdmin();
    const records = await pb.collection("telegram_chats").getFullList<TelegramChatRecord>({
      filter: pb.filter("user = {:user} && active = true", { user: userId }),
      sort: "title",
    });
    return records.map(chatDto);
  }

  async getOwnedChats(userId: string, chatIds: string[]): Promise<TelegramChatRecord[]> {
    if (chatIds.length === 0) return [];
    const pb = await getPocketBaseAdmin();
    const records = await Promise.all(
      chatIds.map(async (chatId) => {
        try {
          const record = await pb.collection("telegram_chats").getOne<TelegramChatRecord>(chatId);
          return record.user === userId && record.active ? record : null;
        } catch (error) {
          if (isNotFoundError(error)) return null;
          throw error;
        }
      }),
    );
    return records.filter((record): record is TelegramChatRecord => record !== null);
  }

  async syncChats(userId: string, accountId: string, chats: SyncedChatInput[]) {
    const pb = await getPocketBaseAdmin();
    const now = new Date().toISOString();
    const existing = await pb.collection("telegram_chats").getFullList<TelegramChatRecord>({
      filter: pb.filter("account = {:account}", { account: accountId }),
    });
    const byPeer = new Map(existing.map((record) => [record.telegram_peer_id, record]));
    const seen = new Set<string>();

    for (const chat of chats) {
      seen.add(chat.telegramPeerId);
      const data = {
        user: userId,
        account: accountId,
        telegram_peer_id: chat.telegramPeerId,
        peer_data: chat.peerData ?? "",
        title: chat.title,
        username: chat.username ?? "",
        type: chat.type,
        participant_count: chat.participantCount ?? 0,
        can_send_text: chat.canSendText,
        can_send_photo: chat.canSendPhoto,
        can_send_video: chat.canSendVideo,
        active: true,
        last_synced_at: now,
      };
      const current = byPeer.get(chat.telegramPeerId);
      if (current) {
        await pb.collection("telegram_chats").update(current.id, data);
      } else {
        const created = await pb.collection("telegram_chats").create<TelegramChatRecord>(data);
        byPeer.set(chat.telegramPeerId, created);
      }
    }

    await Promise.all(
      existing
        .filter((record) => !seen.has(record.telegram_peer_id) && record.active)
        .map((record) => pb.collection("telegram_chats").update(record.id, { active: false, last_synced_at: now })),
    );

    await pb.collection("telegram_accounts").update(accountId, {
      last_sync_at: now,
      status: "connected",
      status_detail: "",
    });
  }

  async enqueueJob(input: {
    userId: string;
    accountId?: string;
    campaignId?: string;
    type: TelegramJobRecord["type"];
    idempotencyKey: string;
    notBefore?: string;
  }) {
    const pb = await getPocketBaseAdmin();
    try {
      return await pb.collection("telegram_jobs").create<TelegramJobRecord>({
        user: input.userId,
        account: input.accountId ?? "",
        campaign: input.campaignId ?? "",
        type: input.type,
        status: "queued",
        idempotency_key: input.idempotencyKey,
        not_before: input.notBefore ?? "",
        attempts: 0,
      });
    } catch (error) {
      const filter = pb.filter("idempotency_key = {:key}", { key: input.idempotencyKey });
      try {
        return await pb.collection("telegram_jobs").getFirstListItem<TelegramJobRecord>(filter);
      } catch {
        throw error;
      }
    }
  }

  async getPendingSyncJob(accountId: string): Promise<TelegramJobRecord | null> {
    const pb = await getPocketBaseAdmin();
    try {
      return await pb.collection("telegram_jobs").getFirstListItem<TelegramJobRecord>(
        pb.filter('account = {:account} && type = "sync_chats" && (status = "queued" || status = "running")', {
          account: accountId,
        }),
        { sort: "created" },
      );
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async getNextJob(): Promise<TelegramJobRecord | null> {
    const pb = await getPocketBaseAdmin();
    const now = new Date().toISOString();
    try {
      const stale = await pb.collection("telegram_jobs").getFirstListItem<TelegramJobRecord>(
        pb.filter('status = "running" && lease_expires_at != "" && lease_expires_at <= {:now}', { now }),
        { sort: "lease_expires_at" },
      );
      await pb.collection("telegram_jobs").update(stale.id, {
        status: "queued",
        lease_owner: "",
        lease_expires_at: "",
        safe_error: "Worker lease expired; safely requeued.",
      });
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
    try {
      return await pb.collection("telegram_jobs").getFirstListItem<TelegramJobRecord>(
        pb.filter('status = "queued" && (not_before = "" || not_before <= {:now})', { now }),
        { sort: "created" },
      );
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async getJob(jobId: string) {
    const pb = await getPocketBaseAdmin();
    return pb.collection("telegram_jobs").getOne<TelegramJobRecord>(jobId);
  }

  async claimJob(jobId: string, workerId: string): Promise<TelegramJobRecord> {
    const pb = await getPocketBaseAdmin();
    return pb.collection("telegram_jobs").update<TelegramJobRecord>(jobId, {
      status: "running",
      lease_owner: workerId,
      lease_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      "attempts+": 1,
      safe_error: "",
    });
  }

  async completeJob(jobId: string) {
    const pb = await getPocketBaseAdmin();
    await pb.collection("telegram_jobs").update(jobId, {
      status: "completed",
      lease_owner: "",
      lease_expires_at: "",
    });
  }

  async failJob(jobId: string, safeError: string) {
    const pb = await getPocketBaseAdmin();
    await pb.collection("telegram_jobs").update(jobId, {
      status: "failed",
      safe_error: safeError,
      lease_owner: "",
      lease_expires_at: "",
    });
  }

  async waitJob(jobId: string, notBefore: string, safeError: string) {
    const pb = await getPocketBaseAdmin();
    await pb.collection("telegram_jobs").update(jobId, {
      status: "queued",
      not_before: notBefore,
      safe_error: safeError,
      lease_owner: "",
      lease_expires_at: "",
    });
  }
}

export const telegramRepository = new TelegramRepository();
