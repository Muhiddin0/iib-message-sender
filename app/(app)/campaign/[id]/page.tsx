import { CampaignLiveDetail } from "@/components/campaign/campaign-live-detail";
import { requirePageUser } from "@/lib/auth/session";
import { campaignRepository } from "@/lib/repositories/campaign-repository";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const detail = await campaignRepository.getDetail(user.id, id);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <CampaignLiveDetail initial={detail} />
    </main>
  );
}
