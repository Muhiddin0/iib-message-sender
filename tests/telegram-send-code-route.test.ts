import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  beginAuthorization: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/telegram/service", () => ({
  telegramService: { beginAuthorization: mocks.beginAuthorization },
}));

import { POST } from "@/app/api/telegram/send-code/route";
import { TELEGRAM_PHONE_ERROR_MESSAGE } from "@/lib/telegram/phone";

function request(phone: unknown) {
  return new Request("http://localhost/api/telegram/send-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
}

describe("POST /api/telegram/send-code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ id: "user-a" });
    mocks.beginAuthorization.mockResolvedValue({ state: "code_required" });
  });

  it("rejects an invalid phone number before calling Telegram", async () => {
    const response = await POST(request("99890123"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: TELEGRAM_PHONE_ERROR_MESSAGE,
      },
    });
    expect(mocks.beginAuthorization).not.toHaveBeenCalled();
  });

  it("normalizes a formatted international number before calling Telegram", async () => {
    const response = await POST(request("+998 (90) 123-45-67"));

    expect(response.status).toBe(200);
    expect(mocks.beginAuthorization).toHaveBeenCalledWith("user-a", "+998901234567");
  });
});
