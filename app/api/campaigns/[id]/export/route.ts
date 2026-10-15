import { authedRoute } from "@/lib/api/handler";
import { toCsv } from "@/lib/csv/export";
import { db } from "@/lib/database/prisma";
import { bulkRowStatus } from "@/lib/bulk/status";
import { getOwnedCampaign } from "@/lib/services/campaigns";

export const GET = authedRoute<{ id: string }>({}, async ({ user, params }) => {
  const campaign = await getOwnedCampaign(user.id, params.id);
  const rows = await db().campaignContact.findMany({
    where: { campaignId: campaign.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      contact: true,
      currentEmail: { select: { subject: true, body: true } },
      sends: { where: { kind: "CAMPAIGN", status: "SENT" }, select: { ccEmails: true }, take: 1 },
    },
  });
  const csv = toCsv(
    ["company_name", "to_name", "from_name", "email", "cc", "subject", "body", "status", "sent_at", "error"],
    rows.map((r) => [
      r.contact.companyName,
      r.contact.toPersonName,
      r.contact.fromPersonName,
      r.contact.email,
      (r.sends[0]?.ccEmails ?? campaign.ccEmails).join("; "),
      r.currentEmail?.subject ?? "",
      r.currentEmail?.body ?? "",
      bulkRowStatus({ status: r.status, approvalStatus: r.approvalStatus, hasEmail: Boolean(r.contact.email), hasDraft: Boolean(r.currentEmailId), blocked: Boolean(r.generationError) }),
      r.sentAt?.toISOString() ?? "",
      r.errorMessage ?? r.generationError ?? "",
    ]),
  );
  const safeName = campaign.campaignName.replace(/[^A-Za-z0-9-_]+/g, "_").slice(0, 60) || "campaign";
  return new Response("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}-results.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
