// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("next-auth/react", () => ({ signIn: mocks.signIn }));

import { EmailPasswordSignIn } from "@/components/auth/email-password-sign-in";

describe("PocketBase email/password form", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("submits normalized credentials and opens the dashboard", async () => {
    mocks.signIn.mockResolvedValue({ ok: true, error: null });
    render(<EmailPasswordSignIn />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "USER@GMAIL.COM " } });
    fireEvent.change(screen.getByLabelText("PocketBase paroli"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "Email bilan kirish" }));

    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith("credentials", {
      email: "user@gmail.com",
      password: "secret123",
      redirect: false,
    }));
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("shows the same safe error for invalid credentials", async () => {
    mocks.signIn.mockResolvedValue({ ok: false, error: "CredentialsSignin" });
    render(<EmailPasswordSignIn />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@gmail.com" } });
    fireEvent.change(screen.getByLabelText("PocketBase paroli"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Email bilan kirish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email yoki parol noto‘g‘ri.");
  });
});
