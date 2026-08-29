import { describe, expect, it } from "vitest";

import { authErrorMessage } from "@/lib/auth/error-message";

describe("authentication error messages", () => {
  it("explains the common OAuth callback hostname mismatch safely", () => {
    const message = authErrorMessage("OAuthCallback");
    expect(message).toContain("localhost va 127.0.0.1");
    expect(message).not.toContain("token");
  });

  it("does not expose unknown raw error codes", () => {
    expect(authErrorMessage("raw-secret-provider-error")).not.toContain("raw-secret-provider-error");
  });
});
