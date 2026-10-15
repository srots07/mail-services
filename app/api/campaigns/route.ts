import { authedRoute, ok } from "@/lib/api/handler";
import { db } from "@/lib/database/prisma";

export const GET = authedRoute({}, async ({ user }) => {
  const campaigns = await db().campaign.findMany({
    where: { userId: user.id, kind: "BULK" },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return ok({
    items: campaigns.map((c) => ({
      id: c.id,
      campaignName: c.campaignName,
      status: c.status,
      totalContacts: c.totalContacts,
      generatedCount: c.generatedCount,
      approvedCount: c.approvedCount,
      sentCount: c.sentCount,
      failedCount: c.failedCount,
      createdAt: c.createdAt.toISOString(),
    })),
  });
});
