-- AlterTable
ALTER TABLE "company_contacts" ADD COLUMN     "rejected_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "company_email_body" TEXT,
ADD COLUMN     "company_email_body_updated_at" TIMESTAMP(3);
