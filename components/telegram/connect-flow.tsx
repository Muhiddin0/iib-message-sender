"use client";

import { Button, Input, LayerCard, SensitiveInput } from "@cloudflare/kumo";
import { ArrowLeftIcon, CheckCircleIcon, PaperPlaneTiltIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import {
  isValidTelegramPhone,
  normalizeTelegramPhone,
  TELEGRAM_PHONE_ERROR_MESSAGE,
} from "@/lib/telegram/phone";

type State = "idle" | "code_required" | "password_required" | "connected";

class ApiError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

async function post(path: string, data: Record<string, string>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await response.json();
  if (!response.ok) throw new ApiError(body.error?.message ?? "Amal bajarilmadi.", body.error?.code);
  return body as { state: State };
}

export function ConnectFlow({ initialState }: { initialState: State }) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"submit" | "edit" | null>(null);
  const [error, setError] = useState("");
  const [phoneError, setPhoneError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalizedPhone = normalizeTelegramPhone(phone);
    if (state === "idle" && !isValidTelegramPhone(normalizedPhone)) {
      setPhoneError(TELEGRAM_PHONE_ERROR_MESSAGE);
      setError("");
      return;
    }

    setBusy("submit");
    setError("");
    setPhoneError("");
    try {
      const result =
        state === "idle"
          ? await post("/api/telegram/send-code", { phone: normalizedPhone })
          : state === "code_required"
            ? await post("/api/telegram/verify-code", { code })
            : await post("/api/telegram/verify-password", { password });
      setState(result.state);
      if (result.state === "connected") {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Amal bajarilmadi.";
      if (state === "idle" && caught instanceof ApiError && caught.code === "VALIDATION_ERROR") {
        setPhoneError(message);
      } else {
        setError(message);
      }
    } finally {
      setBusy(null);
    }
  }

  async function editPhone() {
    setBusy("edit");
    setError("");
    try {
      await post("/api/telegram/cancel-authorization", {});
      setCode("");
      setPassword("");
      setPhoneError("");
      setState("idle");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Amal bajarilmadi.");
    } finally {
      setBusy(null);
    }
  }

  if (state === "connected") {
    return (
      <LayerCard className="p-8 text-center">
        <CheckCircleIcon className="mx-auto text-kumo-success" size={44} weight="fill" />
        <h1 className="mt-4 text-xl font-semibold">Telegram ulandi</h1>
        <p className="mt-2 text-sm text-kumo-subtle">Chatlar xavfsiz fon jarayonida sinxronlanmoqda.</p>
      </LayerCard>
    );
  }

  return (
    <LayerCard className="p-5 sm:p-7">
      <div className="mb-6 flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-kumo-info-tint text-kumo-info">
          <PaperPlaneTiltIcon size={21} weight="fill" aria-hidden />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Telegram hisobini ulang</h1>
          <p className="mt-1 text-sm leading-6 text-kumo-subtle">
            Sessiya serverda AES-256-GCM bilan shifrlanadi va brauzerga yuborilmaydi.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {state === "idle" ? (
          <Input
            label="Telefon raqami"
            description="Telegram raqamingizni xalqaro formatda kiriting."
            placeholder="+998 90 123 45 67"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => {
              setPhone(normalizeTelegramPhone(event.target.value));
              if (phoneError) setPhoneError("");
            }}
            error={phoneError || undefined}
            maxLength={20}
            autoFocus
          />
        ) : null}
        {state !== "idle" ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-kumo-hairline bg-kumo-tint px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-xs text-kumo-subtle">Tasdiqlanayotgan telefon raqami</p>
              {phone ? <p className="mt-0.5 truncate text-sm font-medium tabular-nums">{phone}</p> : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={PencilSimpleIcon}
              loading={busy === "edit"}
              disabled={busy !== null}
              onClick={editPhone}
            >
              Raqamni o‘zgartirish
            </Button>
          </div>
        ) : null}
        {state === "code_required" ? (
          <Input
            label="Tasdiqlash kodi"
            description="Kod odatda Telegram ilovasidagi xizmat chatiga keladi."
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            required
            autoFocus
          />
        ) : null}
        {state === "password_required" ? (
          <SensitiveInput
            label="Ikki bosqichli himoya paroli"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoFocus
          />
        ) : null}
        {error ? (
          <p className="rounded-lg bg-kumo-danger-tint px-3 py-2 text-sm text-kumo-danger" role="alert">{error}</p>
        ) : null}
        <div className="flex items-center justify-between gap-3 pt-1">
          <Button type="button" variant="ghost" icon={ArrowLeftIcon} onClick={() => router.push("/dashboard")}>Orqaga</Button>
          <Button type="submit" variant="primary" loading={busy === "submit"} disabled={busy !== null}>
            {state === "idle" ? "Kod yuborish" : state === "code_required" ? "Kodni tasdiqlash" : "Hisobni ulash"}
          </Button>
        </div>
      </form>
    </LayerCard>
  );
}
