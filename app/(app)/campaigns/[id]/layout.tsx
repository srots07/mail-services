import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BulkStepper } from "@/components/bulk/bulk-stepper";
import { SortsFlowLine } from "@/components/sorts/flow-line";
import { StatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/database/prisma";
import { formatDate } from "@/lib/utils";

export async function generateMetadata({ params }: LayoutProps<"/campaigns/[id]">): Promise<Metadata> {
  const user = await requireUser();
  const { id } = await params;
  const campaign = await db().campaign.findFirst({ where: { id, userId: user.id }, select: { campaignName: true } });
  return { title: campaign?.campaignName ?? "Campaign" };
}

export default async function CampaignLayout({ children, params }: LayoutProps<"/campaigns/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const campaign = await db().campaign.findFirst({
    where: { id, userId: user.id },
    select: { id: true, campaignName: true, status: true, totalContacts: true, sentCount: true, createdAt: true },
  });
  if (!campaign) notFound();
  const sentShare = campaign.totalContacts > 0 ? campaign.sentCount / campaign.totalContacts : 0;
  return (
    <div className="space-y-5">
      <div>
        <PageHeader
          className="mb-4"
          eyebrow="Campaign"
          title={campaign.campaignName}
          status={<StatusBadge status={campaign.status} />}
          meta={
            <>
              <span>
                <span className="type-data text-fg">{campaign.totalContacts.toLocaleString()}</span> contacts
              </span>
              <span className="inline-flex items-center gap-2">
                <span>
                  <span className="type-data text-success">{campaign.sentCount.toLocaleString()}</span> sent
                </span>
                <span className="w-24">
                  <SortsFlowLine value={sentShare} label={`${campaign.sentCount} of ${campaign.totalContacts} emails sent`} thickness={2} />
                </span>
              </span>
              <span>Created {formatDate(campaign.createdAt.toISOString())}</span>
            </>
          }
        />
        <BulkStepper campaignId={campaign.id} />
      </div>
      {children}
    </div>
  );
}
