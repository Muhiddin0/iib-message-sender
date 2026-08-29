import { LayerCard, LinkButton } from "@cloudflare/kumo";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react/ssr";

import { MessageComposer } from "@/components/campaign/message-composer";
import { requirePageUser } from "@/lib/auth/session";
import { telegramRepository } from "@/lib/repositories/telegram-repository";

export default async function NewMessagePage() {
  const user = await requirePageUser();
  const account = await telegramRepository.getAccount(user.id);
  if (!account) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <LayerCard className="p-8 text-center">
          <PaperPlaneTiltIcon className="mx-auto text-kumo-info" size={40} weight="fill" />
          <h1 className="mt-4 text-xl font-semibold">Avval Telegram’ni ulang</h1>
          <p className="mt-2 text-sm text-kumo-subtle">Xabar yuborish uchun shaxsiy Telegram hisobingiz kerak.</p>
          <LinkButton className="mt-5" href="/telegram/connect" variant="primary">Telegram’ni ulash</LinkButton>
        </LayerCard>
      </main>
    );
  }
  const chats = await telegramRepository.listChats(user.id);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <MessageComposer chats={chats} />
    </main>
  );
}
