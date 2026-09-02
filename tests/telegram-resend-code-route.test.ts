import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  resendAuthorizationCode: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/telegram/service", () => ({
  telegramService: { resendAuthorizationCode: mocks.resendAuthorizationCode },
}));

import { POST } from "@/app/api/telegram/resend-code/route";

describe("POST /api/telegram/resend-code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ id: "user-a" });
    mocks.resendAuthorizationCode.mockResolvedValue({
      state: "code_required",
      deliveryType: "sms",
      codeLength: 5,
      resendAfterSeconds: 30,
    });
  });

  it("resends a code for the authenticated user", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      state: "code_required",
      resendAfterSeconds: 30,
    });
    expect(mocks.resendAuthorizationCode).toHaveBeenCalledWith("user-a");
  });
});
