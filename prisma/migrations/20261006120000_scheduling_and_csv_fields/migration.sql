-- Campaign lifecycle: approval + batch sending is replaced by confirm-and-schedule.
ALTER TYPE "CampaignStatus" RENAME VALUE 'APPROVED' TO 'SCHEDULED';
ALTER TYPE "CampaignStatus" RENAME VALUE 'SENDING' TO 'RUNNING';

-- Recipient lifecycle.
ALTER TYPE "RecipientStatus" RENAME VALUE 'PENDING' TO 'NEW';
ALTER TYPE "RecipientStatus" RENAME VALUE 'GENERATED' TO 'READY';
ALTER TYPE "RecipientStatus" RENAME VALUE 'APPROVED' TO 'SCHEDULED';
ALTER TABLE "campaign_contacts" ALTER COLUMN "status" SET DEFAULT 'NEW';

-- Per-user provider selection (Settings).
CREATE TYPE "AiProviderChoice" AS ENUM ('OPENROUTER', 'MOCK');
CREATE TYPE "EmailProviderChoice" AS ENUM ('GMAIL', 'MOCK');
ALTER TABLE "users" ADD COLUMN "ai_provider" "AiProviderChoice", ADD COLUMN "email_provider" "EmailProviderChoice";

-- Full CSV row preservation.
ALTER TABLE "contacts"
  ADD COLUMN "purpose_reason" TEXT,
  ADD COLUMN "tone" TEXT,
  ADD COLUMN "key_points" TEXT,
  ADD COLUMN "custom_fields" JSONB;

-- Scheduling.
ALTER TABLE "campaigns" ADD COLUMN "schedule_start_at" TIMESTAMP(3), ADD COLUMN "send_interval_sec" INTEGER;
ALTER TABLE "campaign_contacts" ADD COLUMN "scheduled_at" TIMESTAMP(3);
CREATE INDEX "campaign_contacts_status_scheduled_at_idx" ON "campaign_contacts"("status", "scheduled_at");

-- Legacy rows: approved recipients of campaigns that were already sending keep going now;
-- approved-but-unsent recipients elsewhere return to READY and must be scheduled explicitly.
UPDATE "campaign_contacts" cc SET "scheduled_at" = now()
FROM "campaigns" c
WHERE c."id" = cc."campaign_id" AND cc."status" = 'SCHEDULED' AND c."status" IN ('RUNNING', 'PAUSED');
UPDATE "campaign_contacts" SET "status" = 'READY' WHERE "status" = 'SCHEDULED' AND "scheduled_at" IS NULL;
UPDATE "campaigns" SET "schedule_start_at" = COALESCE("send_started_at", now()), "send_interval_sec" = 60
WHERE "status" IN ('RUNNING', 'PAUSED');
UPDATE "campaigns" SET "status" = 'READY_FOR_REVIEW' WHERE "status" = 'SCHEDULED' AND "schedule_start_at" IS NULL;
