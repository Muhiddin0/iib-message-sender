import { tl } from "@mtcute/core";

import { AppError } from "@/lib/errors";

const UNAUTHORIZED = new Set([
  "AUTH_KEY_UNREGISTERED",
  "AUTH_KEY_INVALID",
  "SESSION_REVOKED",
  "SESSION_EXPIRED",
  "USER_DEACTIVATED",
]);

const PERMISSION_DENIED = new Set([
  "CHAT_WRITE_FORBIDDEN",
  "CHAT_SEND_MEDIA_FORBIDDEN",
  "CHAT_SEND_PHOTOS_FORBIDDEN",
  "CHAT_SEND_VIDEOS_FORBIDDEN",
  "CHAT_SEND_AUDIOS_FORBIDDEN",
  "CHAT_SEND_DOCS_FORBIDDEN",
  "CHAT_SEND_POLL_FORBIDDEN",
  "CHAT_FORWARDS_RESTRICTED",
  "CHANNEL_PRIVATE",
  "USER_BANNED_IN_CHANNEL",
]);

export function telegramError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (tl.RpcError.is(error)) {
    if (error.code === tl.RpcError.FLOOD) {
      const parsedSeconds = Number(error.text.match(/_(\d+)$/)?.[1]);
      const seconds =
        "seconds" in error && typeof error.seconds === "number"
          ? error.seconds
          : Number.isFinite(parsedSeconds) && parsedSeconds > 0
            ? parsedSeconds
            : 60;
      return new AppError(
        "TELEGRAM_FLOOD_WAIT",
        "Telegram vaqtincha cheklov qo‘ydi. Jarayon xavfsiz vaqtda davom etadi.",
        429,
        Math.max(1, seconds),
      );
    }
    if (UNAUTHORIZED.has(error.text) || error.code === tl.RpcError.UNAUTHORIZED) {
      return new AppError(
        "TELEGRAM_UNAUTHORIZED",
        "Telegram sessiyasi amal qilmaydi. Hisobni qayta ulang.",
        401,
      );
    }
    if (PERMISSION_DENIED.has(error.text) || error.code === tl.RpcError.FORBIDDEN) {
      return new AppError(
        "TELEGRAM_PERMISSION_DENIED",
        "Bu chatga xabar yuborish uchun ruxsat yo‘q.",
        403,
      );
    }

    const messages: Partial<Record<string, string>> = {
      PHONE_NUMBER_INVALID: "Telefon raqami xalqaro formatda noto‘g‘ri kiritilgan.",
      PHONE_NUMBER_BANNED: "Bu telefon raqami Telegram tomonidan cheklangan.",
      PHONE_CODE_INVALID: "Tasdiqlash kodi noto‘g‘ri.",
      PHONE_CODE_EXPIRED: "Tasdiqlash kodi eskirgan. Yangi kod so‘rang.",
      PASSWORD_HASH_INVALID: "Ikki bosqichli himoya paroli noto‘g‘ri.",
    };
    const known = messages[error.text];
    if (known) return new AppError("VALIDATION_ERROR", known, 400);
  }

  return new AppError(
    "TELEGRAM_TEMPORARY",
    "Telegram bilan bog‘lanib bo‘lmadi. Birozdan keyin qayta urinib ko‘ring.",
    503,
  );
}

export function isPasswordRequired(error: unknown) {
  return tl.RpcError.is(error, "SESSION_PASSWORD_NEEDED");
}
