import { requireApiUser } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/errors";
import { telegramService } from "@/lib/telegram/service";

export async function POST() {
  try {
    const user = await requireApiUser();
    await telegramService.cancelAuthorization(user.id);
    return Response.json({ state: "idle" as const });
  } catch (error) {
    return toErrorResponse(error);
  }
}
