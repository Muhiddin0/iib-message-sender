import "server-only";

import { z } from "zod";

function parseEnvironment<T>(schema: z.ZodType<T>, label: string): T {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`${label} configuration is missing or invalid: ${fields}`);
  }
  return parsed.data;
}

function blankAsUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const pocketBaseSchema = z
  .object({
    POCKETBASE_URL: z.url().default("http://127.0.0.1:8090"),
    POCKETBASE_SUPERUSER_TOKEN: z.preprocess(
      blankAsUndefined,
      z.string().min(1).optional(),
    ),
    POCKETBASE_SUPERUSER_EMAIL: z.preprocess(
      blankAsUndefined,
      z.email().optional(),
    ),
    POCKETBASE_SUPERUSER_PASSWORD: z.preprocess(
      blankAsUndefined,
      z.string().min(8).optional(),
    ),
  })
  .refine(
    (value) =>
      Boolean(value.POCKETBASE_SUPERUSER_TOKEN) ||
      Boolean(value.POCKETBASE_SUPERUSER_EMAIL && value.POCKETBASE_SUPERUSER_PASSWORD),
    { message: "A PocketBase superuser token or email/password pair is required" },
  );

const telegramSchema = z.object({
  TELEGRAM_API_ID: z.coerce.number().int().positive(),
  TELEGRAM_API_HASH: z.string().min(20),
  TELEGRAM_SESSION_ENCRYPTION_KEY: z.string().min(1),
  TELEGRAM_SESSION_KEY_VERSION: z.coerce.number().int().positive().default(1),
});

const workerSchema = z.object({
  TELEGRAM_SEND_CONCURRENCY: z.coerce.number().int().min(1).max(3).default(1),
  TELEGRAM_SEND_DELAY_MS: z.coerce.number().int().min(500).default(1200),
  TELEGRAM_WORKER_POLL_MS: z.coerce.number().int().min(500).default(1500),
  TELEGRAM_MAX_PHOTO_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  TELEGRAM_MAX_VIDEO_BYTES: z.coerce.number().int().positive().default(50 * 1024 * 1024),
});

export function getPocketBaseEnv() {
  return parseEnvironment(pocketBaseSchema, "PocketBase");
}

export function getTelegramEnv() {
  const env = parseEnvironment(telegramSchema, "Telegram");
  const key = Buffer.from(env.TELEGRAM_SESSION_ENCRYPTION_KEY, "base64");
  if (key.byteLength !== 32) {
    throw new Error("TELEGRAM_SESSION_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return { ...env, encryptionKey: key };
}

export function getWorkerEnv() {
  return parseEnvironment(workerSchema, "Telegram worker");
}

export function isGoogleAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.NEXTAUTH_SECRET,
  );
}
