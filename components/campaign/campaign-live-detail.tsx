"use client";

import { Badge, Button, LayerCard, LinkButton, Meter } from "@cloudflare/kumo";
import { ArrowLeftIcon, ArrowSquareOutIcon, ArrowsClockwiseIcon, ChatCircleDotsIcon, CheckCircleIcon, FileXlsIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/format";
import type { CampaignSummary, Delivery } from "@/types/domain";

interface Detail {
  campaign: CampaignSummary;
  deliveries: Delivery[];
}

function metric(value: number | null) {
  return value === null ? <span className="text-kumo-subtle">Mavjud emas</span> : value.toLocaleString("uz-UZ");
}

export function CampaignLiveDetail({ initial }: { initial: Detail }) {
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  const [connected, setConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const events = new EventSource(`/api/campaigns/${initial.campaign.id}/events`);
    const snapshot = (event: MessageEvent) => {
      setDetail(JSON.parse(event.data) as Detail);
      setConnected(true);
    };
    events.addEventListener("snapshot", snapshot as EventListener);
    events.onerror = () => setConnected(false);
    return () => events.close();
  }, [initial.campaign.id]);

  async function refreshAnalytics() {
    setRefreshing(true);
    setNotice("");
    try {
      const response = await fetch(`/api/campaigns/${detail.campaign.id}/analytics`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Analitika yangilanmadi.");
      setNotice("Analitikani yangilash navbatga qo‘yildi.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Analitika yangilanmadi.");
    } finally {
      setRefreshing(false);
    }
  }

  const campaign = detail.campaign;
  const done = campaign.sentCount + campaign.failedCount;
  const totals = detail.deliveries.reduce(
    (sum, delivery) => ({
      views: sum.views + (delivery.views ?? 0),
      reactions: sum.reactions + (delivery.reactions ?? 0),
      replies: sum.replies + (delivery.replies ?? 0),
      viewsSupported: sum.viewsSupported || delivery.views !== null,
      reactionsSupported: sum.reactionsSupported || delivery.reactions !== null,
      repliesSupported: sum.repliesSupported || delivery.replies !== null,
    }),
    { views: 0, reactions: 0, replies: 0, viewsSupported: false, reactionsSupported: false, repliesSupported: false },
  );

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button shape="square" variant="ghost" icon={ArrowLeftIcon} aria-label="Dashboardga qaytish" onClick={() => router.push("/dashboard")} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{campaign.mode === "forward" ? "Forward kampaniyasi" : "Kampaniya"}</h1>
              <StatusBadge status={campaign.status} />
            </div>
            <p className="mt-1 text-sm text-kumo-subtle">{formatDate(campaign.created)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Badge variant={connected ? "success" : "secondary"}>{connected ? "Jonli yangilanish" : "Qayta ulanmoqda"}</Badge>
          <LinkButton
            href={`/api/campaigns/${campaign.id}/export`}
            download
            size="sm"
            variant="secondary"
            icon={FileXlsIcon}
          >
            Excel eksport
          </LinkButton>
          <Button size="sm" icon={ArrowsClockwiseIcon} loading={refreshing} onClick={refreshAnalytics}>Analitikani yangilash</Button>
        </div>
      </div>

      {notice ? <p className="mt-4 rounded-lg bg-kumo-fill px-3 py-2 text-sm" role="status">{notice}</p> : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Qabul qiluvchilar", value: campaign.totalCount, Icon: ChatCircleDotsIcon, color: "text-kumo-info" },
          { label: "Yuborildi", value: campaign.sentCount, Icon: CheckCircleIcon, color: "text-kumo-success" },
          { label: "Xatolar", value: campaign.failedCount, Icon: WarningCircleIcon, color: "text-kumo-danger" },
          { label: "Kutilmoqda", value: campaign.pendingCount, Icon: ArrowsClockwiseIcon, color: "text-kumo-warning" },
        ].map(({ label, value, Icon, color }) => (
          <LayerCard key={label} className="flex items-center justify-between p-4">
            <div><p className="text-xs text-kumo-subtle">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></div>
            <Icon className={color} size={20} aria-hidden />
          </LayerCard>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <LayerCard className="p-5">
          <Meter
            label="Yuborish jarayoni"
            value={done}
            max={Math.max(1, campaign.totalCount)}
            customValue={`${done} / ${campaign.totalCount}`}
          />
          <div className="mt-5 rounded-xl bg-kumo-recessed p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-kumo-subtle">
              {campaign.mode === "forward" ? "Forward qilingan xabar" : "Xabar"}
            </p>
            {campaign.sourceMessageLink ? (
              <a
                className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-kumo-info hover:underline"
                href={campaign.sourceMessageLink}
                target="_blank"
                rel="noreferrer"
              >
                {campaign.sourceChatTitle ?? "Manba xabar"}
                <ArrowSquareOutIcon size={14} aria-hidden />
              </a>
            ) : null}
            <p className="whitespace-pre-wrap text-sm leading-6">{campaign.body || (campaign.mode === "forward" ? "Forward qilingan media xabar" : campaign.kind === "photo" ? "Rasmli xabar" : "Videoli xabar")}</p>
          </div>
        </LayerCard>
        <LayerCard className="p-5">
          <h2 className="text-sm font-semibold">Telegram ko‘rsatkichlari</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-kumo-subtle">Ko‘rishlar</dt><dd className="font-medium tabular-nums">{metric(totals.viewsSupported ? totals.views : null)}</dd></div>
            <div className="flex justify-between"><dt className="text-kumo-subtle">Reaksiyalar</dt><dd className="font-medium tabular-nums">{metric(totals.reactionsSupported ? totals.reactions : null)}</dd></div>
            <div className="flex justify-between"><dt className="text-kumo-subtle">Izoh/javoblar</dt><dd className="font-medium tabular-nums">{metric(totals.repliesSupported ? totals.replies : null)}</dd></div>
          </dl>
          <p className="mt-4 text-xs leading-5 text-kumo-subtle">0 — hali faollik yo‘q. “Mavjud emas” — chatda bu funksiya o‘chirilgan yoki Telegram ushbu ko‘rsatkichni bermaydi.</p>
        </LayerCard>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-base font-semibold">Yetkazish tafsilotlari</h2>
        <LayerCard className="overflow-hidden">
          <div className="hidden grid-cols-[minmax(180px,1fr)_115px_repeat(3,80px)_110px] gap-3 border-b border-kumo-hairline bg-kumo-recessed px-4 py-2 text-xs font-medium text-kumo-subtle md:grid">
            <span>Chat</span><span>Holat</span><span>Ko‘rish</span><span>Reaksiya</span><span>Javob</span><span>Xabar linki</span>
          </div>
          <div className="divide-y divide-kumo-hairline">
            {detail.deliveries.map((delivery) => (
              <div key={delivery.id} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(180px,1fr)_115px_repeat(3,80px)_110px] md:items-center md:gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{delivery.chatTitle}</p>
                  <p className="mt-0.5 text-xs text-kumo-subtle">{delivery.sentAt ? formatDate(delivery.sentAt) : delivery.errorMessage ?? "Yuborish kutilmoqda"}</p>
                </div>
                <StatusBadge status={delivery.status} />
                <div className="grid grid-cols-3 gap-2 text-xs md:contents">
                  <span><span className="text-kumo-subtle md:hidden">Ko‘rish: </span>{metric(delivery.views)}</span>
                  <span><span className="text-kumo-subtle md:hidden">Reaksiya: </span>{metric(delivery.reactions)}</span>
                  <span><span className="text-kumo-subtle md:hidden">Javob: </span>{metric(delivery.replies)}</span>
                </div>
                {delivery.telegramMessageLink ? (
                  <a
                    className="inline-flex items-center gap-1 text-xs font-medium text-kumo-info hover:underline"
                    href={delivery.telegramMessageLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ochish <ArrowSquareOutIcon size={13} aria-hidden />
                  </a>
                ) : (
                  <span className="text-xs text-kumo-subtle">
                    {delivery.status === "sent" ? "Mavjud emas" : "—"}
                  </span>
                )}
              </div>
            ))}
          </div>
        </LayerCard>
      </section>
    </>
  );
}
