import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { SenderProfiles } from "@/components/bulk/sender-profiles";
import { EmailAccountCard } from "@/components/dashboard/email-account-card";
import { ProviderSettingsCard } from "@/components/dashboard/provider-settings-card";
import { GroqKeyCard } from "@/components/dashboard/groq-key-card";
import { UpiSettingsCard } from "@/components/dashboard/upi-settings-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Kbd, LoadingState, PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { publicAccount } from "@/lib/email";
import { configChecks, env } from "@/lib/env";
import { getActiveEmailAccount, getProviderSettings } from "@/lib/services/providers";
import { getGroqStatus } from "@/lib/services/groq-settings";
import { formatDuration } from "@/lib/utils";
import { UserBillingCard } from "@/components/dashboard/user-billing-card";

export const metadata: Metadata = { title: "Settings" };

function Section({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const e = env();
  const checks = configChecks();
  const settings = await getProviderSettings(user.id);
  const account = publicAccount(await getActiveEmailAccount(user.id, settings.email));
  const googleConfigured = Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET && e.GOOGLE_REDIRECT_URI);
  const required = checks.filter((c) => !c.optional);
  const missing = required.filter((c) => !c.ok).length;
  const groqStatus = getGroqStatus();

  const sections = [
    { id: "providers", label: "Providers" },
    { id: "groq-key", label: "Groq API key" },
    ...(user.isAdmin
      ? [{ id: "upi-payments", label: "UPI & Pricing (Admin)" }]
      : [{ id: "billing", label: "Credits & Payment" }]),
    { id: "sending-account", label: "Sending account" },
    { id: "sender-profiles", label: "Sender profiles" },
    { id: "ai", label: "AI model" },
    { id: "limits", label: "Sending limits" },
    { id: "checks", label: "Configuration" },
    { id: "appearance", label: "Appearance" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Connect your AI providers and the Gmail account Sorts sends from, manage sender signatures and check configuration."
        status={missing ? <Badge tone="warning">{missing} setup items missing</Badge> : <Badge tone="success">Setup complete</Badge>}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="-mt-2 flex gap-1 overflow-x-auto pb-1 lg:sticky lg:top-[calc(var(--topbar-h)+1.5rem)] lg:mt-0 lg:flex-col lg:self-start lg:overflow-visible lg:border-l lg:border-line lg:pb-0">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="type-nav shrink-0 rounded-md px-2.5 py-1.5 text-muted transition-colors hover:bg-panel-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 lg:-ml-px lg:rounded-none lg:rounded-r-md lg:border-l lg:border-transparent lg:px-3 lg:py-2 lg:hover:border-accent"
            >
              {s.label}
            </a>
          ))}
        </nav>
        <div className="min-w-0 max-w-3xl space-y-5">
          <Section id="providers">
            <ProviderSettingsCard ai={settings.ai} email={settings.email} mockAllowed={settings.mockAllowed} />
          </Section>
          <Section id="groq-key">
            <GroqKeyCard initialStatus={groqStatus} />
          </Section>
          {user.isAdmin ? (
            <Section id="upi-payments">
              <UpiSettingsCard />
            </Section>
          ) : (
            <Section id="billing">
              <UserBillingCard />
            </Section>
          )}
          <Section id="sending-account">
            <Suspense fallback={<LoadingState variant="form" message="Loading sending account" />}>
              <EmailAccountCard account={account} providerMode={settings.email} googleConfigured={googleConfigured} />
            </Suspense>
          </Section>
          <Section id="sender-profiles">
            <Card>
              <CardHeader
                title="Sender profiles"
                description="The signature added below every email: name, designation, company, phone, email and website. The default profile is preselected for new campaigns."
              />
              <CardBody>
                <SenderProfiles />
              </CardBody>
            </Card>
          </Section>
          <Section id="ai">
            <Card>
              <CardHeader title="AI model" description="Used to adjust each email for its contact." />
              <CardBody className="space-y-3 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-muted">Primary model</span>
                  <Kbd>{settings.ai === "mock" ? "Test mode (no AI)" : settings.ai === "groq" ? e.GROQ_MODEL : e.OPENROUTER_MODEL}</Kbd>
                  {e.GROQ_API_KEY && (
                    <>
                      <span className="text-muted">· Fast fallback</span>
                      <Kbd>{e.GROQ_MODEL}</Kbd>
                    </>
                  )}
                </p>
                <dl className="grid grid-cols-3 gap-3">
                  <Stat label="Parallel requests" value={e.AI_CONCURRENCY} />
                  <Stat label="Retries" value={e.AI_MAX_RETRIES} />
                  <Stat label="Timeout" value={formatDuration(e.AI_TIMEOUT_MS)} />
                </dl>
                <p className="type-hint text-muted">
                  Every generated email is checked for the correct contact name and company, leftover placeholders, the signature and other recipients&apos; details before you can review
                  it. If OpenRouter balance is exhausted, Sorts automatically switches to Groq without pausing generation.
                </p>
              </CardBody>
            </Card>
          </Section>
          <Section id="limits">
            <Card>
              <CardHeader title="Sending limits" description="Start time and interval between emails are chosen per campaign when you send it." />
              <CardBody>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Stat label="Emails per sending batch" value={e.EMAIL_BATCH_SIZE} hint="EMAIL_BATCH_SIZE · only emails that are due are sent" />
                  <Stat label="Automatic retries" value={e.MAX_EMAIL_RETRIES} hint="MAX_EMAIL_RETRIES" />
                </dl>
              </CardBody>
            </Card>
          </Section>
          <Section id="checks">
            <Card>
              <CardHeader
                status={missing ? { tone: "warning", label: `${missing} need attention` } : { tone: "success", label: "Everything is configured" }}
                title="Server configuration"
                description="Read from the server's environment variables."
                actions={
                  <span className="type-data text-muted">
                    {required.length - missing}/{required.length}
                  </span>
                }
              />
              <CardBody className="p-0">
                <ul className="divide-y divide-line">
                  {checks.map((c) => (
                    <li key={c.key} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span aria-hidden className={`led mt-1.5 ${c.ok ? "text-success" : c.optional ? "text-subtle" : "led-live text-danger"}`} />
                        <div className="min-w-0">
                          <p className="text-sm text-fg">{c.label}</p>
                          <p className="type-hint truncate font-mono text-subtle" title={c.hint}>
                            {c.hint}
                          </p>
                        </div>
                      </div>
                      <Badge tone={c.ok ? "success" : c.optional ? "neutral" : "danger"}>{c.ok ? "Configured" : c.optional ? "Not configured" : "Missing"}</Badge>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </Section>
          <Section id="appearance">
            <Card>
              <CardHeader title="Appearance" description="Sorts follows your system theme by default. Your choice is saved in this browser." />
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <span className="type-body-sm text-muted">Colour theme</span>
                <ThemeSwitcher />
              </CardBody>
            </Card>
          </Section>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel-2 p-3">
      <dt className="type-caption text-muted">{label}</dt>
      <dd className="type-h3 mt-1 text-fg">{value}</dd>
      {hint && <dd className="type-hint mt-0.5 break-words font-mono text-subtle">{hint}</dd>}
    </div>
  );
}
