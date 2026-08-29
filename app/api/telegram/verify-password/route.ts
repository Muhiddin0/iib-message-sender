import { z } from "zod";

import { requireApiUser } from "@/lib/auth/session";
import { AppError, toErrorResponse } from "@/lib/errors";
import { telegramService } from "@/lib/telegram/service";

const schema = z.object({ password: z.string().min(1).max(256) });

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Ikki bosqichli himoya parolini kiriting.", 400);
    return Response.json(await telegramService.verifyPassword(user.id, parsed.data.password));
  } catch (error) {
    return toErrorResponse(error);
  }
}

