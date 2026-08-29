import { describe, expect, it } from "vitest";

import { formatDate } from "@/lib/format";

describe("formatDate", () => {
  it("uses one deterministic Tashkent representation on the server and browser", () => {
    expect(formatDate("2026-08-23T05:59:22.000Z")).toBe("23.08.2026, 10:59");
    expect(formatDate(null)).toBe("—");
  });
});
