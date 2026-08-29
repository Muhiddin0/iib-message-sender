import { requireApiUser } from "@/lib/auth/session";
import { campaignService } from "@/lib/campaign/service";
import { AppError, toErrorResponse } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 55 * 1024 * 1024) {
      throw new AppError("VALIDATION_ERROR", "Yuklama hajmi ruxsat etilgan limitdan katta.", 413);
    }
    const result = await campaignService.create(user.id, await request.formData());
    return Response.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
