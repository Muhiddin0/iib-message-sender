import { Badge, LayerCard, LinkButton } from "@cloudflare/kumo";
import {
  ArrowRightIcon,
  ChatCircleDotsIcon,
  CheckCircleIcon,
  ClockIcon,
  LinkSimpleIcon,
  PaperPlaneTiltIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/ssr";

import { StatusBadge } from "@/components/shared/status-badge";
import { AccountActions } from "@/components/telegram/account-actions";
import { DashboardLiveRefresh } from "@/components/dashboard/live-refresh";
import { requirePageUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { campaignRepository } from "@/lib/repositories/campaign-repository";
import { telegramRepository } from "@/lib/repositories/telegram-repository";

export default async function DashboardPage() {
  const user = await requirePageUser();
  const account = await telegramRepository.getAccount(user.id);
  const data = await campaignRepository.getDashboard(user.id, account);
  const stats = [
    { label: "Kampaniyalar", value: data.totals.campaigns, Icon: ChatCircleDotsIcon, color: "text-kumo-info" },
    { label: "Yuborildi", value: data.totals.sent, Icon: CheckCircleIcon, color: "text-kumo-success" },
    { label: "Kutilmoqda", value: data.totals.pending, Icon: ClockIcon, color: "text-kumo-warning" },
    { label: "Xatolar", value: data.totals.failed, Icon: WarningCircleIcon, color: "text-kumo-danger" },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <DashboardLiveRefresh />
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-kumo-subtle">Xush kelibsiz, {user.name.split(" ")[0]}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Kampaniyalar</h1>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {account ? (
            <div className="flex items-center gap-2 text-sm text-kumo-subtle">
              <span className="size-2 rounded-full bg-kumo-success" aria-hidden />
              {account.firstName}{account.username ? ` · @${account.username}` : ""}
            </div>
          ) : null}
        </div>
      </section>

      {!account ? (
        <LayerCard className="mt-7 overflow-hidden">
          <div className="grid items-center gap-6 p-6 sm:grid-cols-[1fr_auto] sm:p-8">
            <div className="flex gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-kumo-info-tint text-kumo-info">
                <PaperPlaneTiltIcon size={25} weight="fill" aria-hidden />
              </span>
              <div>
                <h2 className="text-lg font-semibold">Telegram’ni ulashdan boshlang</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-kumo-subtle">
                  Guruh va kanallaringizni sinxronlab, bitta xabarni tanlangan chatlarga xavfsiz jo‘nating.
                </p>
              </div>
            </div>
            <LinkButton href="/telegram/connect" variant="primary">Telegram’ni ulash</LinkButton>
          </div>
        </LayerCard>
      ) : (
        <LayerCard className="mt-7 p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">{account.firstName} {account.lastName}</h2>
                <StatusBadge status={account.status} />
              </div>
              <p className="mt-1 text-xs text-kumo-subtle">
                Oxirgi sinxronlash: {formatDate(account.lastSyncAt)}
              </p>
            </div>
            <AccountActions />
          </div>
        </LayerCard>
      )}

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Umumiy ko‘rsatkichlar">
        {stats.map(({ label, value, Icon, color }) => (
          <LayerCard key={label} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-kumo-subtle">{label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
              </div>
              <Icon className={color} size={20} aria-hidden />
            </div>
          </LayerCard>
        ))}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,.8fr)]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">So‘nggi kampaniyalar</h2>
            {account ? <LinkButton href="/message/new" variant="ghost" size="sm">Yangi xabar</LinkButton> : null}
          </div>
          <LayerCard className="overflow-hidden">
            {data.campaigns.length ? (
              <div className="divide-y divide-kumo-hairline">
                {data.campaigns.map((campaign) => (
                  <a
                    key={campaign.id}
                    href={`/campaign/${campaign.id}`}
                    className="group grid grid-cols-[1fr_auto] gap-3 p-4 transition-colors hover:bg-kumo-tint sm:grid-cols-[minmax(0,1fr)_90px_100px_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {campaign.body || (campaign.mode === "forward" ? `${campaign.sourceChatTitle ?? "Telegram"} xabari` : campaign.kind === "photo" ? "Rasmli xabar" : "Videoli xabar")}
                      </p>
                      <p className="mt-1 text-xs text-kumo-subtle">
                        {campaign.mode === "forward" ? "Forward · " : ""}{formatDate(campaign.created)}
                      </p>
                    </div>
                    <span className="hidden text-xs text-kumo-subtle sm:block">{campaign.totalCount} chat</span>
                    <StatusBadge status={campaign.status} />
                    <ArrowRightIcon className="text-kumo-subtle transition-transform group-hover:translate-x-0.5" size={16} aria-hidden />
                  </a>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <p className="text-sm font-medium">Hali kampaniya yo‘q</p>
                <p className="mt-1 text-sm text-kumo-subtle">Telegram ulangach birinchi xabaringizni yarating.</p>
              </div>
            )}
          </LayerCard>
        </section>

        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-base font-semibold">Yuborilgan xabar linklari</h2>
            <LayerCard className="overflow-hidden">
              {data.recentMessageLinks.length ? (
                <div className="divide-y divide-kumo-hairline">
                  {data.recentMessageLinks.map((item) => (
                    <a
                      key={item.id}
                      className="flex items-center gap-3 p-3.5 transition-colors hover:bg-kumo-tint"
                      href={item.telegramMessageLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-kumo-info-tint text-kumo-info">
                        <LinkSimpleIcon size={15} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.chatTitle}</span>
                        <span className="block text-xs text-kumo-subtle">{formatDate(item.sentAt)}</span>
                      </span>
                      <ArrowRightIcon size={14} className="text-kumo-subtle" aria-hidden />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="p-5 text-center text-sm text-kumo-subtle">Hali Telegram xabar linki olinmagan.</p>
              )}
            </LayerCard>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold">Faollik</h2>
            <LayerCard className="p-4">
              {data.activities.length ? (
                <ol className="space-y-4">
                  {data.activities.slice(0, 10).map((activity) => (
                    <li key={activity.id} className="flex gap-3">
                      <span
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${
                          activity.tone === "success" ? "bg-kumo-success" : activity.tone === "danger" ? "bg-kumo-danger" : activity.tone === "warning" ? "bg-kumo-warning" : "bg-kumo-info"
                        }`}
                        aria-hidden
                      />
                      <div>
                        <p className="text-sm leading-5">{activity.message}</p>
                        <p className="mt-0.5 text-xs text-kumo-subtle">{formatDate(activity.created)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="py-5 text-center">
                  <Badge variant="secondary">Faollik yo‘q</Badge>
                  <p className="mt-2 text-sm text-kumo-subtle">Jarayonlar shu yerda ko‘rinadi.</p>
                </div>
              )}
            </LayerCard>
          </section>
        </div>
      </div>
    </main>
  );
}
