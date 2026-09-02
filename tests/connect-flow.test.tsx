// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

import { ConnectFlow } from "@/components/telegram/connect-flow";
import { TELEGRAM_PHONE_ERROR_MESSAGE } from "@/lib/telegram/phone";

describe("Telegram phone authorization flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (path: string) => ({
      ok: true,
      json: async () => ({
        state: path === "/api/telegram/cancel-authorization" ? "idle" : "code_required",
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
