import "server-only";

import PocketBase from "pocketbase";

import { getPocketBaseEnv } from "@/lib/env";

type PocketBaseGlobal = typeof globalThis & {
  __osingPocketBase?: PocketBase;
  __osingPocketBaseAuth?: Promise<void>;
};

async function authenticate(client: PocketBase) {
  const env = getPocketBaseEnv();
  if (env.POCKETBASE_SUPERUSER_TOKEN) {
    client.authStore.save(env.POCKETBASE_SUPERUSER_TOKEN);
    return;
  }
  await client
    .collection("_superusers")
    .authWithPassword(env.POCKETBASE_SUPERUSER_EMAIL!, env.POCKETBASE_SUPERUSER_PASSWORD!);
}

export async function createPocketBaseAdmin(): Promise<PocketBase> {
  const client = new PocketBase(getPocketBaseEnv().POCKETBASE_URL);
  client.autoCancellation(false);
  await authenticate(client);
  return client;
}

export async function getPocketBaseAdmin(): Promise<PocketBase> {
  const globalState = globalThis as PocketBaseGlobal;
  const env = getPocketBaseEnv();

  if (!globalState.__osingPocketBase) {
    const client = new PocketBase(env.POCKETBASE_URL);
    client.autoCancellation(false);
    globalState.__osingPocketBase = client;
  }

  const client = globalState.__osingPocketBase;
  if (env.POCKETBASE_SUPERUSER_TOKEN) {
    if (client.authStore.token !== env.POCKETBASE_SUPERUSER_TOKEN) await authenticate(client);
    return client;
  }

  if (!client.authStore.isValid) {
    globalState.__osingPocketBaseAuth ??= client
      .collection("_superusers")
      .authWithPassword(env.POCKETBASE_SUPERUSER_EMAIL!, env.POCKETBASE_SUPERUSER_PASSWORD!)
      .then(() => undefined)
      .finally(() => {
        globalState.__osingPocketBaseAuth = undefined;
      });
    await globalState.__osingPocketBaseAuth;
  }

  return client;
}
