import { requireApiUser } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/errors";
import { telegramService } from "@/lib/telegram/service";

export async function POST() {
  try {
    const user = await requireApiUser();
    await telegramService.disconnect(user.id);
    return Response.json({ disconnected: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

