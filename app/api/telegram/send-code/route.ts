import { z } from "zod";

import { requireApiUser } from "@/lib/auth/session";
import { AppError, toErrorResponse } from "@/lib/errors";
import { telegramService } from "@/lib/telegram/service";

const schema = z.object({ phone: z.string().regex(/^\+[1-9]\d{7,14}$/) });

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Raqamni +998… xalqaro formatida kiriting.", 400);
    return Response.json(await telegramService.beginAuthorization(user.id, parsed.data.phone));
  } catch (error) {
    return toErrorResponse(error);
  }
}

