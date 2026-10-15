import type { Metadata } from "next";
import { BulkStepper } from "@/components/bulk/bulk-stepper";
import { BulkUpload } from "@/components/bulk/bulk-upload";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "New campaign" };

export default function NewCampaignPage() {
  return (
    <>
      <PageHeader
        eyebrow="New campaign · Step 1 of 7"
        title="Upload your contacts"
        description="One Excel, CSV or PDF file with company name, contact name, from name and email. Next you add the mail body and sender, Sorts drafts one email per contact, and nothing is sent until you approve it."
      />
      <BulkStepper campaignId={null} />
      <BulkUpload />
    </>
  );
}
