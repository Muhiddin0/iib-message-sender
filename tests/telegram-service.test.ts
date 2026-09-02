import { tl } from "@mtcute/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getAccount: vi.fn(),
  getAccountRecord: vi.fn(),
  createAccount: vi.fn(),
  deleteAccount: vi.fn(),
  saveSession: vi.fn(),
  getSession: vi.fn(),
  getChallenge: vi.fn(),
  saveChallenge: vi.fn(),
  deleteChallenge: vi.fn(),
  enqueueJob: vi.fn(),
}));

vi.mock("@/lib/telegram/client", () => ({ createTelegramClient: mocks.createClient }));
vi.mock("@/lib/repositories/telegram-repository", () => ({
  telegramRepository: {
    getAccount: mocks.getAccount,
    getAccountRecord: mocks.getAccountRecord,
    createAccount: mocks.createAccount,
    deleteAccount: mocks.deleteAccount,
    saveSession: mocks.saveSession,
    getSession: mocks.getSession,
    getChallenge: mocks.getChallenge,
    saveChallenge: mocks.saveChallenge,
    deleteChallenge: mocks.deleteChallenge,
    enqueueJob: mocks.enqueueJob,
  },
}));

import { encryptSecret } from "@/lib/security/encryption";
import { telegramService } from "@/lib/telegram/service";

