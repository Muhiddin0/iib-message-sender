import { describe, expect, it } from "vitest";

import { normalizeTelegramMessageLink } from "@/lib/telegram/message-link";

describe("Telegram message links", () => {
  it("normalizes public and private message links", () => {
    expect(normalizeTelegramMessageLink("t.me/public_channel/42")).toBe("https://t.me/public_channel/42");
    expect(normalizeTelegramMessageLink("https://telegram.me/c/123456/78?single")).toBe(
      "https://t.me/c/123456/78?single",
    );
    expect(normalizeTelegramMessageLink("https://t.me/s/public_channel/42")).toBe(
      "https://t.me/s/public_channel/42",
    );
  });

  it("rejects other hosts and non-message Telegram URLs", () => {
    expect(normalizeTelegramMessageLink("https://example.com/channel/42")).toBeNull();
    expect(normalizeTelegramMessageLink("https://t.me/share/url?url=https://example.com")).toBeNull();
    expect(normalizeTelegramMessageLink("https://t.me/channel/not-a-message")).toBeNull();
  });
});
