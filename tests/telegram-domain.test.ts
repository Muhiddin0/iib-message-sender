import { tl } from "@mtcute/core";
import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { summarizeDeliveryStatuses } from "@/lib/repositories/campaign-repository";
import { telegramError } from "@/lib/telegram/errors";
import { telegramChatPermissions, type TelegramChatPermissionSource } from "@/lib/telegram/permissions";

function peer(overrides: Partial<TelegramChatPermissionSource> = {}): TelegramChatPermissionSource {
  return {
    chatType: "supergroup",
    isCreator: false,
    isAdmin: false,
    isBanned: false,
    isMember: true,
    adminRights: null,
    permissions: { canSendText: true, canSendPhotos: false, canSendVideos: false },
    defaultPermissions: null,
    ...overrides,
  };
}

describe("Telegram chat permissions", () => {
  it("uses effective group restrictions", () => {
    expect(telegramChatPermissions(peer())).toEqual({ text: true, photo: false, video: false });
  });

  it("never marks banned chats as sendable", () => {
    expect(telegramChatPermissions(peer({ isAdmin: true, isBanned: true }))).toEqual({ text: false, photo: false, video: false });
  });

  it("requires postMessages rights in broadcast channels", () => {
    expect(telegramChatPermissions(peer({ chatType: "channel", isAdmin: true }))).toEqual({ text: false, photo: false, video: false });
    expect(telegramChatPermissions(peer({ chatType: "channel", isAdmin: true, adminRights: { postMessages: true } }))).toEqual({ text: true, photo: true, video: true });
  });
});

describe("Telegram error policy", () => {
  it("turns flood wait into a resumable structured error", () => {
    const mapped = telegramError(new tl.RpcError(420, "FLOOD_WAIT_42"));
    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped.code).toBe("TELEGRAM_FLOOD_WAIT");
    expect(mapped.retryAfterSeconds).toBe(42);
    expect(mapped.message).not.toContain("FLOOD_WAIT");
  });

  it("maps invalid sessions without leaking raw errors", () => {
    const mapped = telegramError(new tl.RpcError(401, "SESSION_REVOKED"));
    expect(mapped.code).toBe("TELEGRAM_UNAUTHORIZED");
    expect(mapped.message).not.toContain("SESSION_REVOKED");
  });

  it("maps revoked send permission", () => {
    expect(telegramError(new tl.RpcError(403, "CHAT_WRITE_FORBIDDEN")).code).toBe("TELEGRAM_PERMISSION_DENIED");
  });
});

describe("campaign delivery summary", () => {
  it("preserves a partial failure instead of failing the whole campaign", () => {
    expect(summarizeDeliveryStatuses(["sent", "sent", "failed"])).toEqual({ sent: 2, failed: 1, pending: 0, status: "partial" });
  });

  it("keeps a campaign sending while any delivery is pending", () => {
    expect(summarizeDeliveryStatuses(["sent", "queued", "flood_wait"])).toEqual({ sent: 1, failed: 0, pending: 2, status: "sending" });
  });
});

