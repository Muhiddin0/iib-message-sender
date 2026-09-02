import { requireApiUser } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/errors";
import { telegramService } from "@/lib/telegram/service";

export async function POST() {
  try {
    const user = await requireApiUser();
    return Response.json(await telegramService.resendAuthorizationCode(user.id));
  } catch (error) {
    return toErrorResponse(error);
  }
}
