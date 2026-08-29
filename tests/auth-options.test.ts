import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateWithPassword: vi.fn(),
  upsertGoogleUser: vi.fn(),
}));

vi.mock("@/lib/repositories/user-repository", () => ({ userRepository: mocks }));

import { authOptions } from "@/lib/auth/options";

describe("application authentication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unknown providers and explicitly unverified Google identities", async () => {
    const signIn = authOptions.callbacks?.signIn as (input: unknown) => Promise<boolean>;
    await expect(signIn({ account: { provider: "unknown" }, profile: {} })).resolves.toBe(false);
    await expect(signIn({ account: { provider: "google", providerAccountId: "g1" }, profile: { email: "a@example.com", email_verified: false } })).resolves.toBe(false);
  });

  it("accepts a verified Google identity", async () => {
    const signIn = authOptions.callbacks?.signIn as (input: unknown) => Promise<boolean>;
    await expect(signIn({ account: { provider: "google", providerAccountId: "g1" }, profile: { email: "a@example.com", email_verified: true } })).resolves.toBe(true);
  });

  it("authenticates PocketBase credentials without returning its auth token", async () => {
    mocks.authenticateWithPassword.mockResolvedValue({
      id: "user-a",
      email: "user@gmail.com",
      name: "User",
      avatarUrl: null,
      sessionVersion: 3,
    });
    const provider = authOptions.providers.find((item) => item.id === "credentials") as unknown as {
      options: { authorize: (credentials: Record<string, string>, request: unknown) => Promise<unknown> };
    };
    expect(await provider.options.authorize({ email: "user@gmail.com", password: "secret123" }, {})).toEqual({
      id: "user-a",
      email: "user@gmail.com",
      name: "User",
      image: null,
      sessionVersion: 3,
    });
  });

  it("returns a generic failed credential result for an invalid password", async () => {
    mocks.authenticateWithPassword.mockResolvedValue(null);
    const provider = authOptions.providers.find((item) => item.id === "credentials") as unknown as {
      options: { authorize: (credentials: Record<string, string>, request: unknown) => Promise<unknown> };
    };
    expect(await provider.options.authorize({ email: "user@gmail.com", password: "wrong" }, {})).toBeNull();
  });

  it("places the PocketBase user identity into the NextAuth JWT", async () => {
    const jwt = authOptions.callbacks?.jwt as (input: unknown) => Promise<Record<string, unknown>>;
    await expect(jwt({
      token: {},
      account: { provider: "credentials" },
      user: { id: "user-a", sessionVersion: 4 },
    })).resolves.toMatchObject({ appUserId: "user-a", sessionVersion: 4 });
  });
});
