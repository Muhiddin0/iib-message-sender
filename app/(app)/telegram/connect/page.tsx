import { redirect } from "next/navigation";

import { ConnectFlow } from "@/components/telegram/connect-flow";
import { requirePageUser } from "@/lib/auth/session";
import { telegramRepository } from "@/lib/repositories/telegram-repository";
import type { TelegramAuthState } from "@/types/domain";

export default async function TelegramConnectPage() {
  const user = await requirePageUser();
  if (await telegramRepository.getAccount(user.id)) redirect("/dashboard");
  const challenge = await telegramRepository.getActiveChallenge(user.id);
  const initialState: TelegramAuthState = challenge?.state ?? "idle";

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center px-4 py-10 sm:px-6">
      <div className="w-full"><ConnectFlow initialState={initialState} /></div>
    </main>
  );
}
