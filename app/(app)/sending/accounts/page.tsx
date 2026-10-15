import type { Metadata } from "next";
import { Suspense } from "react";
import { Send, Mail, ShieldCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { LoadingState, PageHeader } from "@/components/ui/misc";
import { EmailAccountCard } from "@/components/dashboard/email-account-card";
import { ProviderSettingsCard } from "@/components/dashboard/provider-settings-card";
import { QuickTestSend } from "@/components/dashboard/quick-test-send";
import { requireUser } from "@/lib/auth/session";
import { publicAccount } from "@/lib/email";
import { env } from "@/lib/env";
import { getActiveEmailAccount, getProviderSettings } from "@/lib/services/providers";

export const metadata: Metadata = { title: "Sending Accounts" };

export default async function SendingAccountsPage() {
  const user = await requireUser();
  const e = env();
  const settings = await getProviderSettings(user.id);
  const rawAccount = await getActiveEmailAccount(user.id, settings.email);
  const account = publicAccount(rawAccount);
  const googleConfigured = Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET && e.GOOGLE_REDIRECT_URI);

  return (
    <>
      <PageHeader
        eyebrow="Delivery Engine"
        title="Sending Accounts"
        description="Connect and configure your outgoing email sending mailboxes via Direct SMTP (Gmail App Password, Outlook, Zoho, SendGrid) or Google Cloud OAuth."
        actions={
          <ButtonLink href="/sending" variant="outline" size="sm">
            <Send className="h-4 w-4 mr-1.5" />
            View Delivery & Sent Logs
          </ButtonLink>
        }
      />

      <div className="space-y-6 max-w-4xl">
        {/* Sending Provider Mode Selector */}
        <ProviderSettingsCard
          ai={settings.ai}
          email={settings.email}
          mockAllowed={settings.mockAllowed}
        />

        {/* Sending Mailbox Account Configuration */}
        <Suspense fallback={<LoadingState variant="form" message="Loading sending account" />}>
          <EmailAccountCard
            account={account}
            providerMode={settings.email}
            googleConfigured={googleConfigured}
          />
        </Suspense>

        {/* Live Quick Test Send Tool */}
        <QuickTestSend defaultSenderEmail={account?.email ?? ""} />
      </div>
    </>
  );
}
