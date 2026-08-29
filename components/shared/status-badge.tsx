import { Badge, type BadgeVariant } from "@cloudflare/kumo";

const labels: Record<string, string> = {
  connected: "Ulangan",
  disconnected: "Uzilgan",
  session_expired: "Sessiya eskirgan",
  authorization_required: "Qayta ulash kerak",
  temporarily_unavailable: "Vaqtincha mavjud emas",
  draft: "Qoralama",
  queued: "Navbatda",
  sending: "Yuborilmoqda",
  completed: "Yakunlandi",
  partial: "Qisman yakunlandi",
  failed: "Xato",
  cancelled: "Bekor qilindi",
  flood_wait: "Telegram kutish rejimi",
  sent: "Yuborildi",
  unauthorized: "Sessiya yaroqsiz",
  permission_denied: "Ruxsat yo‘q",
};

const variants: Record<string, BadgeVariant> = {
  connected: "success",
  completed: "success",
  sent: "success",
  queued: "secondary",
  draft: "secondary",
  sending: "info",
  partial: "warning",
  flood_wait: "warning",
  temporarily_unavailable: "warning",
  failed: "error",
  unauthorized: "error",
  session_expired: "error",
  authorization_required: "error",
  permission_denied: "error",
  cancelled: "secondary",
  disconnected: "secondary",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={variants[status] ?? "secondary"}>{labels[status] ?? status}</Badge>;
}

