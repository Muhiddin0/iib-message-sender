"use client";

import { Button, Input, LayerCard, SensitiveInput } from "@cloudflare/kumo";
import {
  ArrowLeftIcon,
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  PhoneIcon,
  QrCodeIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { FormEvent, useEffect, useState } from "react";

import {
  isValidTelegramPhone,
  normalizeTelegramPhone,
  TELEGRAM_PHONE_ERROR_MESSAGE,
} from "@/lib/telegram/phone";
import type { TelegramAuthMethod, TelegramAuthState } from "@/types/domain";

type QrEvent =
  | { state: "qr_pending"; url: string; expiresAt: string }
  | { state: "qr_scanned" }
  | { state: "password_required" }
  | { state: "connected" }
  | {
      state: "error";
      error: { code?: string; message?: string; retryAfterSeconds?: number };
    };

class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

function apiError(body: { error?: { message?: string; code?: string; retryAfterSeconds?: number } }) {
  return new ApiError(
    body.error?.message ?? "Amal bajarilmadi.",
    body.error?.code,
    body.error?.retryAfterSeconds,
  );
}

async function post(path: string, data: Record<string, string>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await response.json();
  if (!response.ok) throw apiError(body);
  return body as { state: TelegramAuthState; resendAfterSeconds?: number };
}

async function readQrEvents(response: Response, onEvent: (event: QrEvent) => Promise<void> | void) {
  if (!response.body) throw new Error("QR login oqimini ochib bo‘lmadi.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) await onEvent(JSON.parse(line) as QrEvent);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) await onEvent(JSON.parse(buffer) as QrEvent);
}

export function ConnectFlow({
  initialState,
  initialMethod = "phone",
}: {
  initialState: TelegramAuthState;
  initialMethod?: TelegramAuthMethod;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [method, setMethod] = useState(initialMethod);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"submit" | "edit" | "resend" | null>(null);
  const [error, setError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [notice, setNotice] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [qrImage, setQrImage] = useState("");
  const [qrStage, setQrStage] = useState<"loading" | "pending" | "scanned" | "error">("loading");
  const [qrAttempt, setQrAttempt] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((seconds) => Math.max(0, seconds - 1)), 1_000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  useEffect(() => {
    if (method !== "qr" || state !== "idle") return;
    const abortController = new AbortController();
    let active = true;

    async function connectWithQr() {
      setQrStage("loading");
      setQrImage("");
      setError("");
      setNotice("");
      try {
        const response = await fetch("/api/telegram/qr-login", {
          method: "POST",
          signal: abortController.signal,
        });
        if (!response.ok) throw apiError(await response.json());
        await readQrEvents(response, async (event) => {
          if (!active) return;
          if (event.state === "qr_pending") {
            const image = await QRCode.toDataURL(event.url, {
              width: 232,
              margin: 2,
              errorCorrectionLevel: "M",
            });
            if (active) {
              setQrImage(image);
              setQrStage("pending");
            }
          } else if (event.state === "qr_scanned") {
            setQrStage("scanned");
          } else if (event.state === "password_required") {
            setState("password_required");
            setNotice("QR kod tasdiqlandi. Ikki bosqichli himoya parolini kiriting.");
          } else if (event.state === "connected") {
            setState("connected");
            router.push("/dashboard");
            router.refresh();
          } else {
            throw apiError({ error: event.error });
          }
        });
      } catch (caught) {
        if (!active || abortController.signal.aborted) return;
        setQrStage("error");
        setError(caught instanceof Error ? caught.message : "QR login amalga oshmadi.");
      }
    }

    void connectWithQr();
    return () => {
      active = false;
      abortController.abort();
    };
  }, [method, qrAttempt, router, state]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalizedPhone = normalizeTelegramPhone(phone);
    if (state === "idle" && method === "phone" && !isValidTelegramPhone(normalizedPhone)) {
      setPhoneError(TELEGRAM_PHONE_ERROR_MESSAGE);
      setError("");
      return;
    }

    setBusy("submit");
    setError("");
    setNotice("");
    setPhoneError("");
    try {
      const result =
        state === "idle"
          ? await post("/api/telegram/send-code", { phone: normalizedPhone })
          : state === "code_required"
            ? await post("/api/telegram/verify-code", { code })
            : await post("/api/telegram/verify-password", { password });
      setState(result.state);
      setResendIn(result.resendAfterSeconds ?? 0);
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

  async function resendCode() {
    setBusy("resend");
    setError("");
    setNotice("");
    try {
      const result = await post("/api/telegram/resend-code", {});
      setCode("");
      setResendIn(result.resendAfterSeconds ?? 0);
      setNotice("Yangi tasdiqlash kodi yuborildi.");
    } catch (caught) {
      if (caught instanceof ApiError && caught.retryAfterSeconds) {
        setResendIn(caught.retryAfterSeconds);
      }
      setError(caught instanceof Error ? caught.message : "Amal bajarilmadi.");
    } finally {
      setBusy(null);
    }
  }

  async function resetAuthorization(nextMethod: TelegramAuthMethod) {
    setBusy("edit");
    setError("");
    setNotice("");
    try {
      await post("/api/telegram/cancel-authorization", {});
      setCode("");
      setPassword("");
      setPhoneError("");
      setResendIn(0);
      setMethod(nextMethod);
      setState("idle");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Amal bajarilmadi.");
    } finally {
      setBusy(null);
    }
  }

  function selectMethod(nextMethod: TelegramAuthMethod) {
    setMethod(nextMethod);
    setError("");
    setNotice("");
    setQrImage("");
    setQrStage("loading");
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
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-kumo-recessed p-1" role="group" aria-label="Telegram ulash usuli">
            <Button
              type="button"
              size="sm"
              variant={method === "phone" ? "primary" : "ghost"}
              icon={PhoneIcon}
              aria-pressed={method === "phone"}
              onClick={() => selectMethod("phone")}
            >
              Telefon orqali
            </Button>
            <Button
              type="button"
              size="sm"
              variant={method === "qr" ? "primary" : "ghost"}
              icon={QrCodeIcon}
              aria-pressed={method === "qr"}
              onClick={() => selectMethod("qr")}
            >
              QR kod orqali
            </Button>
          </div>
        ) : null}

        {state === "idle" && method === "phone" ? (
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

        {state === "idle" && method === "qr" ? (
          <div className="rounded-xl border border-kumo-hairline p-5 text-center">
            <div className="mx-auto flex size-64 items-center justify-center rounded-2xl bg-white p-3 shadow-sm">
              {qrImage ? (
                <Image
                  src={qrImage}
                  width={232}
                  height={232}
                  alt="Telegram orqali kirish QR kodi"
                  unoptimized
                />
              ) : (
                <span className="size-8 animate-spin rounded-full border-2 border-neutral-200 border-t-kumo-brand" aria-label="QR kod tayyorlanmoqda" />
              )}
            </div>
            <p className="mt-4 text-sm font-medium">
              {qrStage === "scanned" ? "QR kod skanerlandi, tasdiqlanmoqda…" : "QR kodni Telegram ilovasi orqali skanerlang"}
            </p>
            <p className="mt-1 text-xs leading-5 text-kumo-subtle">
              Telegram → Sozlamalar → Qurilmalar → Desktop qurilmani ulash. QR kod muddati tugasa avtomatik yangilanadi.
            </p>
            {qrStage === "error" ? (
              <Button
                type="button"
                className="mt-3"
                size="sm"
                variant="secondary"
                icon={ArrowsClockwiseIcon}
                onClick={() => setQrAttempt((attempt) => attempt + 1)}
              >
                QR kodni yangilash
              </Button>
            ) : null}
          </div>
        ) : null}

        {method === "phone" && state !== "idle" ? (
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
              onClick={() => resetAuthorization("phone")}
            >
              Raqamni o‘zgartirish
            </Button>
          </div>
        ) : null}

        {method === "qr" && state === "password_required" ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-kumo-hairline bg-kumo-success-tint px-3 py-2.5">
            <p className="text-sm text-kumo-success">QR kod Telegram’da tasdiqlandi.</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              loading={busy === "edit"}
              disabled={busy !== null}
              onClick={() => resetAuthorization("phone")}
            >
              Boshqa usul
            </Button>
          </div>
        ) : null}

        {state === "code_required" ? (
          <div className="space-y-2">
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
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={ArrowsClockwiseIcon}
                loading={busy === "resend"}
                disabled={busy !== null || resendIn > 0}
                onClick={resendCode}
              >
                {resendIn > 0 ? `Qayta yuborish (${resendIn}s)` : "Kodni qayta yuborish"}
              </Button>
            </div>
          </div>
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
        {notice ? (
          <p className="rounded-lg bg-kumo-success-tint px-3 py-2 text-sm text-kumo-success" role="status">{notice}</p>
        ) : null}

        <div className="flex items-center justify-between gap-3 pt-1">
          <Button type="button" variant="ghost" icon={ArrowLeftIcon} onClick={() => router.push("/dashboard")}>Orqaga</Button>
          {method === "phone" || state === "password_required" ? (
            <Button type="submit" variant="primary" loading={busy === "submit"} disabled={busy !== null}>
              {state === "idle" ? "Kod yuborish" : state === "code_required" ? "Kodni tasdiqlash" : "Hisobni ulash"}
            </Button>
          ) : null}
        </div>
      </form>
    </LayerCard>
  );
}
