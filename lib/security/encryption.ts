import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { getTelegramEnv } from "@/lib/env";

export interface EncryptedEnvelope {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

export interface EncryptionContext {
  purpose: "telegram-session" | "telegram-challenge" | "telegram-peer";
  userId: string;
  resourceId?: string;
}

function additionalData(context: EncryptionContext) {
  return Buffer.from(
    `osing:v1:${context.purpose}:${context.userId}:${context.resourceId ?? "root"}`,
    "utf8",
  );
}

export function encryptSecret(value: string, context: EncryptionContext): EncryptedEnvelope {
  const { encryptionKey, TELEGRAM_SESSION_KEY_VERSION } = getTelegramEnv();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  cipher.setAAD(additionalData(context));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: TELEGRAM_SESSION_KEY_VERSION,
  };
}

export function decryptSecret(envelope: EncryptedEnvelope, context: EncryptionContext): string {
  const { encryptionKey, TELEGRAM_SESSION_KEY_VERSION } = getTelegramEnv();
  if (envelope.keyVersion !== TELEGRAM_SESSION_KEY_VERSION) {
    throw new Error("Unsupported Telegram session encryption key version");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(envelope.iv, "base64"));
  decipher.setAAD(additionalData(context));
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
