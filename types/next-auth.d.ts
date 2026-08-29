import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    sessionVersion?: number;
  }

  interface Session {
    user: {
      id: string;
      sessionVersion: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    appUserId?: string;
    sessionVersion?: number;
  }
}
