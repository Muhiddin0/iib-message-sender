// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const qrMocks = vi.hoisted(() => ({ toDataURL: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("qrcode", () => ({ default: { toDataURL: qrMocks.toDataURL } }));

import { ConnectFlow } from "@/components/telegram/connect-flow";
import { TELEGRAM_PHONE_ERROR_MESSAGE } from "@/lib/telegram/phone";

describe("Telegram phone authorization flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    qrMocks.toDataURL.mockResolvedValue("data:image/png;base64,cXI=");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (path: string) => ({
      ok: true,
      json: async () => ({
        state: path === "/api/telegram/cancel-authorization" ? "idle" : "code_required",
        resendAfterSeconds: 0,
      }),
    })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("lets the user edit a phone number after requesting the verification code", async () => {
    render(<ConnectFlow initialState="idle" />);

    fireEvent.change(screen.getByLabelText("Telefon raqami"), {
      target: { value: "+998 90 123 45 67" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kod yuborish" }));

    await screen.findByText("+998901234567");
    expect(fetch).toHaveBeenCalledWith("/api/telegram/send-code", expect.objectContaining({
      body: JSON.stringify({ phone: "+998901234567" }),
    }));

    fireEvent.click(screen.getByRole("button", { name: "Raqamni o‘zgartirish" }));

    await waitFor(() => expect(screen.getByLabelText("Telefon raqami")).toHaveValue("+998901234567"));
    expect(fetch).toHaveBeenCalledWith("/api/telegram/cancel-authorization", expect.objectContaining({
      method: "POST",
    }));

    fireEvent.change(screen.getByLabelText("Telefon raqami"), {
      target: { value: "+998 91 765 43 21" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kod yuborish" }));

    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith("/api/telegram/send-code", expect.objectContaining({
      body: JSON.stringify({ phone: "+998917654321" }),
    })));
  });

  it("shows a frontend error and does not send an invalid phone number", () => {
    render(<ConnectFlow initialState="idle" />);

    fireEvent.change(screen.getByLabelText("Telefon raqami"), {
      target: { value: "998-90-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kod yuborish" }));

    expect(screen.getByText(TELEGRAM_PHONE_ERROR_MESSAGE)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("offers QR login and renders the streamed Telegram QR URL", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(
      `${JSON.stringify({
        state: "qr_pending",
        url: "tg://login?token=secret-token",
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
      })}\n`,
      { headers: { "Content-Type": "application/x-ndjson" } },
    ));
    render(<ConnectFlow initialState="idle" />);

    fireEvent.click(screen.getByRole("button", { name: "QR kod orqali" }));

    expect(await screen.findByAltText("Telegram orqali kirish QR kodi")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/telegram/qr-login", expect.objectContaining({
      method: "POST",
      signal: expect.any(AbortSignal),
    }));
    expect(qrMocks.toDataURL).toHaveBeenCalledWith(
      "tg://login?token=secret-token",
      expect.objectContaining({ width: 232 }),
    );
  });

  it("asks for 2FA after the QR code is approved", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(
      `${JSON.stringify({ state: "qr_scanned" })}\n${JSON.stringify({ state: "password_required" })}\n`,
      { headers: { "Content-Type": "application/x-ndjson" } },
    ));
    render(<ConnectFlow initialState="idle" />);

    fireEvent.click(screen.getByRole("button", { name: "QR kod orqali" }));

    expect(await screen.findByLabelText("Ikki bosqichli himoya paroli")).toBeInTheDocument();
    expect(screen.getByText("QR kod Telegram’da tasdiqlandi.")).toBeInTheDocument();
    expect(screen.queryByText("Tasdiqlanayotgan telefon raqami")).not.toBeInTheDocument();
  });

  it("resends the verification code and clears the old code", async () => {
    render(<ConnectFlow initialState="code_required" />);
    fireEvent.change(screen.getByLabelText("Tasdiqlash kodi"), { target: { value: "12345" } });

    fireEvent.click(screen.getByRole("button", { name: "Kodni qayta yuborish" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/telegram/resend-code",
      expect.objectContaining({ method: "POST" }),
    ));
    expect(screen.getByLabelText("Tasdiqlash kodi")).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("Yangi tasdiqlash kodi yuborildi.");
  });

  it("shows a backend validation error next to the phone input", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: { code: "VALIDATION_ERROR", message: "Telegram bu telefon raqamini qabul qilmadi." },
      }),
    } as Response);
    render(<ConnectFlow initialState="idle" />);

    fireEvent.change(screen.getByLabelText("Telefon raqami"), {
      target: { value: "+998901234567" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kod yuborish" }));

    expect(await screen.findByText("Telegram bu telefon raqamini qabul qilmadi.")).toBeInTheDocument();
  });

  it("can restart an authorization restored after a page refresh", async () => {
    render(<ConnectFlow initialState="code_required" />);

    fireEvent.click(screen.getByRole("button", { name: "Raqamni o‘zgartirish" }));

    expect(await screen.findByLabelText("Telefon raqami")).toHaveValue("");
  });
});
