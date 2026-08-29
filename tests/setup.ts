import "@testing-library/jest-dom/vitest";

process.env.TELEGRAM_API_ID = "12345";
process.env.TELEGRAM_API_HASH = "0123456789abcdef0123456789abcdef";
process.env.TELEGRAM_SESSION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.TELEGRAM_SESSION_KEY_VERSION = "1";

