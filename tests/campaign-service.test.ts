import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  campaignCreate: vi.fn(),
  getAccountRecord: vi.fn(),
  getOwnedChats: vi.fn(),
  enqueueJob: vi.fn(),
  inspectForwardSource: vi.fn(),
}));

vi.mock("@/lib/repositories/campaign-repository", () => ({
  campaignRepository: { create: mocks.campaignCreate },
}));
vi.mock("@/lib/repositories/telegram-repository", () => ({
  telegramRepository: {
    getAccountRecord: mocks.getAccountRecord,
    getOwnedChats: mocks.getOwnedChats,
    enqueueJob: mocks.enqueueJob,
  },
}));
vi.mock("@/lib/telegram/service", () => ({
  telegramService: { inspectForwardSource: mocks.inspectForwardSource },
}));

import { campaignService } from "@/lib/campaign/service";

const campaignId = "campaign1";
const uuid = "3c6d2e92-fb65-44ca-8b02-8d5f6a0c88d1";

function form(chatIds = ["chat-a", "chat-b"]) {
  const data = new FormData();
  data.set("kind", "text");
  data.set("body", "Assalomu alaykum");
  data.set("chatIds", JSON.stringify(chatIds));
  data.set("idempotencyKey", uuid);
  return data;
}

describe("CampaignService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccountRecord.mockResolvedValue({ id: "account-a", status: "connected" });
    mocks.getOwnedChats.mockResolvedValue([
      { id: "chat-a", account: "account-a", telegram_peer_id: "-1001", title: "A", type: "group", can_send_text: true },
      { id: "chat-b", account: "account-a", telegram_peer_id: "-1002", title: "B", type: "channel", can_send_text: true },
    ]);
    mocks.campaignCreate.mockResolvedValue({ campaign: { id: campaignId }, created: true });
    mocks.inspectForwardSource.mockResolvedValue({
      link: "https://t.me/source/42",
      messageId: "42",
      chatTitle: "Source",
      body: "Forward matni",
      kind: "text",
    });
  });

  it("creates one delivery source per verified recipient and queues a worker job", async () => {
    await expect(campaignService.create("user-a", form())).resolves.toEqual({ id: campaignId, created: true });
    expect(mocks.campaignCreate.mock.calls[0][0].chats).toHaveLength(2);
    expect(mocks.enqueueJob).toHaveBeenCalledWith(expect.objectContaining({ campaignId, type: "send_campaign" }));
  });

  it("rejects a chat that is not owned by the authenticated user", async () => {
    mocks.getOwnedChats.mockResolvedValue([{ id: "chat-a", account: "account-a", can_send_text: true }]);
    await expect(campaignService.create("user-a", form())).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.campaignCreate).not.toHaveBeenCalled();
  });

  it("rejects a chat that cannot receive the selected message kind", async () => {
    mocks.getOwnedChats.mockResolvedValue([
      { id: "chat-a", account: "account-a", can_send_text: false },
      { id: "chat-b", account: "account-a", can_send_text: true },
    ]);
    await expect(campaignService.create("user-a", form())).rejects.toMatchObject({ code: "TELEGRAM_PERMISSION_DENIED" });
  });

  it("does not enqueue a duplicate idempotent campaign", async () => {
    mocks.campaignCreate.mockResolvedValue({ campaign: { id: campaignId }, created: false });
    await campaignService.create("user-a", form());
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  it("validates a Telegram message link and creates a forward campaign", async () => {
    const data = form(["chat-a"]);
    data.set("mode", "forward");
    data.set("sourceMessageLink", "t.me/source/42");
    mocks.getOwnedChats.mockResolvedValue([
      { id: "chat-a", account: "account-a", telegram_peer_id: "-1001", title: "A", type: "group", can_send_text: true },
    ]);

    await expect(campaignService.create("user-a", data)).resolves.toEqual({ id: campaignId, created: true });
    expect(mocks.inspectForwardSource).toHaveBeenCalledWith("user-a", "https://t.me/source/42");
    expect(mocks.campaignCreate).toHaveBeenCalledWith(expect.objectContaining({
      mode: "forward",
      body: "Forward matni",
      source: {
        link: "https://t.me/source/42",
        messageId: "42",
        chatTitle: "Source",
      },
    }));
  });

  it("rejects non-Telegram forward links before calling Telegram", async () => {
    const data = form(["chat-a"]);
    data.set("mode", "forward");
    data.set("sourceMessageLink", "https://example.com/source/42");

    await expect(campaignService.create("user-a", data)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.inspectForwardSource).not.toHaveBeenCalled();
  });
});
