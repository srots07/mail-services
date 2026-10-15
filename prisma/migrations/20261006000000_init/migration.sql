-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'GENERATING', 'READY_FOR_REVIEW', 'APPROVED', 'SENDING', 'COMPLETED', 'PAUSED', 'FAILED');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'GENERATING', 'GENERATED', 'APPROVED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SendKind" AS ENUM ('CAMPAIGN', 'TEST');

-- CreateEnum
CREATE TYPE "SendStatus" AS ENUM ('SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailProviderType" AS ENUM ('GMAIL', 'MICROSOFT', 'MOCK');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "LogCategory" AS ENUM ('CSV_IMPORT', 'AI_GENERATION', 'AI_ERROR', 'EMAIL_SEND', 'EMAIL_FAILURE', 'RETRY', 'AUTH', 'CAMPAIGN_STATE');

-- CreateEnum
CREATE TYPE "AiLogStatus" AS ENUM ('SUCCESS', 'RETRY', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "csrf_token" TEXT NOT NULL,
    "user_agent" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "EmailProviderType" NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "access_token_enc" TEXT,
    "refresh_token_enc" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company_name" TEXT,
    "to_person_name" TEXT,
    "from_person_name" TEXT,
    "context" TEXT,
    "subject_context" TEXT,
    "additional_details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "campaign_name" TEXT NOT NULL,
    "description" TEXT,
    "email_template" TEXT,
    "ai_prompt" TEXT,
    "target_words" INTEGER,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "prompt_version" INTEGER NOT NULL DEFAULT 1,
    "total_contacts" INTEGER NOT NULL DEFAULT 0,
    "generated_count" INTEGER NOT NULL DEFAULT 0,
    "approved_count" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "generation_paused" BOOLEAN NOT NULL DEFAULT false,
    "generation_paused_reason" TEXT,
    "sender_account_id" TEXT,
    "send_confirmed_at" TIMESTAMP(3),
    "send_started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "next_batch_at" TIMESTAMP(3),
    "batch_delay_ms" INTEGER,
    "paused_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_prompt_versions" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "ai_prompt" TEXT,
    "email_template" TEXT,
    "target_words" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_contacts" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "status" "RecipientStatus" NOT NULL DEFAULT 'PENDING',
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "current_email_id" TEXT,
    "queued_for_generation" BOOLEAN NOT NULL DEFAULT false,
    "generation_attempts" INTEGER NOT NULL DEFAULT 0,
    "generation_error" TEXT,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3),
    "provider_message_id" TEXT,
    "locked_at" TIMESTAMP(3),
    "next_attempt_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_emails" (
    "id" TEXT NOT NULL,
    "campaign_contact_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" INTEGER NOT NULL,
    "prompt_snapshot" TEXT NOT NULL,
    "edited_by_user" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_sends" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "campaign_contact_id" TEXT,
    "generated_email_id" TEXT,
    "kind" "SendKind" NOT NULL,
    "status" "SendStatus" NOT NULL,
    "provider" "EmailProviderType" NOT NULL,
    "from_email" TEXT NOT NULL,
    "to_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "provider_message_id" TEXT,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_sends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_generation_logs" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "campaign_contact_id" TEXT,
    "generated_email_id" TEXT,
    "status" "AiLogStatus" NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "http_status" INTEGER,
    "error_message" TEXT,
    "latency_ms" INTEGER,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "generation_timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_generation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "campaign_id" TEXT,
    "category" "LogCategory" NOT NULL,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_accounts_user_id_provider_key" ON "email_accounts"("user_id", "provider");

-- CreateIndex
CREATE INDEX "contacts_email_idx" ON "contacts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_user_id_email_key" ON "contacts"("user_id", "email");

-- CreateIndex
CREATE INDEX "campaigns_user_id_created_at_idx" ON "campaigns"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_prompt_versions_campaign_id_version_key" ON "campaign_prompt_versions"("campaign_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_contacts_current_email_id_key" ON "campaign_contacts"("current_email_id");

-- CreateIndex
CREATE INDEX "campaign_contacts_campaign_id_idx" ON "campaign_contacts"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_contacts_contact_id_idx" ON "campaign_contacts"("contact_id");

-- CreateIndex
CREATE INDEX "campaign_contacts_campaign_id_status_idx" ON "campaign_contacts"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "campaign_contacts_queued_for_generation_status_idx" ON "campaign_contacts"("queued_for_generation", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_contacts_campaign_id_contact_id_key" ON "campaign_contacts"("campaign_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "generated_emails_campaign_contact_id_version_key" ON "generated_emails"("campaign_contact_id", "version");

-- CreateIndex
CREATE INDEX "email_sends_status_idx" ON "email_sends"("status");

-- CreateIndex
CREATE INDEX "email_sends_sent_at_idx" ON "email_sends"("sent_at");

-- CreateIndex
CREATE INDEX "email_sends_campaign_id_kind_idx" ON "email_sends"("campaign_id", "kind");

-- CreateIndex
CREATE INDEX "email_sends_campaign_contact_id_idx" ON "email_sends"("campaign_contact_id");

-- CreateIndex
CREATE INDEX "ai_generation_logs_campaign_id_generation_timestamp_idx" ON "ai_generation_logs"("campaign_id", "generation_timestamp");

-- CreateIndex
CREATE INDEX "ai_generation_logs_campaign_contact_id_idx" ON "ai_generation_logs"("campaign_contact_id");

-- CreateIndex
CREATE INDEX "activity_logs_campaign_id_created_at_idx" ON "activity_logs"("campaign_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_logs_user_id_created_at_idx" ON "activity_logs"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_sender_account_id_fkey" FOREIGN KEY ("sender_account_id") REFERENCES "email_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_prompt_versions" ADD CONSTRAINT "campaign_prompt_versions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_current_email_id_fkey" FOREIGN KEY ("current_email_id") REFERENCES "generated_emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_emails" ADD CONSTRAINT "generated_emails_campaign_contact_id_fkey" FOREIGN KEY ("campaign_contact_id") REFERENCES "campaign_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_campaign_contact_id_fkey" FOREIGN KEY ("campaign_contact_id") REFERENCES "campaign_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_generated_email_id_fkey" FOREIGN KEY ("generated_email_id") REFERENCES "generated_emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generation_logs" ADD CONSTRAINT "ai_generation_logs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generation_logs" ADD CONSTRAINT "ai_generation_logs_campaign_contact_id_fkey" FOREIGN KEY ("campaign_contact_id") REFERENCES "campaign_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generation_logs" ADD CONSTRAINT "ai_generation_logs_generated_email_id_fkey" FOREIGN KEY ("generated_email_id") REFERENCES "generated_emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one in-flight or successful campaign send per recipient. Enforces duplicate-send
-- protection at the database level, independent of application logic.
CREATE UNIQUE INDEX "email_sends_one_active_campaign_send" ON "email_sends"("campaign_contact_id") WHERE "kind" = 'CAMPAIGN' AND "status" IN ('SENDING', 'SENT');