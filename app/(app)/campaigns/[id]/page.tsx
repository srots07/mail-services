import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/database/prisma";

export default async function CampaignPage({ params }: PageProps<"/campaigns/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const campaign = await db().campaign.findFirst({ where: { id, userId: user.id }, select: { status: true, bulkBody: true } });
  if (!campaign) notFound();
  const step = ["SCHEDULED", "RUNNING", "PAUSED", "COMPLETED"].includes(campaign.status)
    ? "results"
    : campaign.status === "DRAFT"
      ? campaign.bulkBody?.trim()
        ? "generate"
        : "template"
      : "review";
  redirect(`/campaigns/${id}/bulk/${step}`);
}
