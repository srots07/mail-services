import { z } from "zod";
import { authedRoute, ok } from "@/lib/api/handler";
import { db } from "@/lib/database/prisma";
import { LogCategory } from "@/lib/generated/prisma/enums";
import { getOwnedCampaign } from "@/lib/services/campaigns";

const querySchema = z.object({
  type: z.enum(["activity", "ai", "sends"]).default("activity"),
  category: z.enum(LogCategory).optional(),
  limit: z.coerce.number().int().min(10).max(500).default(200),
});

export const GET = authedRoute<{ id: string }>({}, async ({ req, user, params }) => {
  const campaign = await getOwnedCampaign(user.id, params.id);
  const q = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));

  if (q.type === "ai") {
    const logs = await db().aiGenerationLog.findMany({
      where: { campaignId: campaign.id },
      orderBy: { generatedAt: "desc" },
      take: q.limit,
      include: { campaignContact: { select: { contact: { select: { email: true } } } } },
    });
    return ok({
      items: logs.map((l) => ({
        id: l.id,
        status: l.status,
        model: l.model,
        promptVersion: l.promptVersion,
        attempt: l.attempt,
        httpStatus: l.httpStatus,
        errorMessage: l.errorMessage,
        latencyMs: l.latencyMs,
        promptTokens: l.promptTokens,
        completionTokens: l.completionTokens,
        prompt: l.prompt,
        recipient: l.campaignContact?.contact.email ?? null,
        generatedAt: l.generatedAt.toISOString(),
      })),
    });
  }

  if (q.type === "sends") {
    const sends = await db().emailSend.findMany({ where: { campaignId: campaign.id }, orderBy: { createdAt: "desc" }, take: q.limit });
    return ok({
      items: sends.map((s) => ({
        id: s.id,
        kind: s.kind,
        status: s.status,
        provider: s.provider,
        toEmail: s.toEmail,
        ccEmails: s.ccEmails,
        subject: s.subject,
        attempt: s.attempt,
        errorMessage: s.errorMessage,
        providerMessageId: s.providerMessageId,
        sentAt: s.sentAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
      })),
    });
  }

  const logs = await db().activityLog.findMany({
    where: { campaignId: campaign.id, ...(q.category ? { category: q.category } : {}) },
    orderBy: { createdAt: "desc" },
    take: q.limit,
  });
  return ok({
    items: logs.map((l) => ({ id: l.id, category: l.category, level: l.level, message: l.message, metadata: l.metadata, createdAt: l.createdAt.toISOString() })),
  });
});
