import { notFound } from "next/navigation";
import { BulkWizard } from "@/components/bulk/bulk-wizard";
import { requireUser } from "@/lib/auth/session";
import { isBulkStep } from "@/lib/bulk/steps";
import { db } from "@/lib/database/prisma";

export default async function BulkStepPage({ params }: PageProps<"/campaigns/[id]/bulk/[step]">) {
  const user = await requireUser();
  const { id, step } = await params;
  if (!isBulkStep(step)) notFound();
  const campaign = await db().campaign.findFirst({ where: { id, userId: user.id }, select: { kind: true } });
  if (!campaign) notFound();
  if (campaign.kind !== "BULK") {
    return (
      <div role="alert" className="rounded-lg border border-line bg-panel-2 p-4 text-sm text-muted">
        This campaign was created with an older version of Sorts and can no longer be opened. Start a new campaign with the same contact list instead.
      </div>
    );
  }
  return <BulkWizard campaignId={id} step={step} />;
}
