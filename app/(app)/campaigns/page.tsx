import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { CampaignTable } from "@/components/campaigns/campaign-table";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { needsAttention } from "@/lib/campaign-status";
import { db } from "@/lib/database/prisma";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const user = await requireUser();
  const campaigns = await db().campaign.findMany({ where: { userId: user.id, kind: "BULK" }, orderBy: { createdAt: "desc" }, take: 500 });
  const newButton = (
    <ButtonLink href="/campaigns/new" variant="primary">
      <Plus aria-hidden />
      New campaign
    </ButtonLink>
  );
  const sent = campaigns.reduce((n, c) => n + c.sentCount, 0);
  const contacts = campaigns.reduce((n, c) => n + c.totalContacts, 0);
  const attention = campaigns.filter(needsAttention).length;
  const running = campaigns.filter((c) => c.status === "RUNNING" || c.status === "SCHEDULED" || c.status === "GENERATING").length;

  return (
    <>
      <PageHeader
        eyebrow="Outreach"
        title="Campaigns"
        description="Each campaign takes one contact list from upload to AI drafts, your review, and sending."
        actions={newButton}
        meta={
          campaigns.length > 0 && (
            <>
              <span>
                <span className="type-data text-fg">{campaigns.length}</span> campaigns
              </span>
              <span>
                <span className="type-data text-fg">{contacts.toLocaleString()}</span> contacts
              </span>
              <span>
                <span className="type-data text-success">{sent.toLocaleString()}</span> emails sent
              </span>
              {running > 0 && (
                <span>
                  <span className="type-data text-info">{running}</span> in progress
                </span>
              )}
              {attention > 0 && (
                <span>
                  <span className="type-data text-warning">{attention}</span> need attention
                </span>
              )}
            </>
          )
        }
      />
      {campaigns.length === 0 ? (
        <EmptyState
          scene
          title="No campaigns yet"
          description="Start with an Excel, CSV or PDF list of company names, contact names and emails. Sorts drafts one email per contact, and nothing is sent until you approve it."
          action={newButton}
        />
      ) : (
        <Card variant="chart" className="overflow-hidden">
          <CampaignTable rows={campaigns.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))} />
        </Card>
      )}
    </>
  );
}
