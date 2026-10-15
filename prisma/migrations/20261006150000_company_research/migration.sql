-- CreateEnum
CREATE TYPE "CampaignKind" AS ENUM ('STANDARD', 'COMPANY');

-- CreateEnum
CREATE TYPE "ResearchProviderChoice" AS ENUM ('LIVE', 'MOCK');

-- CreateEnum
CREATE TYPE "ResearchStatus" AS ENUM ('NOT_STARTED', 'SEARCHING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "ContactDiscoveryStatus" AS ENUM ('NOT_FOUND', 'FOUND', 'VERIFIED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('FOUND', 'NOT_FOUND');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('OFFICIAL', 'GOVERNMENT', 'THIRD_PARTY', 'USER_SUPPLIED');

-- CreateEnum
CREATE TYPE "ContactOrigin" AS ENUM ('IMPORTED', 'DISCOVERED');

-- AlterEnum
ALTER TYPE "LogCategory" ADD VALUE 'RESEARCH';

-- AlterTable
ALTER TABLE "campaign_contacts" ADD COLUMN     "company_id" TEXT,
ADD COLUMN     "email_draft_id" TEXT;

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "kind" "CampaignKind" NOT NULL DEFAULT 'STANDARD';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "research_provider" "ResearchProviderChoice";

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "import_batch_id" TEXT,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "description" TEXT,
    "contact_name" TEXT,
    "known_email" TEXT,
    "subject" TEXT,
    "notes" TEXT,
    "original_body" TEXT NOT NULL,
    "original_row" JSONB NOT NULL,
    "research_status" "ResearchStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "contract_status" "ContractStatus",
    "contact_status" "ContactDiscoveryStatus",
    "research_queued" BOOLEAN NOT NULL DEFAULT false,
    "locked_at" TIMESTAMP(3),
    "research_error" TEXT,
    "researched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_research" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "status" "ResearchStatus" NOT NULL,
    "industry" TEXT,
    "summary" TEXT,
    "relevant_department" TEXT,
    "procurement_info" TEXT,
    "vendor_requirements" TEXT,
    "summary_sources" JSONB,
    "model" TEXT,
    "researched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_research_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_sources" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "source_type" "SourceType" NOT NULL,
    "http_status" INTEGER,
    "robots_allowed" BOOLEAN NOT NULL DEFAULT true,
    "excerpt" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reference" TEXT,
    "department" TEXT,
    "publication_date" TEXT,
    "closing_date" TEXT,
    "requirement_summary" TEXT,
    "status" TEXT,
    "source_url" TEXT NOT NULL,
    "source_title" TEXT,
    "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_contacts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "contact_name" TEXT,
    "department" TEXT,
    "email_type" TEXT NOT NULL,
    "source_url" TEXT,
    "source_title" TEXT,
    "source_type" "SourceType" NOT NULL,
    "confidence" "EmailConfidence" NOT NULL,
    "status" "ContactDiscoveryStatus" NOT NULL,
    "origin" "ContactOrigin" NOT NULL,
    "is_selected" BOOLEAN NOT NULL DEFAULT false,
    "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMP(3),
    "user_approved_at" TIMESTAMP(3),

    CONSTRAINT "company_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_drafts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "contract_id" TEXT,
    "original_body" TEXT NOT NULL,
    "generated_subject" TEXT,
    "generated_body" TEXT,
    "edited_by_user" BOOLEAN NOT NULL DEFAULT false,
    "status" "DraftStatus" NOT NULL DEFAULT 'DRAFT',
    "error" TEXT,
    "model" TEXT,
    "campaign_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_logs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "source_url" TEXT,
    "result" TEXT NOT NULL,
    "blocked_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "companies_user_id_created_at_idx" ON "companies"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "companies_research_queued_research_status_idx" ON "companies"("research_queued", "research_status");

-- CreateIndex
CREATE UNIQUE INDEX "company_research_company_id_key" ON "company_research"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_sources_company_id_url_key" ON "company_sources"("company_id", "url");

-- CreateIndex
CREATE INDEX "contracts_company_id_idx" ON "contracts"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_contacts_company_id_email_key" ON "company_contacts"("company_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "email_drafts_company_id_key" ON "email_drafts"("company_id");

-- CreateIndex
CREATE INDEX "research_logs_company_id_created_at_idx" ON "research_logs"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "campaign_contacts_company_id_idx" ON "campaign_contacts"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_contacts_campaign_id_company_id_key" ON "campaign_contacts"("campaign_id", "company_id");

-- AddForeignKey
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_email_draft_id_fkey" FOREIGN KEY ("email_draft_id") REFERENCES "email_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_research" ADD CONSTRAINT "company_research_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_sources" ADD CONSTRAINT "company_sources_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "company_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_logs" ADD CONSTRAINT "research_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
