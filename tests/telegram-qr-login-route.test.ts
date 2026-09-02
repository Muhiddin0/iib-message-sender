import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  authorizeWithQr: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/telegram/service", () => ({
  telegramService: { authorizeWithQr: mocks.authorizeWithQr },
}));

import { POST } from "@/app/api/telegram/qr-login/route";

describe("POST /api/telegram/qr-login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ id: "user-a" });
    mocks.authorizeWithQr.mockImplementation(async (_userId, input) => {
      input.onUrlUpdated("tg://login?token=secret-token", new Date("2030-01-01T00:00:00.000Z"));
      input.onQrScanned();
      return { state: "connected", accountId: "account-a" };
    });
  });

  it("streams QR updates and completes authorization for the authenticated user", async () => {
    const response = await POST(new Request("http://localhost/api/telegram/qr-login", { method: "POST" }));
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");
    expect(events).toEqual([
      {
        state: "qr_pending",
        url: "tg://login?token=secret-token",
        expiresAt: "2030-01-01T00:00:00.000Z",
      },
      { state: "qr_scanned" },
      { state: "connected", accountId: "account-a" },
    ]);
    expect(mocks.authorizeWithQr).toHaveBeenCalledWith("user-a", expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
  });
});
