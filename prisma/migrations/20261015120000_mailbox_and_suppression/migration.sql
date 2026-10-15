-- CreateEnum
CREATE TYPE "MailFolder" AS ENUM ('INBOX', 'SENT', 'DRAFTS', 'STARRED', 'SNOOZED', 'ARCHIVE', 'SPAM', 'TRASH');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'ACCEPTED', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'FAILED');

-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('EMAIL_RECEIVED', 'EMAIL_SENT', 'CAMPAIGN_COMPLETED', 'CONTACT_CREATED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "campaign_credits" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "campaigns_used" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "upi_payments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 85.0,
    "credits_granted" INTEGER NOT NULL DEFAULT 5,
    "utr" TEXT NOT NULL,
    "screenshot_data" TEXT,
    "status" TEXT NOT NULL DEFAULT 'VERIFIED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upi_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailbox_messages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "folder" "MailFolder" NOT NULL DEFAULT 'INBOX',
    "direction" "MessageDirection" NOT NULL DEFAULT 'INBOUND',
    "from_email" TEXT NOT NULL,
    "from_name" TEXT,
    "to_emails" TEXT[],
    "cc_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bcc_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reply_to" TEXT,
    "subject" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "body_html" TEXT,
    "snippet" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "is_starred" BOOLEAN NOT NULL DEFAULT false,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "importance" TEXT DEFAULT 'normal',
    "snoozed_until" TIMESTAMP(3),
    "provider_message_id" TEXT,
    "campaign_id" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mailbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailbox_threads" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "snippet" TEXT,
    "message_count" INTEGER NOT NULL DEFAULT 1,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mailbox_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailbox_attachments" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "content_path" TEXT,
    "content_base64" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mailbox_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailbox_drafts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "from_email" TEXT,
    "to_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cc_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bcc_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "scheduled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mailbox_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_lists" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_list_members" (
    "id" TEXT NOT NULL,
    "list_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_list_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppression_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppression_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_mailbox_configs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'IMAP',
    "email" TEXT NOT NULL,
    "host" TEXT,
    "port" INTEGER,
    "username" TEXT,
    "password_enc" TEXT,
    "use_tls" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),
    "sync_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbound_mailbox_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smtp_configs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "from_name" TEXT,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "password_enc" TEXT NOT NULL,
    "use_tls" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smtp_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "message_id" TEXT,
    "recipient" TEXT NOT NULL,
    "event" "DeliveryStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" "AutomationTrigger" NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "actions" JSONB NOT NULL DEFAULT '{}',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_auths" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "spf_record" TEXT,
    "spf_status" TEXT NOT NULL DEFAULT 'PENDING',
    "dkim_selector" TEXT,
    "dkim_record" TEXT,
    "dkim_status" TEXT NOT NULL DEFAULT 'PENDING',
    "dmarc_record" TEXT,
    "dmarc_status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domain_auths_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_metrics" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "cost_estimate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_workflow_rules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger_type" TEXT NOT NULL DEFAULT 'INBOUND_EMAIL',
    "system_prompt" TEXT NOT NULL,
    "model" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_workflow_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "upi_payments_user_id_idx" ON "upi_payments"("user_id");

-- CreateIndex
CREATE INDEX "upi_payments_utr_idx" ON "upi_payments"("utr");

-- CreateIndex
CREATE INDEX "mailbox_messages_user_id_folder_received_at_idx" ON "mailbox_messages"("user_id", "folder", "received_at");

-- CreateIndex
CREATE INDEX "mailbox_messages_user_id_is_read_idx" ON "mailbox_messages"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "mailbox_messages_user_id_is_starred_idx" ON "mailbox_messages"("user_id", "is_starred");

-- CreateIndex
CREATE INDEX "mailbox_messages_thread_id_idx" ON "mailbox_messages"("thread_id");

-- CreateIndex
CREATE INDEX "mailbox_threads_user_id_last_message_at_idx" ON "mailbox_threads"("user_id", "last_message_at");

-- CreateIndex
CREATE INDEX "mailbox_attachments_message_id_idx" ON "mailbox_attachments"("message_id");

-- CreateIndex
CREATE INDEX "mailbox_drafts_user_id_updated_at_idx" ON "mailbox_drafts"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "contact_lists_user_id_idx" ON "contact_lists"("user_id");

-- CreateIndex
CREATE INDEX "contact_list_members_list_id_idx" ON "contact_list_members"("list_id");

-- CreateIndex
CREATE INDEX "contact_list_members_contact_id_idx" ON "contact_list_members"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_list_members_list_id_contact_id_key" ON "contact_list_members"("list_id", "contact_id");

-- CreateIndex
CREATE INDEX "suppression_records_email_idx" ON "suppression_records"("email");

-- CreateIndex
CREATE UNIQUE INDEX "suppression_records_user_id_email_key" ON "suppression_records"("user_id", "email");

-- CreateIndex
CREATE INDEX "inbound_mailbox_configs_user_id_idx" ON "inbound_mailbox_configs"("user_id");

-- CreateIndex
CREATE INDEX "smtp_configs_user_id_idx" ON "smtp_configs"("user_id");

-- CreateIndex
CREATE INDEX "delivery_events_user_id_created_at_idx" ON "delivery_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "delivery_events_recipient_idx" ON "delivery_events"("recipient");

-- CreateIndex
CREATE INDEX "automation_rules_user_id_idx" ON "automation_rules"("user_id");

-- CreateIndex
CREATE INDEX "domain_auths_user_id_idx" ON "domain_auths"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "domain_auths_user_id_domain_key" ON "domain_auths"("user_id", "domain");

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

-- CreateIndex
CREATE INDEX "webhook_endpoints_user_id_idx" ON "webhook_endpoints"("user_id");

-- CreateIndex
CREATE INDEX "security_audit_logs_user_id_created_at_idx" ON "security_audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "usage_metrics_user_id_date_idx" ON "usage_metrics"("user_id", "date");

-- CreateIndex
CREATE INDEX "ai_workflow_rules_user_id_idx" ON "ai_workflow_rules"("user_id");

-- AddForeignKey
ALTER TABLE "upi_payments" ADD CONSTRAINT "upi_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailbox_messages" ADD CONSTRAINT "mailbox_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailbox_messages" ADD CONSTRAINT "mailbox_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "mailbox_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailbox_threads" ADD CONSTRAINT "mailbox_threads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailbox_attachments" ADD CONSTRAINT "mailbox_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "mailbox_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailbox_drafts" ADD CONSTRAINT "mailbox_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_lists" ADD CONSTRAINT "contact_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_list_members" ADD CONSTRAINT "contact_list_members_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "contact_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_list_members" ADD CONSTRAINT "contact_list_members_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppression_records" ADD CONSTRAINT "suppression_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_mailbox_configs" ADD CONSTRAINT "inbound_mailbox_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smtp_configs" ADD CONSTRAINT "smtp_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_auths" ADD CONSTRAINT "domain_auths_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_audit_logs" ADD CONSTRAINT "security_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_metrics" ADD CONSTRAINT "usage_metrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_workflow_rules" ADD CONSTRAINT "ai_workflow_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

