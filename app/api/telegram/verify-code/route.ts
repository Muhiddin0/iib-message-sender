import { z } from "zod";

import { requireApiUser } from "@/lib/auth/session";
import { AppError, toErrorResponse } from "@/lib/errors";
import { telegramService } from "@/lib/telegram/service";

const schema = z.object({ code: z.string().regex(/^\d{3,10}$/) });

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Tasdiqlash kodini tekshiring.", 400);
    return Response.json(await telegramService.verifyCode(user.id, parsed.data.code));
  } catch (error) {
    return toErrorResponse(error);
  }
}

