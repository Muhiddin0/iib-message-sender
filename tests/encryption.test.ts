import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "@/lib/security/encryption";

describe("Telegram session encryption", () => {
  it("round-trips only with matching authenticated context", () => {
    const encrypted = encryptSecret("sensitive-session", { purpose: "telegram-session", userId: "user-a" });
    expect(encrypted.ciphertext).not.toContain("sensitive-session");
    expect(decryptSecret(encrypted, { purpose: "telegram-session", userId: "user-a" })).toBe("sensitive-session");
  });

  it("prevents another user from decrypting the session", () => {
    const encrypted = encryptSecret("sensitive-session", { purpose: "telegram-session", userId: "user-a" });
    expect(() => decryptSecret(encrypted, { purpose: "telegram-session", userId: "user-b" })).toThrow();
  });
});

