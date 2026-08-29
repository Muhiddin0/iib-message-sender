const TELEGRAM_MESSAGE_HOSTS = new Set(["t.me", "telegram.me"]);

export function normalizeTelegramMessageLink(value: string): string | null {
  const input = value.trim();
  if (!input || input.length > 1000) return null;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (url.protocol !== "https:" || !TELEGRAM_MESSAGE_HOSTS.has(hostname)) return null;
  if (url.username || url.password || url.port) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  const messageId = parts.at(-1);
  if (!messageId || !/^\d+$/.test(messageId) || Number(messageId) < 1) return null;

  const isPrivate = parts[0] === "c" && parts.length >= 3 && /^\d+$/.test(parts[1]);
  const publicUsername = parts[0] === "s" ? parts[1] : parts[0];
  const isPublic = parts[0] !== "c"
    && parts.length >= (parts[0] === "s" ? 3 : 2)
    && /^[A-Za-z0-9_]{4,}$/.test(publicUsername ?? "");
  if (!isPrivate && !isPublic) return null;

  url.protocol = "https:";
  url.hostname = "t.me";
  url.hash = "";
  return url.toString();
}
