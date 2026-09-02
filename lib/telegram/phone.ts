export const TELEGRAM_PHONE_ERROR_MESSAGE =
  "Telefon raqamini +998901234567 kabi xalqaro formatda kiriting.";

const E164_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

export function normalizeTelegramPhone(value: string) {
  return value.replace(/[\s()-]/g, "");
}

export function isValidTelegramPhone(value: string) {
  return E164_PHONE_PATTERN.test(value);
}
