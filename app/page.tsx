import { Badge, LayerCard, LinkButton } from "@cloudflare/kumo";
import { ArrowRightIcon, CheckCircleIcon, PaperPlaneTiltIcon, ShieldCheckIcon } from "@phosphor-icons/react/ssr";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) redirect("/dashboard");

  return (
    <main className="relative flex min-h-screen overflow-hidden px-5 py-6 sm:px-8 lg:px-12">
      <div aria-hidden className="app-grid pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col">
        <header className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-kumo-brand text-white shadow-sm">
              <PaperPlaneTiltIcon aria-hidden size={19} weight="fill" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Osing</span>
          </div>
          <LinkButton href="/auth/sign-in" variant="secondary" size="sm">Kirish</LinkButton>
        </header>

        <section className="grid flex-1 items-center gap-14 py-20 lg:grid-cols-[1.05fr_.95fr] lg:py-28">
          <div className="max-w-2xl">
            <Badge variant="primary" appearance="filled" icon={<CheckCircleIcon size={14} weight="fill" />}>
              Telegram MTProto bilan ishlaydi
            </Badge>
            <h1 className="mt-6 max-w-xl text-5xl font-semibold leading-[1.06] tracking-[-0.045em] sm:text-6xl">
              Bitta xabar. Barcha muhim chatlaringiz.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-kumo-subtle">
              Shaxsiy Telegram akkauntingizni ulang, guruh va kanallarni tanlang, yuborish jarayonini real vaqtda kuzating.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/auth/sign-in" variant="primary" size="lg" icon={<ArrowRightIcon size={18} />}>
                Boshlash
              </LinkButton>
            </div>
            <div className="mt-8 flex items-center gap-2 text-sm text-kumo-subtle">
              <ShieldCheckIcon aria-hidden size={18} />
              Telegram sessiyasi AES-256-GCM bilan shifrlanadi.
            </div>
          </div>

          <LayerCard className="overflow-hidden rounded-3xl p-0 shadow-xl shadow-black/5">
            <div className="border-b border-kumo-hairline bg-kumo-elevated px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Bahorgi yangiliklar</p>
                  <p className="mt-0.5 text-sm text-kumo-subtle">24 ta chat</p>
                </div>
                <Badge variant="primary">Yuborilmoqda</Badge>
              </div>
            </div>
            <div className="space-y-2 bg-kumo-base p-4">
              {[
                ["Dizayn jamoasi", "Yuborildi", "success"],
                ["Marketing kanali", "Yuborildi", "success"],
                ["Mahsulot guruhi", "Yuborilmoqda", "info"],
                ["Hamkorlar", "Navbatda", "muted"],
              ].map(([name, status, tone]) => (
                <div key={name} className="flex items-center gap-3 rounded-xl border border-kumo-hairline px-3 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-kumo-recessed text-sm font-semibold">
                    {name.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="text-xs text-kumo-subtle">Xabar qabul qilindi</p>
                  </div>
                  <span className={tone === "success" ? "text-xs text-kumo-success" : tone === "info" ? "text-xs text-kumo-info" : "text-xs text-kumo-subtle"}>
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </LayerCard>
        </section>
      </div>
    </main>
  );
}
