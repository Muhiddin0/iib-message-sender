import { requireApiUser } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/errors";
import { createCampaignWorkbook } from "@/lib/export/campaign-workbook";
import { campaignRepository } from "@/lib/repositories/campaign-repository";

export const dynamic = "force-dynamic";

function fileDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function GET(_request: Request, context: RouteContext<"/api/campaigns/[id]/export">) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const detail = await campaignRepository.getDetail(user.id, id);
    const now = new Date();
    const workbook = await createCampaignWorkbook({
      campaigns: [detail.campaign],
      deliveries: detail.deliveries,
    }, now);

    return new Response(new Uint8Array(workbook), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="osing-campaign-${id}-${fileDate(now)}.xlsx"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
