import "server-only";

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { z } from "zod";

import { userRepository } from "@/lib/repositories/user-repository";

interface GoogleIdentityProfile {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

function logAuthError(code: string, metadata: Error | { error: Error; [key: string]: unknown }) {
  const error = metadata instanceof Error ? metadata : metadata.error;
  const safeMessage = error.message
    .replace(/https?:\/\/\S+/g, "[url]")
    .replace(/[A-Za-z0-9_-]{40,}/g, "[redacted]")
    .slice(0, 300);
  console.error(`[auth:${code}] ${error.name}: ${safeMessage}`);
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "PocketBase email va parol",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Parol", type: "password" },
      },
      async authorize(credentials) {
        const parsed = z
          .object({ email: z.email(), password: z.string().min(1).max(256) })
          .safeParse(credentials);
        if (!parsed.success) return null;
        const appUser = await userRepository.authenticateWithPassword(
          parsed.data.email,
          parsed.data.password,
        );
        if (!appUser) return null;
        return {
          id: appUser.id,
          email: appUser.email,
          name: appUser.name,
          image: appUser.avatarUrl,
          sessionVersion: appUser.sessionVersion,
        };
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "google-not-configured",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "google-not-configured",
    }),
  ],
  pages: {
    signIn: "/auth/sign-in",
    error: "/auth/sign-in",
  },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60,
  },
  logger: {
    error: logAuthError,
  },
  callbacks: {
    async signIn({ account, profile, user }) {
      if (!account) return false;
      if (account.provider === "credentials") return Boolean(user?.id);
      if (account.provider !== "google") return false;
      const google = profile as GoogleIdentityProfile;
      return Boolean(google.email && google.email_verified !== false && account.providerAccountId);
    },
    async jwt({ token, account, profile, user }) {
      if (account?.provider === "google") {
        const google = profile as GoogleIdentityProfile;
        if (!google.email) return token;
        const appUser = await userRepository.upsertGoogleUser({
          googleSubject: account.providerAccountId,
          email: google.email,
          name: google.name ?? google.email.split("@")[0],
          avatarUrl: google.picture,
        });
        token.appUserId = appUser.id;
        token.sessionVersion = appUser.sessionVersion;
      } else if (account?.provider === "credentials" && user?.id) {
        token.appUserId = user.id;
        token.sessionVersion = user.sessionVersion ?? 1;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.appUserId === "string") {
        session.user.id = token.appUserId;
        session.user.sessionVersion =
          typeof token.sessionVersion === "number" ? token.sessionVersion : 1;
      }
      return session;
    },
  },
};
