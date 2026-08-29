// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

import { MessageComposer } from "@/components/campaign/message-composer";
import type { TelegramChat } from "@/types/domain";

const chats: TelegramChat[] = [
  { id: "a", telegramPeerId: "-1001", title: "Alpha Group", username: "alpha", type: "group", participantCount: 12, canSendText: true, canSendPhoto: true, canSendVideo: true, active: true, lastSyncedAt: null },
  { id: "b", telegramPeerId: "-1002", title: "Beta Channel", username: "beta", type: "channel", participantCount: 50, canSendText: true, canSendPhoto: true, canSendVideo: false, active: true, lastSyncedAt: null },
  { id: "c", telegramPeerId: "-1003", title: "Read-only Channel", username: "readonly", type: "channel", participantCount: 100, canSendText: false, canSendPhoto: false, canSendVideo: false, active: true, lastSyncedAt: null },
];

describe("message creation UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "campaign-a" }) }));
  });

  it("searches, selects a chat, and starts the real campaign request", async () => {
    render(<MessageComposer chats={chats} />);
    fireEvent.change(screen.getByLabelText("Chatlarni qidirish"), { target: { value: "Alpha" } });
    expect(screen.getByText("Alpha Group")).toBeInTheDocument();
    expect(screen.queryByText("Beta Channel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Alpha Group chatini tanlash"));
    fireEvent.change(screen.getByLabelText("Xabar matni"), { target: { value: "Salom" } });
    fireEvent.click(screen.getByRole("button", { name: "1 ta chatga yuborish" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/campaigns", expect.objectContaining({ method: "POST" })));
    expect(navigation.push).toHaveBeenCalledWith("/campaign/campaign-a");
  });

  it("shows chats without post permission but does not allow selecting them", () => {
    render(<MessageComposer chats={chats} />);

    expect(screen.getByText("Read-only Channel")).toBeInTheDocument();
    expect(screen.getByText("Yuborish ruxsati yo‘q")).toBeInTheDocument();
    expect(screen.getByLabelText("Read-only Channel chatini tanlash")).toHaveAttribute("aria-disabled", "true");
  });
});
