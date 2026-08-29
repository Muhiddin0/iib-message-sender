"use client";

import { Button } from "@cloudflare/kumo";
import { ArrowsClockwiseIcon, PlugsConnectedIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AccountActions() {
  const router = useRouter();
  const [busy, setBusy] = useState<"sync" | "disconnect" | null>(null);
  const [message, setMessage] = useState("");

  async function action(type: "sync" | "disconnect") {
    setBusy(type);
    setMessage("");
    try {
      const response = await fetch(`/api/telegram/${type}`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Amal bajarilmadi.");
      setMessage(type === "sync" ? "Sinxronlash navbatga qo‘yildi." : "Telegram hisobi uzildi.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Amal bajarilmadi.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        icon={ArrowsClockwiseIcon}
        loading={busy === "sync"}
        disabled={busy !== null}
        onClick={() => action("sync")}
      >
        Chatlarni yangilash
      </Button>
      <Button
        size="sm"
        variant="secondary-destructive"
        icon={PlugsConnectedIcon}
        loading={busy === "disconnect"}
        disabled={busy !== null}
        onClick={() => action("disconnect")}
      >
        Hisobni uzish
      </Button>
      {message ? <span className="text-xs text-kumo-subtle" role="status">{message}</span> : null}
    </div>
  );
}

