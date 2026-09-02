import "server-only";

import { MemoryStorage, TelegramClient } from "@mtcute/node";
import { networkMiddlewares } from "@mtcute/core";

import { getTelegramEnv } from "@/lib/env";

export function createTelegramClient(options: { disableUpdates?: boolean } = {}) {
  const { TELEGRAM_API_ID, TELEGRAM_API_HASH } = getTelegramEnv();
  return new TelegramClient({
    apiId: TELEGRAM_API_ID,
    apiHash: TELEGRAM_API_HASH,
    storage: new MemoryStorage(),
    disableUpdates: options.disableUpdates ?? true,
    network: {
      middlewares: networkMiddlewares.basic({
        floodWaiter: {
          maxWait: 0,
          maxRetries: 0,
        },
      }),
    },
  });
}
