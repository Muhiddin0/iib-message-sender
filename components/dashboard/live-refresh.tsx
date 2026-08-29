"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function DashboardLiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const events = new EventSource("/api/dashboard/events");
    let timer: ReturnType<typeof setTimeout> | undefined;
    events.addEventListener("update", () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    });
    return () => {
      clearTimeout(timer);
      events.close();
    };
  }, [router]);
  return null;
}

