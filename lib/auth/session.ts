import "server-only";

import { cache } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { AppError } from "@/lib/errors";
import { userRepository } from "@/lib/repositories/user-repository";

export const getCurrentUser = cache(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const user = await userRepository.findById(session.user.id);
  if (!user || user.sessionVersion !== session.user.sessionVersion) return null;
  return user;
});

export async function requirePageUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  return user;
}

export async function requireApiUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new AppError("UNAUTHENTICATED", "Tizimga qayta kiring.", 401);
  }
  return user;
}
