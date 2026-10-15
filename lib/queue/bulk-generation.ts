import "server-only";
import { getAiProvider } from "@/lib/ai";
import { buildBulkPrompt, bulkBodyProblems, bulkLeakProblems, bulkSubjectProblems } from "@/lib/ai/bulk-email";
import { promptSnapshot } from "@/lib/ai/prompt";
import { AiError, describeAiError } from "@/lib/ai/types";
import { hasSenderPlaceholders, renderBulkEmail, senderSignature } from "@/lib/bulk/placeholders";
import { db } from "@/lib/database/prisma";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/errors";
import { BULK_MODEL, snapshotSender } from "@/lib/services/bulk";
import { refreshCampaignCounters } from "@/lib/services/campaigns";
import { logActivity } from "@/lib/services/logs";
import { getProviderSettings } from "@/lib/services/providers";
import { backoffDelay, sleep } from "./backoff";

const MAX_VALIDATION_RETRIES = 1;

/**
 * One row. The body is first rendered deterministically (placeholders filled, sender signature
 * appended); the AI then writes the subject (if chosen) and adjusts that body with the row's details.
 * Anything that fails the checks falls back to the rendered body, so the sender's text is never lost.
 */
export async function runBulkJob(ccId: string): Promise<void> {
  const cc = await db().campaignContact.findUnique({ where: { id: ccId }, include: { campaign: true, contact: true } });
  if (!cc || cc.status !== "GENERATING") return;
  const { campaign, contact } = cc;
  const sender = snapshotSender(campaign.senderSnapshot) ?? { senderName: "", designation: null, companyName: null, email: null, phone: null, website: null };
  const customerName = contact.toPersonName ?? "";
  const companyName = contact.companyName ?? "";
  const extra = contact.customFields && typeof contact.customFields === "object" && !Array.isArray(contact.customFields) ? (contact.customFields as Record<string, string>) : {};
  const aiSubject = campaign.subjectMode === "AI";
  const aiBody = true;
  const rendered = renderBulkEmail({
    body: campaign.bulkBody ?? "",
    subjectTemplate: aiSubject ? "AI subject" : (campaign.subjectTemplate ?? ""),
    recipient: { customerName, companyName, fromName: contact.fromPersonName },
    sender,
    productLineFallback: campaign.productLineFallback,
  });
  const fixedSubject = aiSubject ? null : rendered.subject;
  const prompt = buildBulkPrompt({
    renderedBody: rendered.body,
    fixedSubject,
    aiBody,
    instructions: campaign.aiInstructions,
    customerName,
    companyName,
    fromName: contact.fromPersonName,
    extra,
  });
  const supplied = [contact.fromPersonName, ...Object.values(extra)].filter(Boolean).join("\n");
  const signature = hasSenderPlaceholders(campaign.bulkBody ?? "") ? "" : senderSignature(sender, contact.fromPersonName);
  const snapshot = promptSnapshot(prompt);
  const settings = await getProviderSettings(campaign.userId);
  const provider = getAiProvider(settings.ai);
  const peerRows = await db().campaignContact.findMany({ where: { campaignId: campaign.id }, select: { id: true, contact: { select: { email: true, toPersonName: true, companyName: true } } } });
  const peers = peerRows.map((r) => ({ id: r.id, email: r.contact.email ?? "", name: r.contact.toPersonName, company: r.contact.companyName }));
  const who = `${customerName} (${companyName})`;

  let subject = fixedSubject ?? "";
  let body = rendered.body;
  let model = BULK_MODEL;
  let aiProblem: string | null = null;
  const maxAttempts = env().AI_MAX_RETRIES + 1 + MAX_VALIDATION_RETRIES;
  let validationRetries = 0;
  let correction: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const fresh = await db().campaign.findUnique({ where: { id: campaign.id }, select: { generationPaused: true, status: true } });
    if (!fresh || fresh.generationPaused || ["RUNNING", "SCHEDULED", "COMPLETED"].includes(fresh.status)) {
      await db().campaignContact.updateMany({ where: { id: cc.id, status: "GENERATING" }, data: { status: cc.currentEmailId ? "READY" : "NEW", lockedAt: null, queuedForGeneration: true } });
      await refreshCampaignCounters(campaign.id);
      return;
    }
    try {
      const result = await provider.generate(prompt, { correction });
      const candidate = {
        subject: aiSubject ? result.content.subject.replace(/\s+/g, " ").trim() : (fixedSubject ?? ""),
        body: aiBody ? result.content.body : rendered.body,
      };
      const problems = [
        ...(aiSubject ? bulkSubjectProblems(candidate.subject) : []),
        ...(aiBody ? bulkBodyProblems(rendered.body, candidate.body) : []),
        ...(aiBody && signature && !candidate.body.trimEnd().endsWith(signature) ? ["Changed the sender signature block"] : []),
        ...bulkLeakProblems(candidate, { id: cc.id, name: customerName, company: companyName, renderedBody: rendered.body, supplied }, peers),
      ];
      await db().aiGenerationLog.create({
        data: {
          campaignId: campaign.id,
          campaignContactId: cc.id,
          status: problems.length ? (validationRetries < MAX_VALIDATION_RETRIES ? "RETRY" : "FAILED") : "SUCCESS",
          model: result.model,
          promptVersion: campaign.promptVersion,
          prompt: snapshot,
          attempt,
          httpStatus: 200,
          latencyMs: result.latencyMs,
          promptTokens: result.promptTokens ?? null,
          completionTokens: result.completionTokens ?? null,
          errorMessage: problems.length ? `VALIDATION: ${problems.join("; ")}`.slice(0, 1000) : null,
        },
      });
      if (!problems.length) {
        subject = candidate.subject;
        body = candidate.body;
        model = result.model;
        aiProblem = null;
        break;
      }
      aiProblem = problems.join("; ");
      if (validationRetries >= MAX_VALIDATION_RETRIES) break;
      validationRetries++;
      correction = aiProblem;
    } catch (err) {
      const aiErr = err instanceof AiError ? err : new AiError("NETWORK", errorMessage(err));
      aiProblem = describeAiError(aiErr);
      await db().aiGenerationLog.create({
        data: {
          campaignId: campaign.id,
          campaignContactId: cc.id,
          status: aiErr.retryable && attempt < maxAttempts ? "RETRY" : "FAILED",
          model: provider.model(),
          promptVersion: campaign.promptVersion,
          prompt: snapshot,
          attempt,
          httpStatus: aiErr.httpStatus ?? null,
          errorMessage: `${aiErr.kind}: ${aiErr.message}`.slice(0, 1000),
        },
      });
      if (aiErr.kind === "AUTH" || aiErr.kind === "CREDITS" || aiErr.kind === "NOT_CONFIGURED") {
        await db().campaign.update({ where: { id: campaign.id }, data: { generationPaused: true, generationPausedReason: aiProblem } });
        await db().campaignContact.updateMany({
          where: { id: cc.id, status: "GENERATING" },
          data: { status: cc.currentEmailId ? "READY" : "NEW", lockedAt: null, queuedForGeneration: true, generationError: aiProblem },
        });
        await logActivity({ category: "AI_ERROR", level: "ERROR", userId: campaign.userId, campaignId: campaign.id, message: `Bulk AI paused: ${aiProblem}` });
        await refreshCampaignCounters(campaign.id);
        return;
      }
      if (!aiErr.retryable || attempt >= maxAttempts) break;
      await sleep(aiErr.retryAfterMs ?? backoffDelay(attempt, aiErr.kind === "RATE_LIMIT" ? 4000 : 1500, 60_000));
    }
  }

  // Fallback keeps the rendered body. Only a missing AI subject (no fixed subject) blocks approval.
  const blocking = [...rendered.problems.filter((p) => !(aiSubject && /subject/i.test(p)))];
  if (aiSubject && model === BULK_MODEL) blocking.push(`AI subject not generated (${aiProblem ?? "unknown error"}); write a subject or regenerate`);
  await db().$transaction(async (tx) => {
    const current = await tx.campaignContact.findUnique({ where: { id: cc.id }, select: { status: true } });
    if (current?.status !== "GENERATING") return;
    const last = await tx.generatedEmail.aggregate({ where: { campaignContactId: cc.id }, _max: { version: true } });
    const email = await tx.generatedEmail.create({
      data: { campaignContactId: cc.id, version: (last._max.version ?? 0) + 1, subject, body, model, promptVersion: campaign.promptVersion, promptSnapshot: snapshot },
    });
    await tx.campaignContact.update({
      where: { id: cc.id },
      data: {
        currentEmailId: email.id,
        status: "READY",
        approvalStatus: "PENDING",
        queuedForGeneration: false,
        generationError: blocking.length ? blocking.join("; ").slice(0, 1000) : null,
        errorMessage: null,
        lockedAt: null,
        nextAttemptAt: null,
      },
    });
  });
  await logActivity({
    category: aiProblem ? "AI_ERROR" : "AI_GENERATION",
    level: aiProblem ? "WARN" : "INFO",
    userId: campaign.userId,
    campaignId: campaign.id,
    message: aiProblem
      ? `Bulk email for ${who}: AI output not used (${aiProblem}); kept your template text`
      : `Bulk email for ${who} generated with ${provider.name}`,
    metadata: { recipientId: cc.id, provider: provider.name, model },
  });
  await refreshCampaignCounters(campaign.id);
}