function client() {
  return {
    sendCode: vi.fn().mockResolvedValue({ phoneCodeHash: "hash", type: "app", length: 5 }),
    exportSession: vi.fn().mockResolvedValue("raw-session-secret"),
    importSession: vi.fn().mockResolvedValue(undefined),
    signIn: vi.fn().mockResolvedValue({ id: 77, firstName: "Ali", lastName: null, username: "ali" }),
    checkPassword: vi.fn().mockResolvedValue({ id: 77, firstName: "Ali", lastName: null, username: "ali" }),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

function challenge(saved: { state: string; envelope: { ciphertext: string; iv: string; authTag: string; keyVersion: number }; expiresAt: string }) {
  return {
    id: "challenge",
    user: "user-a",
    state: saved.state,
    ciphertext: saved.envelope.ciphertext,
    iv: saved.envelope.iv,
    auth_tag: saved.envelope.authTag,
    key_version: saved.envelope.keyVersion,
    attempts: 0,
    expires_at: saved.expiresAt,
  };
}

describe("TelegramService authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccount.mockResolvedValue(null);
    mocks.createAccount.mockResolvedValue({ id: "account-a" });
    mocks.deleteAccount.mockResolvedValue(undefined);
    mocks.saveSession.mockResolvedValue(undefined);
    mocks.deleteChallenge.mockResolvedValue(undefined);
    mocks.enqueueJob.mockResolvedValue({ id: "job" });
  });

  it("completes phone code authorization and persists only encrypted session data", async () => {
    const telegram = client();
    mocks.createClient.mockReturnValue(telegram);
    let saved: ReturnType<typeof challenge> | undefined;
    mocks.saveChallenge.mockImplementation(async (input) => { saved = challenge(input); });

    await expect(telegramService.beginAuthorization("user-a", "+998901234567")).resolves.toMatchObject({ state: "code_required" });
    expect(saved?.ciphertext).not.toContain("raw-session-secret");
    mocks.getChallenge.mockResolvedValue(saved);

    await expect(telegramService.verifyCode("user-a", "12345")).resolves.toEqual({ state: "connected", accountId: "account-a" });
    expect(mocks.saveSession).toHaveBeenCalledOnce();
    expect(JSON.stringify(mocks.saveSession.mock.calls[0])).not.toContain("raw-session-secret");
    expect(mocks.enqueueJob).toHaveBeenCalledWith(expect.objectContaining({ type: "sync_chats" }));
  });

  it("transitions to 2FA without exposing or losing the authorization session", async () => {
    const telegram = client();
    telegram.signIn.mockRejectedValue(new tl.RpcError(401, "SESSION_PASSWORD_NEEDED"));
    mocks.createClient.mockReturnValue(telegram);
    let saved: ReturnType<typeof challenge> | undefined;
    mocks.saveChallenge.mockImplementation(async (input) => { saved = challenge(input); });
    await telegramService.beginAuthorization("user-a", "+998901234567");
    mocks.getChallenge.mockResolvedValue(saved);

    await expect(telegramService.verifyCode("user-a", "12345")).resolves.toEqual({ state: "password_required" });
    expect(mocks.saveChallenge).toHaveBeenLastCalledWith(expect.objectContaining({ state: "password_required" }));
    expect(mocks.createAccount).not.toHaveBeenCalled();
  });

  it("maps an invalid verification code and increments the guarded challenge", async () => {
    const telegram = client();
    telegram.signIn.mockRejectedValue(new tl.RpcError(400, "PHONE_CODE_INVALID"));
    mocks.createClient.mockReturnValue(telegram);
    const payload = { session: "raw-session-secret", phone: "+998901234567", phoneCodeHash: "hash" };
    const encrypted = encryptSecret(JSON.stringify(payload), { purpose: "telegram-challenge", userId: "user-a" });
    mocks.getChallenge.mockResolvedValue({
      id: "challenge", state: "code_required", attempts: 0, expires_at: new Date(Date.now() + 60_000).toISOString(),
      ciphertext: encrypted.ciphertext, iv: encrypted.iv, auth_tag: encrypted.authTag, key_version: encrypted.keyVersion,
    });

    await expect(telegramService.verifyCode("user-a", "00000")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.saveChallenge).toHaveBeenCalledWith(expect.objectContaining({ attempts: 1 }));
  });

  it("cancels an authorization challenge so the phone number can be changed", async () => {
    await expect(telegramService.cancelAuthorization("user-a")).resolves.toBeUndefined();
    expect(mocks.deleteChallenge).toHaveBeenCalledWith("user-a");
  });

  it("reports a revoked stored session as authorization required", async () => {
    const telegram = client() as ReturnType<typeof client> & { iterDialogs: ReturnType<typeof vi.fn> };
    telegram.iterDialogs = vi.fn().mockReturnValue({
      [Symbol.asyncIterator]() {
        return { next: async () => { throw new tl.RpcError(401, "SESSION_REVOKED"); } };
      },
    });
    mocks.createClient.mockReturnValue(telegram);
    const encrypted = encryptSecret("stored-session", { purpose: "telegram-session", userId: "user-a" });
    mocks.getSession.mockResolvedValue({
      ciphertext: encrypted.ciphertext, iv: encrypted.iv, auth_tag: encrypted.authTag, key_version: encrypted.keyVersion,
    });
    await expect(telegramService.getChats("user-a")).rejects.toMatchObject({ code: "TELEGRAM_UNAUTHORIZED" });
  });

  it("includes archived sendable groups and deduplicates Telegram dialogs", async () => {
    const telegram = client() as ReturnType<typeof client> & { iterDialogs: ReturnType<typeof vi.fn> };
    const group = {
      type: "chat",
      chatType: "supergroup",
      id: -1001,
      title: "Public Group",
      username: "public_group",
      membersCount: 42,
      isCreator: false,
      isAdmin: false,
      isBanned: false,
      isMember: true,
      adminRights: null,
      permissions: { canSendText: true, canSendPhotos: true, canSendVideos: true },
      defaultPermissions: null,
    };
    telegram.iterDialogs = vi.fn().mockImplementation(async function* () {
      yield { peer: group };
      yield { peer: group };
    });
    mocks.createClient.mockReturnValue(telegram);
    const encrypted = encryptSecret("stored-session", { purpose: "telegram-session", userId: "user-a" });
    mocks.getSession.mockResolvedValue({
      ciphertext: encrypted.ciphertext, iv: encrypted.iv, auth_tag: encrypted.authTag, key_version: encrypted.keyVersion,
    });

    await expect(telegramService.getChats("user-a")).resolves.toEqual([
      expect.objectContaining({ title: "Public Group", type: "supergroup", canSendText: true }),
    ]);
    expect(telegram.iterDialogs).toHaveBeenCalledWith({ archived: "keep" });
  });

  it("reports zero for enabled channel reactions and comments without activity", async () => {
    const telegram = client() as ReturnType<typeof client> & {
      getMessages: ReturnType<typeof vi.fn>;
      getFullChat: ReturnType<typeof vi.fn>;
    };
    telegram.getMessages = vi.fn().mockResolvedValue([{
      views: 1,
      reactions: null,
      replies: null,
      chat: { type: "chat", chatType: "channel" },
    }]);
    telegram.getFullChat = vi.fn().mockResolvedValue({
      full: { _: "channelFull", availableReactions: { _: "chatReactionsAll" } },
      linkedChat: { id: -2001 },
    });
    mocks.createClient.mockReturnValue(telegram);
    const encrypted = encryptSecret("stored-session", { purpose: "telegram-session", userId: "user-a" });
    mocks.getSession.mockResolvedValue({
      ciphertext: encrypted.ciphertext, iv: encrypted.iv, auth_tag: encrypted.authTag, key_version: encrypted.keyVersion,
    });

    await expect(telegramService.getMessageMetrics("user-a", "-1001", "7")).resolves.toEqual({
      views: 1,
      reactions: 0,
      replies: 0,
    });
  });

  it("keeps disabled channel reactions and comments unavailable", async () => {
    const telegram = client() as ReturnType<typeof client> & {
      getMessages: ReturnType<typeof vi.fn>;
      getFullChat: ReturnType<typeof vi.fn>;
    };
    telegram.getMessages = vi.fn().mockResolvedValue([{
      views: 1,
      reactions: null,
      replies: null,
      chat: { type: "chat", chatType: "channel" },
    }]);
    telegram.getFullChat = vi.fn().mockResolvedValue({
      full: { _: "channelFull", availableReactions: { _: "chatReactionsNone" } },
      linkedChat: null,
    });
    mocks.createClient.mockReturnValue(telegram);
    const encrypted = encryptSecret("stored-session", { purpose: "telegram-session", userId: "user-a" });
    mocks.getSession.mockResolvedValue({
      ciphertext: encrypted.ciphertext, iv: encrypted.iv, auth_tag: encrypted.authTag, key_version: encrypted.keyVersion,
    });

    await expect(telegramService.getMessageMetrics("user-a", "-1001", "7")).resolves.toEqual({
      views: 1,
      reactions: null,
      replies: null,
    });
  });

  it("inspects an accessible forward source without downloading its media", async () => {
    const telegram = client() as ReturnType<typeof client> & {
      getMessageByLink: ReturnType<typeof vi.fn>;
    };
    telegram.getMessageByLink = vi.fn().mockResolvedValue({
      id: 42,
      isService: false,
      canBeForwarded: true,
      media: { type: "photo" },
      text: "Rasm izohi",
      chat: { displayName: "Source Channel" },
    });
    mocks.createClient.mockReturnValue(telegram);
    const encrypted = encryptSecret("stored-session", { purpose: "telegram-session", userId: "user-a" });
    mocks.getSession.mockResolvedValue({
      ciphertext: encrypted.ciphertext, iv: encrypted.iv, auth_tag: encrypted.authTag, key_version: encrypted.keyVersion,
    });

    await expect(telegramService.inspectForwardSource("user-a", "https://t.me/source/42")).resolves.toEqual({
      link: "https://t.me/source/42",
      messageId: "42",
      chatTitle: "Source Channel",
      body: "Rasm izohi",
      kind: "photo",
    });
  });

  it("forwards with the persisted random ID and returns the destination permalink", async () => {
    const telegram = client() as ReturnType<typeof client> & {
      getMessageByLink: ReturnType<typeof vi.fn>;
      resolvePeer: ReturnType<typeof vi.fn>;
      call: ReturnType<typeof vi.fn>;
      handleClientUpdate: ReturnType<typeof vi.fn>;
      getMessages: ReturnType<typeof vi.fn>;
    };
    telegram.getMessageByLink = vi.fn().mockResolvedValue({
      id: 42,
      isService: false,
      canBeForwarded: true,
      chat: { inputPeer: { _: "inputPeerChannel", channelId: 100, accessHash: 1 } },
    });
    telegram.resolvePeer = vi.fn().mockResolvedValue({ _: "inputPeerChannel", channelId: 200, accessHash: 2 });
    telegram.call = vi.fn().mockImplementation(async (request) => ({
      _: "updates",
      updates: [{ _: "updateMessageID", id: 99, randomId: request.randomId[0] }],
      users: [],
      chats: [],
      date: 0,
      seq: 0,
    }));
    telegram.handleClientUpdate = vi.fn();
    telegram.getMessages = vi.fn().mockResolvedValue([{ id: 99, link: "https://t.me/target/99" }]);
    mocks.createClient.mockReturnValue(telegram);
    const encrypted = encryptSecret("stored-session", { purpose: "telegram-session", userId: "user-a" });
    mocks.getSession.mockResolvedValue({
      ciphertext: encrypted.ciphertext, iv: encrypted.iv, auth_tag: encrypted.authTag, key_version: encrypted.keyVersion,
    });

    await expect(telegramService.forwardMessage({
      userId: "user-a",
      peerId: "-100200",
      sourceMessageLink: "https://t.me/source/42",
      randomIdHex: "0102030405060708",
    })).resolves.toEqual({ id: 99, link: "https://t.me/target/99" });
    expect(telegram.call).toHaveBeenCalledWith(expect.objectContaining({
      _: "messages.forwardMessages",
      id: [42],
      randomId: [expect.objectContaining({ low: 67305985, high: 134678021 })],
    }));
  });
});
