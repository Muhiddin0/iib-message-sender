import { redirect } from "next/navigation";

import { ConnectFlow } from "@/components/telegram/connect-flow";
import { requirePageUser } from "@/lib/auth/session";
import { telegramRepository } from "@/lib/repositories/telegram-repository";
import { telegramService } from "@/lib/telegram/service";

export default async function TelegramConnectPage() {
  const user = await requirePageUser();
  if (await telegramRepository.getAccount(user.id)) redirect("/dashboard");
  const authorization = await telegramService.getActiveAuthorization(user.id);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center px-4 py-10 sm:px-6">
      <div className="w-full">
        <ConnectFlow initialState={authorization.state} initialMethod={authorization.method} />
      </div>
    </main>
  );
}
