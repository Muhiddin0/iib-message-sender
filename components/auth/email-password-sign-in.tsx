"use client";

import { Button, Input, SensitiveInput } from "@cloudflare/kumo";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function EmailPasswordSignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (!result?.ok || result.error) {
        setError("Email yoki parol noto‘g‘ri.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Kirish vaqtincha ishlamayapti. Qayta urinib ko‘ring.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <Input
        label="Email"
        placeholder="name@gmail.com"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <SensitiveInput
        label="PocketBase paroli"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      {error ? (
        <p className="rounded-lg bg-kumo-danger-tint px-3 py-2 text-sm text-kumo-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        className="w-full justify-center"
        type="submit"
        variant="primary"
        size="lg"
        icon={EnvelopeSimpleIcon}
        loading={loading}
        disabled={loading}
      >
        Email bilan kirish
      </Button>
    </form>
  );
}
