import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, Mail, Plus, Sparkles, UserRound } from "lucide-react";
import { Badge, StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SortsAmbient } from "@/components/sorts/ambient";
import { Pipeline } from "@/components/sorts/pipeline";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { BarSeries } from "@/components/ui/chart";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { SegmentedProgress } from "@/components/ui/progress";
import { requireUser } from "@/lib/auth/session";
import { needsAttention } from "@/lib/campaign-status";
import { db } from "@/lib/database/prisma";
import { getActiveEmailAccount, getProviderSettings } from "@/lib/services/providers";
import { getDefaultProfile } from "@/lib/services/sender-profiles";
import { cn, formatDateTime } from "@/lib/utils";

const DAYS = 14;
const ACTIVE = new Set(["GENERATING", "SCHEDULED", "RUNNING", "READY_FOR_REVIEW", "PAUSED", "DRAFT"]);
const LEVEL_TONE: Record<string, BadgeTone> = { INFO: "neutral", WARN: "warning", ERROR: "danger" };

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (DAYS - 1));

  const [settings, profile, campaigns, sends, activity] = await Promise.all([
    getProviderSettings(user.id),
    getDefaultProfile(user.id),
    db().campaign.findMany({
      where: { userId: user.id, kind: "BULK" },
      orderBy: { updatedAt: "desc" },
      take: 500,
      select: { id: true, campaignName: true, status: true, totalContacts: true, generatedCount: true, approvedCount: true, sentCount: true, failedCount: true, updatedAt: true },
    }),
    db().emailSend.findMany({
      where: { kind: "CAMPAIGN", campaign: { userId: user.id }, createdAt: { gte: since } },
      select: { status: true, sentAt: true, createdAt: true },
    }),
    db().activityLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, level: true, category: true, message: true, createdAt: true, campaignId: true, campaign: { select: { campaignName: true } } },
    }),
  ]);
  const account = await getActiveEmailAccount(user.id, settings.email);

  const totals = campaigns.reduce(
    (t, c) => ({
      contacts: t.contacts + c.totalContacts,
      generated: t.generated + c.generatedCount,
      approved: t.approved + c.approvedCount,
      sent: t.sent + c.sentCount,
      failed: t.failed + c.failedCount,
    }),
    { contacts: 0, generated: 0, approved: 0, sent: 0, failed: 0 },
  );

  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    return { key: dayKey(d), label: d.toLocaleDateString("en", { month: "short", day: "numeric" }), sent: 0, failed: 0 };
  });
  const byKey = new Map(days.map((d) => [d.key, d]));
  for (const s of sends) {
    const bucket = byKey.get(dayKey(s.sentAt ?? s.createdAt));
    if (!bucket) continue;
    if (s.status === "SENT") bucket.sent++;
    else if (s.status === "FAILED") bucket.failed++;
  }
  const sent14 = days.reduce((sum, d) => sum + d.sent, 0);

  const setup = [
    {
      key: "gmail",
      done: Boolean(account) && settings.email !== "mock",
      icon: Mail,
      title: account ? (settings.email === "mock" ? "Test sender connected" : `Sending from ${account.email}`) : "Connect your Gmail account",
      hint: account && settings.email !== "mock" ? "Emails go out from this account." : "Needed before any email can be sent.",
      href: "/settings#sending-account",
      cta: account ? "Manage" : "Connect Gmail",
    },
    {
      key: "profile",
      done: Boolean(profile),
      icon: UserRound,
      title: profile ? `Signing as ${profile.senderName}` : "Add your sender profile",
      hint: profile ? "Fills [Your Name], [Phone] and the rest of your signature." : "Fills your name and signature in every email.",
      href: "/settings#sender-profiles",
      cta: profile ? "Edit" : "Add profile",
    },
    {
      key: "ai",
      done: settings.ai !== "mock",
      icon: Sparkles,
      title: settings.ai === "mock" ? "AI is in test mode" : "AI personalisation is live",
      hint: settings.ai === "mock" ? "Emails are simulated until a real AI provider is enabled." : "Each email is adjusted for its recipient.",
      href: "/settings#ai",
      cta: settings.ai === "mock" ? "Set up AI" : "Settings",
    },
  ];
  const setupDone = setup.every((s) => s.done);

  const attention = campaigns.filter(needsAttention).slice(0, 6);
  const active = campaigns.filter((c) => ACTIVE.has(c.status)).slice(0, 5);

  const next = !setup[0].done
    ? { title: "Connect Gmail to start sending", href: setup[0].href, cta: "Connect Gmail" }
    : !setup[1].done
      ? { title: "Add your sender profile", href: setup[1].href, cta: "Add profile" }
      : attention[0]
        ? { title: `Continue “${attention[0].campaignName}”`, href: `/campaigns/${attention[0].id}`, cta: "Open campaign" }
        : campaigns.length === 0
          ? { title: "Upload your first contact list", href: "/campaigns/new", cta: "Start a campaign" }
          : { title: "Start another campaign", href: "/campaigns/new", cta: "New campaign" };

  const firstName = user.name?.split(" ")[0];
  const summary = [
    attention.length ? `${attention.length} ${attention.length === 1 ? "campaign needs" : "campaigns need"} a decision` : "Nothing is waiting on you",
    `${sent14.toLocaleString()} ${sent14 === 1 ? "email" : "emails"} sent in the last ${DAYS} days`,
  ].join(" · ");
  const share = (n: number) => (totals.contacts > 0 ? n / totals.contacts : 0);

  return (
    <>
      <PageHeader
        eyebrow={firstName ? `Overview · ${firstName}` : "Overview"}
        title="Outreach at a glance"
        description={summary}
        status={<Badge tone={setupDone ? "success" : "warning"} dot>{setupDone ? "Ready to send" : "Setup incomplete"}</Badge>}
        actions={
          <>
            <ButtonLink href="/campaigns">View campaigns</ButtonLink>
            <ButtonLink href="/campaigns/new" variant="primary">
              <Plus aria-hidden />
              New campaign
            </ButtonLink>
          </>
        }
      />

      <div className="space-y-6">
        {/* Next action + readiness: the first thing to read. */}
        <section aria-labelledby="next-step">
          <Card variant="brand" className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <div className="relative overflow-hidden border-b border-line lg:border-b-0 lg:border-r">
              <SortsAmbient />
              <CardBody className="flex h-full flex-col justify-between gap-6 py-6">
                <div>
                  <p className="type-mono-label text-accent-strong">Next step</p>
                  <h2 id="next-step" className="type-h2 mt-2 text-fg">
                    {next.title}
                  </h2>
                  <p className="type-caption mt-1.5 text-muted">Sorts picks this from your setup and the campaigns waiting on you.</p>
                </div>
                <ButtonLink href={next.href} variant="primary" className="self-start">
                  {next.cta}
                  <ArrowRight aria-hidden />
                </ButtonLink>
              </CardBody>
            </div>
            <div>
              <p className="type-mono-label flex items-center justify-between border-b border-line px-4 py-2.5 text-subtle">
                <span>Sending readiness</span>
                <span className={setupDone ? "text-success" : "text-warning"}>
                  {setup.filter((s) => s.done).length}/{setup.length} ready
                </span>
              </p>
              <ul className="divide-y divide-line" aria-label="Setup">
              {setup.map((s) => (
                <li key={s.key} className="flex items-center gap-3 px-4 py-3">
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md border", s.done ? "border-success/30 bg-success-soft text-success" : "border-warning/30 bg-warning-soft text-warning")}>
                    {s.done ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <CircleDashed className="h-4 w-4" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg [overflow-wrap:anywhere] sm:truncate">
                      {s.title}
                      <span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
                    </p>
                    <p className="type-caption text-muted sm:truncate">{s.hint}</p>
                  </div>
                  <ButtonLink href={s.href} size="sm" variant={s.done ? "ghost" : "secondary"}>
                    {s.cta}
                  </ButtonLink>
                </li>
              ))}
              </ul>
            </div>
          </Card>
        </section>

        {attention.length > 0 && (
          <section aria-labelledby="attention">
            <Card variant="alert">
              <div className="flex items-center gap-2 border-b border-warning/20 px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
                <h2 id="attention" className="type-h3 text-fg">
                  Needs your attention
                </h2>
                <span className="type-data text-warning">{attention.length}</span>
              </div>
              <ul className="divide-y divide-warning/15">
                {attention.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{c.campaignName}</p>
                      <p className="type-caption text-muted">
                        {c.status === "READY_FOR_REVIEW"
                          ? `${Math.max(0, c.generatedCount - c.approvedCount)} emails are waiting for your review`
                          : c.status === "PAUSED"
                            ? "Sending is paused"
                            : `${c.failedCount} ${c.failedCount === 1 ? "email" : "emails"} failed to send`}
                      </p>
                    </div>
                    <StatusBadge status={c.status} />
                    <ButtonLink href={`/campaigns/${c.id}`} size="sm" variant="secondary">
                      {c.status === "READY_FOR_REVIEW" ? "Review emails" : c.status === "PAUSED" ? "Resume sending" : "See failures"}
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}

        <section aria-labelledby="pipeline-title">
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="pipeline-title" className="type-h3 text-fg">
              Pipeline
            </h2>
            <p className="type-caption text-subtle">
              All {campaigns.length} {campaigns.length === 1 ? "campaign" : "campaigns"}, from uploaded contacts to delivered emails
            </p>
          </div>
          <Pipeline
            label="Emails across all campaigns, by stage"
            stages={[
              { key: "contacts", label: "Contacts", value: totals.contacts, hint: "Uploaded rows", tone: "neutral", share: totals.contacts ? 1 : 0 },
              { key: "generated", label: "AI drafted", value: totals.generated, hint: "Personalised by AI", tone: "violet", share: share(totals.generated) },
              { key: "approved", label: "Approved", value: totals.approved, hint: "Checked by you", tone: "accent", share: share(totals.approved) },
              { key: "sent", label: "Sent", value: totals.sent, hint: "Delivered to contacts", tone: "success", share: share(totals.sent) },
              {
                key: "failed",
                label: "Failed",
                value: totals.failed,
                hint: totals.failed ? "Open the campaign to retry" : "No failures",
                tone: totals.failed ? "danger" : "neutral",
                share: share(totals.failed),
              },
            ]}
          />
        </section>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card variant="chart">
            <CardHeader title="Emails sent" description={`Campaign emails per day, last ${DAYS} days.`} />
            <CardBody>
              <BarSeries
                label={`Campaign emails sent and failed per day over the last ${DAYS} days`}
                data={days.map((d) => ({ label: d.label, values: [d.sent, d.failed] }))}
                series={[
                  { name: "Sent", color: "var(--success)" },
                  { name: "Failed", color: "var(--danger)" },
                ]}
                empty={`No campaign emails sent in the last ${DAYS} days.`}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Campaigns in progress"
              actions={
                <ButtonLink href="/campaigns" size="sm" variant="tertiary">
                  All campaigns
                </ButtonLink>
              }
            />
            {active.length === 0 ? (
              <CardBody>
                <EmptyState
                  compact
                  title="Nothing in progress"
                  description="Campaigns being generated, reviewed or sent show up here."
                  action={
                    <ButtonLink href="/campaigns/new" size="sm" variant="primary">
                      Start a campaign
                    </ButtonLink>
                  }
                />
              </CardBody>
            ) : (
              <ul className="relative z-[1] divide-y divide-line">
                {active.map((c) => (
                  <li key={c.id}>
                    <Link href={`/campaigns/${c.id}`} className="block px-5 py-3 transition-colors hover:bg-panel-2/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60">
                      <div className="flex items-center gap-3">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{c.campaignName}</p>
                        <StatusBadge status={c.status} />
                      </div>
                      <SegmentedProgress
                        className="mt-2"
                        total={Math.max(1, c.totalContacts)}
                        segments={[
                          { value: c.sentCount, className: "bg-success", label: "Sent" },
                          { value: Math.max(0, c.approvedCount - c.sentCount), className: "bg-accent", label: "Approved" },
                          { value: Math.max(0, c.generatedCount - c.approvedCount), className: "bg-violet", label: "Generated" },
                          { value: c.failedCount, className: "bg-danger", label: "Failed" },
                        ]}
                      />
                      <p className="type-data mt-1.5 text-subtle">
                        {c.sentCount}/{c.totalContacts} sent · {c.generatedCount} AI drafted · {c.approvedCount} approved
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader title="Recent activity" description="The latest generation, review and sending events across your campaigns." />
          {activity.length === 0 ? (
            <CardBody>
              <EmptyState compact title="No activity yet" description="Uploads, AI generation and sends are logged here as they happen." />
            </CardBody>
          ) : (
            <ol className="relative z-[1] divide-y divide-line">
              {activity.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-5 py-2.5 text-sm">
                  <time className="type-data w-36 shrink-0 text-subtle" dateTime={a.createdAt.toISOString()}>
                    {formatDateTime(a.createdAt.toISOString())}
                  </time>
                  <Badge tone={LEVEL_TONE[a.level] ?? "neutral"}>{a.category.replace(/_/g, " ").toLowerCase()}</Badge>
                  <span className={cn("min-w-0 flex-1 break-words", a.level === "ERROR" ? "text-danger" : a.level === "WARN" ? "text-warning" : "text-fg")}>
                    {a.message}
                    {a.campaign && a.campaignId && (
                      <>
                        {" · "}
                        <Link href={`/campaigns/${a.campaignId}`} className="text-muted underline-offset-2 hover:text-fg hover:underline">
                          {a.campaign.campaignName}
                        </Link>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}
