import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, Clock, Mail, Send, ExternalLink, ShieldCheck, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { QuickTestSend } from "@/components/dashboard/quick-test-send";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/database/prisma";
import { publicAccount } from "@/lib/email";
import { getActiveEmailAccount, getProviderSettings } from "@/lib/services/providers";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Sending & Delivery Engine" };

export default async function SendingPage() {
  const user = await requireUser();
  const settings = await getProviderSettings(user.id);
  const rawAccount = await getActiveEmailAccount(user.id, settings.email);
  const account = publicAccount(rawAccount);

  const userCampaigns = await db().campaign.findMany({
    where: { userId: user.id },
    select: { id: true },
  });
  const campaignIds = userCampaigns.map((c) => c.id);

  const [sentCount, failedCount, queuedCount, recentSends] = await Promise.all([
    campaignIds.length ? db().emailSend.count({ where: { campaignId: { in: campaignIds }, status: "SENT" } }) : 0,
    campaignIds.length ? db().emailSend.count({ where: { campaignId: { in: campaignIds }, status: "FAILED" } }) : 0,
    campaignIds.length
      ? db().campaignContact.count({
          where: { campaignId: { in: campaignIds }, status: { in: ["SCHEDULED", "SENDING", "APPROVED"] } },
        })
      : 0,
    campaignIds.length
      ? db().emailSend.findMany({
          where: { campaignId: { in: campaignIds } },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true,
            toEmail: true,
            fromEmail: true,
            subject: true,
            provider: true,
            status: true,
            sentAt: true,
            createdAt: true,
            errorMessage: true,
            campaign: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })
      : [],
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Delivery Engine"
        title="Sending & Delivery"
        description="Monitor real-time mail dispatch, active sending engine accounts, delivery metrics, and run test sends."
        actions={
          <ButtonLink href="/settings#sending-account" variant="outline" size="sm">
            <Mail className="h-4 w-4 mr-1.5" />
            Configure Accounts
          </ButtonLink>
        }
      />

      <div className="space-y-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-line bg-panel p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="type-caption text-muted">Sent Successfully</span>
              <CheckCircle2 className="h-4 w-4 text-success" />
            </div>
            <p className="text-2xl font-bold text-fg mt-2">{sentCount}</p>
            <p className="type-hint text-subtle mt-1">Delivered outreach emails</p>
          </div>

          <div className="rounded-xl border border-line bg-panel p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="type-caption text-muted">In Queue / Sending</span>
              <Clock className="h-4 w-4 text-accent" />
            </div>
            <p className="text-2xl font-bold text-fg mt-2">{queuedCount}</p>
            <p className="type-hint text-subtle mt-1">Scheduled or awaiting turn</p>
          </div>

          <div className="rounded-xl border border-line bg-panel p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="type-caption text-muted">Failed / Bounced</span>
              <AlertTriangle className="h-4 w-4 text-danger" />
            </div>
            <p className="text-2xl font-bold text-fg mt-2">{failedCount}</p>
            <p className="type-hint text-subtle mt-1">Delivery errors or bounces</p>
          </div>

          <div className="rounded-xl border border-line bg-panel p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="type-caption text-muted">Active Engine</span>
              <Server className="h-4 w-4 text-muted" />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge tone={settings.email === "smtp" ? "accent" : settings.email === "gmail" ? "success" : "neutral"}>
                {settings.email === "smtp" ? "Direct SMTP" : settings.email === "gmail" ? "Gmail API" : "Test Mode"}
              </Badge>
            </div>
            <p className="type-hint text-subtle mt-1 truncate">
              {account ? account.email : "No account connected"}
            </p>
          </div>
        </div>

        {/* Quick Test Send Component */}
        <QuickTestSend />

        {/* Active Sending Account Card */}
        <Card>
          <CardHeader
            title="Connected Sending Mailbox"
            description="The mailbox Sorts uses to dispatch outgoing cold emails and automated sequences."
            actions={
              <ButtonLink href="/settings#sending-account" variant="outline" size="sm">
                <span>Manage in Settings</span>
                <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
              </ButtonLink>
            }
          />
          <CardBody>
            {account ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-line-strong bg-panel-2 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-panel border border-line text-accent">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-fg">{account.email}</span>
                      <Badge tone="success" dot>
                        Connected
                      </Badge>
                    </div>
                    <p className="type-caption text-muted mt-0.5">
                      Provider: <span className="font-medium text-fg uppercase">{account.provider}</span> · Label: {account.label || "Primary"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="type-caption text-muted flex items-center gap-1">
                    <ShieldCheck className="h-4 w-4 text-success" /> Verified & Ready
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-line bg-panel-2 p-4 text-center space-y-2">
                <p className="text-sm font-medium text-fg">No sending account connected yet</p>
                <p className="type-caption text-muted">
                  Connect your SMTP account (e.g. Gmail App Password, Zoho, SendGrid) or Google Cloud OAuth to start sending.
                </p>
                <div className="pt-1">
                  <ButtonLink href="/settings#sending-account" variant="primary" size="sm">
                    Connect Sending Account
                  </ButtonLink>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Sent Emails Activity Log Table */}
        <Card>
          <CardHeader
            title="Recent Sent Emails & Logs"
            description="Detailed records of individual outgoing messages, timestamps, and provider receipts."
            actions={
              <span className="type-caption text-muted">
                Showing last {recentSends.length} events
              </span>
            }
          />
          <CardBody className="p-0">
            {!recentSends.length ? (
              <div className="p-6 text-center text-muted type-hint">
                No outgoing emails have been sent yet. Run a campaign or send a quick test email above.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-panel-2 border-b border-line text-muted font-medium">
                    <tr>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Recipient</th>
                      <th className="px-4 py-3">Subject</th>
                      <th className="px-4 py-3">Campaign</th>
                      <th className="px-4 py-3">Provider</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {recentSends.map((log) => (
                      <tr key={log.id} className="hover:bg-panel-2/50 transition-colors">
                        <td className="px-4 py-3 text-muted whitespace-nowrap">
                          {formatDate(log.sentAt || log.createdAt)}
                        </td>
                        <td className="px-4 py-3 font-mono font-medium text-fg">
                          {log.toEmail}
                        </td>
                        <td className="px-4 py-3 text-fg font-medium truncate max-w-[14rem]" title={log.subject}>
                          {log.subject}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {log.campaign ? (
                            <Link href={`/campaigns/${log.campaign.id}`} className="hover:text-accent hover:underline">
                              {log.campaign.name}
                            </Link>
                          ) : (
                            <span className="text-subtle">Direct</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted uppercase font-mono text-[11px]">
                          {log.provider}
                        </td>
                        <td className="px-4 py-3">
                          {log.status === "SENT" ? (
                            <Badge tone="success" dot>
                              Delivered
                            </Badge>
                          ) : log.status === "FAILED" ? (
                            <Badge tone="danger" dot title={log.errorMessage || "Failed"}>
                              Failed
                            </Badge>
                          ) : (
                            <Badge tone="accent" dot>
                              {log.status}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
