-- CreateEnum
CREATE TYPE "EmailSource" AS ENUM ('CSV', 'WEBSITE', 'MANUAL', 'NOT_FOUND');

-- CreateEnum
CREATE TYPE "SubjectMode" AS ENUM ('FIXED', 'AI');

-- AlterEnum
ALTER TYPE "CampaignKind" ADD VALUE 'BULK';

-- AlterTable
ALTER TABLE "campaign_contacts" ADD COLUMN     "discovered_email" TEXT,
ADD COLUMN     "email_approved_at" TIMESTAMP(3),
ADD COLUMN     "email_source" "EmailSource",
ADD COLUMN     "email_source_url" TEXT,
ADD COLUMN     "research_company_id" TEXT;

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "ai_instructions" TEXT,
ADD COLUMN     "ai_personalization" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bulk_body" TEXT,
ADD COLUMN     "product_line_fallback" TEXT,
ADD COLUMN     "schedule_timezone" TEXT,
ADD COLUMN     "sender_profile_id" TEXT,
ADD COLUMN     "sender_snapshot" JSONB,
ADD COLUMN     "subject_mode" "SubjectMode",
ADD COLUMN     "subject_template" TEXT,
ADD COLUMN     "template_id" TEXT;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "campaign_only" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "company_website" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "sender_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sender_name" TEXT NOT NULL,
    "designation" TEXT,
    "company_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sender_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_templates" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "subject_mode" "SubjectMode" NOT NULL DEFAULT 'FIXED',
    "subject_template" TEXT,
    "sender_profile_id" TEXT,
    "ai_personalization" BOOLEAN NOT NULL DEFAULT false,
    "ai_instructions" TEXT,
    "product_line_fallback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sender_profiles_user_id_idx" ON "sender_profiles"("user_id");

-- CreateIndex
CREATE INDEX "campaign_templates_user_id_idx" ON "campaign_templates"("user_id");

-- CreateIndex
CREATE INDEX "campaign_contacts_research_company_id_idx" ON "campaign_contacts"("research_company_id");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_sender_profile_id_fkey" FOREIGN KEY ("sender_profile_id") REFERENCES "sender_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "campaign_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_research_company_id_fkey" FOREIGN KEY ("research_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sender_profiles" ADD CONSTRAINT "sender_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_templates" ADD CONSTRAINT "campaign_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_templates" ADD CONSTRAINT "campaign_templates_sender_profile_id_fkey" FOREIGN KEY ("sender_profile_id") REFERENCES "sender_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
