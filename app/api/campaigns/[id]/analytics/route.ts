import { requireApiUser } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/errors";
import { campaignRepository } from "@/lib/repositories/campaign-repository";
import { telegramRepository } from "@/lib/repositories/telegram-repository";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const campaign = await campaignRepository.getOwnedRecord(user.id, id);
    const account = await telegramRepository.getAccountRecord(user.id);
    await telegramRepository.enqueueJob({
      userId: user.id,
      accountId: account?.id,
      campaignId: campaign.id,
      type: "refresh_analytics",
      idempotencyKey: `analytics:${campaign.id}:${Date.now()}`,
    });
    return Response.json({ queued: true }, { status: 202 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
