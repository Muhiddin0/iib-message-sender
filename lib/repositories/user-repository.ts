import "server-only";

import { randomBytes } from "node:crypto";
import PocketBase from "pocketbase";

import { getPocketBaseEnv } from "@/lib/env";
import { getPocketBaseAdmin } from "@/lib/pocketbase/client";
import type { UserRecord } from "@/lib/pocketbase/records";
import { hasResponseStatus, isNotFoundError, nullable } from "@/lib/repositories/helpers";
import type { AppUser } from "@/types/domain";

function toAppUser(record: UserRecord): AppUser {
  return {
    id: record.id,
    email: record.email,
    name: record.name || record.email.split("@")[0],
    avatarUrl: nullable(record.avatar_url),
    sessionVersion: record.session_version || 1,
  };
}

export class UserRepository {
  async findById(id: string): Promise<AppUser | null> {
    const pb = await getPocketBaseAdmin();
    try {
      const record = await pb.collection("users").getOne<UserRecord>(id);
      return toAppUser(record);
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async upsertGoogleUser(input: {
    googleSubject: string;
    email: string;
    name: string;
    avatarUrl?: string | null;
  }): Promise<AppUser> {
    const pb = await getPocketBaseAdmin();
    const filter = pb.filter("google_subject = {:subject}", { subject: input.googleSubject });

    let existing: UserRecord | null = null;
    try {
      existing = await pb.collection("users").getFirstListItem<UserRecord>(filter);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }

    if (!existing) {
      try {
        existing = await pb.collection("users").getFirstListItem<UserRecord>(
          pb.filter("email = {:email}", { email: input.email.toLowerCase() }),
        );
      } catch (error) {
        if (!isNotFoundError(error)) throw error;
      }
    }

    if (existing) {
      const updated = await pb.collection("users").update<UserRecord>(existing.id, {
        email: input.email.toLowerCase(),
        name: input.name,
        google_subject: input.googleSubject,
        avatar_url: input.avatarUrl ?? "",
        verified: true,
        last_login_at: new Date().toISOString(),
      });
      return toAppUser(updated);
    }

    const password = randomBytes(32).toString("base64url");
    const created = await pb.collection("users").create<UserRecord>({
      email: input.email.toLowerCase(),
      emailVisibility: false,
      verified: true,
      password,
      passwordConfirm: password,
      name: input.name,
      google_subject: input.googleSubject,
      avatar_url: input.avatarUrl ?? "",
      session_version: 1,
      last_login_at: new Date().toISOString(),
    });
    return toAppUser(created);
  }

  async authenticateWithPassword(email: string, password: string): Promise<AppUser | null> {
    const client = new PocketBase(getPocketBaseEnv().POCKETBASE_URL);
    client.autoCancellation(false);
    try {
      const result = await client
        .collection("users")
        .authWithPassword<UserRecord>(email.toLowerCase(), password);
      const pb = await getPocketBaseAdmin();
      const updated = await pb.collection("users").update<UserRecord>(result.record.id, {
        last_login_at: new Date().toISOString(),
      });
      return toAppUser(updated);
    } catch (error) {
      if (hasResponseStatus(error, 400)) return null;
      throw error;
    } finally {
      client.authStore.clear();
    }
  }
}

export const userRepository = new UserRepository();
