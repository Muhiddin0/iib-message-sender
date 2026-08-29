"use client";

import { Badge, Button, Checkbox, Input, LayerCard, Textarea } from "@cloudflare/kumo";
import {
  ArrowLeftIcon,
  CheckIcon,
  ImageIcon,
  LinkSimpleIcon,
  PaperPlaneTiltIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import type { CampaignMode, MessageKind, TelegramChat } from "@/types/domain";

const kindLabel: Record<MessageKind, string> = { text: "Matn", photo: "Rasm", video: "Video" };

function canSend(chat: TelegramChat, kind: MessageKind) {
  return kind === "text" ? chat.canSendText : kind === "photo" ? chat.canSendPhoto : chat.canSendVideo;
}

function chatInitial(title: string) {
  return Array.from(title.trim())[0]?.toUpperCase() ?? "#";
}

export function MessageComposer({ chats }: { chats: TelegramChat[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<CampaignMode>("compose");
  const [kind, setKind] = useState<MessageKind>("text");
  const [body, setBody] = useState("");
  const [sourceMessageLink, setSourceMessageLink] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [media, setMedia] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const preview = useMemo(() => media ? URL.createObjectURL(media) : null, [media]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const matching = useMemo(
    () =>
      chats.filter((chat) => {
        return `${chat.title} ${chat.username ?? ""}`.toLowerCase().includes(search.toLowerCase());
      }),
    [chats, search],
  );
  const effectiveKind = mode === "forward" ? "text" : kind;
  const sendable = useMemo(
    () => matching.filter((chat) => canSend(chat, effectiveKind)),
    [effectiveKind, matching],
  );

  function changeMode(next: CampaignMode) {
    setMode(next);
    setMedia(null);
    const nextKind = next === "forward" ? "text" : kind;
    setSelected((current) => current.filter((id) => {
      const chat = chats.find((item) => item.id === id);
      return chat && canSend(chat, nextKind);
    }));
    setError("");
  }

  function changeKind(next: MessageKind) {
    setKind(next);
    setMedia(null);
    setSelected((current) => current.filter((id) => {
      const chat = chats.find((item) => item.id === id);
      return chat && canSend(chat, next);
    }));
  }

  function toggle(id: string, checked: boolean) {
    setSelected((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected.length) return setError("Kamida bitta chatni tanlang.");
    if (mode === "forward" && !sourceMessageLink.trim()) return setError("Telegram xabar linkini kiriting.");
    if (mode === "compose" && kind === "text" && !body.trim()) return setError("Xabar matnini kiriting.");
    if (mode === "compose" && kind !== "text" && !media) return setError("Media faylni tanlang.");
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("mode", mode);
      form.set("kind", kind);
      form.set("body", body);
      form.set("sourceMessageLink", sourceMessageLink);
      form.set("chatIds", JSON.stringify(selected));
      form.set("idempotencyKey", crypto.randomUUID());
      if (mode === "compose" && media) form.set("media", media);
      const response = await fetch("/api/campaigns", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Kampaniya yaratilmadi.");
      router.push(`/campaign/${result.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kampaniya yaratilmadi.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="mb-6 flex items-center gap-3">
        <Button type="button" shape="square" variant="ghost" icon={ArrowLeftIcon} aria-label="Orqaga" onClick={() => router.back()} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Xabar yuborish</h1>
          <p className="mt-1 text-sm text-kumo-subtle">Yangi xabar yarating yoki mavjud Telegram xabarini forward qiling.</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,.8fr)]">
        <div className="space-y-5">
          <LayerCard className="p-4 sm:p-5">
            <h2 className="text-sm font-semibold">Xabar</h2>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Yuborish usuli">
              <Button
                type="button"
                size="sm"
                variant={mode === "compose" ? "primary" : "secondary"}
                icon={PaperPlaneTiltIcon}
                onClick={() => changeMode("compose")}
              >
                Yangi xabar
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "forward" ? "primary" : "secondary"}
                icon={LinkSimpleIcon}
                onClick={() => changeMode("forward")}
              >
                Mavjud xabarni forward qilish
              </Button>
            </div>

            {mode === "compose" ? <>
              <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Xabar turi">
                {(["text", "photo", "video"] as const).map((item) => (
                  <Button
                    key={item}
                    type="button"
                    size="sm"
                    variant={kind === item ? "primary" : "secondary"}
                    icon={item === "photo" ? ImageIcon : item === "video" ? VideoCameraIcon : PaperPlaneTiltIcon}
                    onClick={() => changeKind(item)}
                  >
                    {kindLabel[item]}
                  </Button>
                ))}
              </div>

              <Textarea
                className="mt-4"
                label={kind === "text" ? "Xabar matni" : "Izoh"}
                description={`${body.length} / ${kind === "text" ? 4096 : 1024} belgi`}
                placeholder={kind === "text" ? "Xabaringizni yozing…" : "Media uchun izoh (ixtiyoriy)…"}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={kind === "text" ? 4096 : 1024}
                minRows={5}
                maxRows={10}
                autoResize
              />

              {kind !== "text" ? (
                <div className="mt-4">
                  <label className="block text-sm font-medium" htmlFor="media">{kind === "photo" ? "Rasm" : "Video"}</label>
                  <input
                    id="media"
                    className="mt-2 block w-full rounded-lg border border-kumo-line bg-kumo-base px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-kumo-fill file:px-3 file:py-1 file:text-sm"
                    type="file"
                    accept={kind === "photo" ? "image/jpeg,image/png,image/webp" : "video/mp4,video/webm,video/quicktime"}
                    onChange={(event) => setMedia(event.target.files?.[0] ?? null)}
                    required
                  />
                  <p className="mt-1.5 text-xs text-kumo-subtle">{kind === "photo" ? "JPEG, PNG, WebP · 10 MB gacha" : "MP4, WebM, MOV · 50 MB gacha"}</p>
                </div>
              ) : null}
            </> : (
              <div className="mt-4">
                <Input
                  label="Telegram xabar linki"
                  description="Public yoki siz kira oladigan private kanal/guruh xabari linkini kiriting."
                  placeholder="https://t.me/kanal/123"
                  type="url"
                  value={sourceMessageLink}
                  onChange={(event) => setSourceMessageLink(event.target.value)}
                  required
                />
                <p className="mt-3 rounded-lg bg-kumo-info-tint p-3 text-xs leading-5 text-kumo-info">
                  Xabar original muallif va kontent bilan forward qilinadi. Telegram content protection yoqilgan xabarlarni forward qilishga ruxsat bermaydi.
                </p>
              </div>
            )}
          </LayerCard>

          <LayerCard className="overflow-hidden">
            <div className="border-b border-kumo-hairline p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Chatlar</h2>
                  <p className="mt-0.5 text-xs text-kumo-subtle">
                    Tanlangan: {selected.length} · Yuborish mumkin: {sendable.length}/{matching.length}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSelected([...new Set([...selected, ...sendable.map((chat) => chat.id)])])}>Ko‘rinadiganlarni tanlash</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSelected([])}>Tozalash</Button>
                </div>
              </div>
              <Input
                className="mt-3"
                aria-label="Chatlarni qidirish"
                placeholder="Chatlarni qidirish…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="max-h-[410px] divide-y divide-kumo-hairline overflow-y-auto">
              {matching.length ? matching.map((chat) => {
                const allowed = canSend(chat, effectiveKind);
                return (
                  <div key={chat.id} className={`flex items-center gap-3 p-3.5 ${allowed ? "hover:bg-kumo-tint" : "opacity-60"}`}>
                    <Checkbox
                      checked={selected.includes(chat.id)}
                      disabled={!allowed}
                      onCheckedChange={(checked) => allowed && toggle(chat.id, checked)}
                      aria-label={`${chat.title} chatini tanlash`}
                    />
                    <button type="button" disabled={!allowed} className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => toggle(chat.id, !selected.includes(chat.id))}>
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-kumo-info-tint text-sm font-semibold text-kumo-info">
                        {chatInitial(chat.title)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{chat.title}</span>
                        <span className="block truncate text-xs text-kumo-subtle">{chat.username ? `@${chat.username} · ` : ""}{chat.participantCount ? `${chat.participantCount} a’zo` : "A’zolar soni noma’lum"}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <Badge variant="secondary">{chat.type === "channel" ? "Kanal" : chat.type === "supergroup" ? "Superguruh" : "Guruh"}</Badge>
                        {!allowed ? <span className="text-[11px] text-kumo-danger">Yuborish ruxsati yo‘q</span> : null}
                      </span>
                    </button>
                  </div>
                );
              }) : (
                <div className="p-8 text-center text-sm text-kumo-subtle">
                  {chats.length ? "Qidiruvga mos chat topilmadi." : "Chatlar hali sinxronlanmagan. Dashboard orqali chatlarni yangilang."}
                </div>
              )}
            </div>
          </LayerCard>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <LayerCard className="overflow-hidden">
            <div className="border-b border-kumo-hairline px-4 py-3">
              <p className="text-sm font-semibold">Preview</p>
            </div>
            <div className="min-h-60 bg-kumo-recessed p-4 sm:p-6">
              <div className="ml-auto max-w-[92%] rounded-2xl rounded-br-md bg-kumo-info-tint p-3 shadow-sm">
                {mode === "compose" && preview && kind === "photo" ? (
                  // A local blob URL cannot be optimized by next/image.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Tanlangan rasm preview’i" className="mb-2 max-h-72 w-full rounded-xl object-cover" />
                ) : null}
                {mode === "compose" && preview && kind === "video" ? <video src={preview} controls className="mb-2 max-h-72 w-full rounded-xl" /> : null}
                {mode === "forward" ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-kumo-info">Forward</p>
                    <p className="mt-2 break-all text-sm leading-5">{sourceMessageLink || "Telegram xabar linki preview’i"}</p>
                  </div>
                ) : body ? <p className="whitespace-pre-wrap break-words text-sm leading-5">{body}</p> : <p className="text-sm text-kumo-subtle">Xabar preview’i shu yerda ko‘rinadi.</p>}
              </div>
            </div>
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-kumo-subtle">Qabul qiluvchilar</span>
                <span className="font-semibold tabular-nums">{selected.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-kumo-subtle">Turi</span>
                <span>{mode === "forward" ? "Forward" : kindLabel[kind]}</span>
              </div>
              {error ? <p className="rounded-lg bg-kumo-danger-tint p-2.5 text-sm text-kumo-danger" role="alert">{error}</p> : null}
              <Button className="w-full" type="submit" variant="primary" icon={CheckIcon} loading={busy} disabled={busy || !selected.length}>
                {selected.length} ta chatga {mode === "forward" ? "forward qilish" : "yuborish"}
              </Button>
              <p className="text-center text-xs leading-5 text-kumo-subtle">Yuborish fon worker’ida, Telegram limitlariga rioya qilib bajariladi.</p>
            </div>
          </LayerCard>
        </aside>
      </div>
    </form>
  );
}
