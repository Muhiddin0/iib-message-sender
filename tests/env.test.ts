import { afterEach, describe, expect, it, vi } from "vitest";

import { getPocketBaseEnv } from "@/lib/env";

describe("PocketBase environment", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts an intentionally blank optional token with email/password fallback", () => {
    vi.stubEnv("POCKETBASE_URL", "http://127.0.0.1:8090");
    vi.stubEnv("POCKETBASE_SUPERUSER_TOKEN", "");
    vi.stubEnv("POCKETBASE_SUPERUSER_EMAIL", "admin@example.com");
    vi.stubEnv("POCKETBASE_SUPERUSER_PASSWORD", "secure-password");
    expect(getPocketBaseEnv()).toMatchObject({
      POCKETBASE_SUPERUSER_TOKEN: undefined,
      POCKETBASE_SUPERUSER_EMAIL: "admin@example.com",
    });
  });

  it("accepts token auth when fallback fields are blank", () => {
    vi.stubEnv("POCKETBASE_URL", "http://127.0.0.1:8090");
    vi.stubEnv("POCKETBASE_SUPERUSER_TOKEN", "signed-admin-token");
    vi.stubEnv("POCKETBASE_SUPERUSER_EMAIL", "");
    vi.stubEnv("POCKETBASE_SUPERUSER_PASSWORD", "");
    expect(getPocketBaseEnv()).toMatchObject({
      POCKETBASE_SUPERUSER_TOKEN: "signed-admin-token",
      POCKETBASE_SUPERUSER_EMAIL: undefined,
      POCKETBASE_SUPERUSER_PASSWORD: undefined,
    });
  });
});
