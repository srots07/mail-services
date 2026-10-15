-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "cc_emails" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "campaign_templates" ADD COLUMN     "cc_emails" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "email_sends" ADD COLUMN     "cc_emails" TEXT[] DEFAULT ARRAY[]::TEXT[];
