import { z } from "zod";

import { requireApiUser } from "@/lib/auth/session";
import { AppError, toErrorResponse } from "@/lib/errors";
import {
  isValidTelegramPhone,
  normalizeTelegramPhone,
  TELEGRAM_PHONE_ERROR_MESSAGE,
} from "@/lib/telegram/phone";
import { telegramService } from "@/lib/telegram/service";

const schema = z.object({
  phone: z.string().transform(normalizeTelegramPhone).refine(isValidTelegramPhone),
});

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", TELEGRAM_PHONE_ERROR_MESSAGE, 400);
    return Response.json(await telegramService.beginAuthorization(user.id, parsed.data.phone));
  } catch (error) {
    return toErrorResponse(error);
  }
}
