"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";
import { formatDate } from "@/lib/utils";
import { Mail, Send, Server, ShieldCheck, CheckCircle2 } from "lucide-react";

interface Account {
  id: string;
  provider: string;
  email: string;
  displayName: string | null;
  connectedAt: string;
}

const SMTP_PRESETS: Record<string, { label: string; host: string; port: number; secure: boolean }> = {
  gmail: { label: "Gmail (App Password)", host: "smtp.gmail.com", port: 465, secure: true },
  outlook: { label: "Microsoft Outlook / Office 365", host: "smtp.office365.com", port: 587, secure: false },
  yahoo: { label: "Yahoo Mail", host: "smtp.mail.yahoo.com", port: 465, secure: true },
  zoho: { label: "Zoho Mail", host: "smtppro.zoho.com", port: 465, secure: true },
  sendgrid: { label: "SendGrid", host: "smtp.sendgrid.net", port: 587, secure: false },
  mailgun: { label: "Mailgun", host: "smtp.mailgun.org", port: 587, secure: false },
  custom: { label: "Custom SMTP Server", host: "", port: 587, secure: false },
};

export function EmailAccountCard({
  account,
  providerMode,
  googleConfigured,
}: {
  account: Account | null;
  providerMode: "gmail" | "mock" | "smtp";
  googleConfigured: boolean;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [smtpOpen, setSmtpOpen] = useState(false);

  // SMTP form state
  const [preset, setPreset] = useState<string>("gmail");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [host, setHost] = useState("smtp.gmail.com");
  const [port, setPort] = useState(465);
  const [secure, setSecure] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [testRecipient, setTestRecipient] = useState("");
  const [testingSend, setTestingSend] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);

  useEffect(() => {
    const oauth = search.get("oauth");
    if (oauth === "connected") toast.success("Gmail connected", "You can now send test emails and campaigns.");
    if (oauth === "error") toast.error("Gmail connection failed", search.get("message") ?? undefined);
    if (oauth) router.replace("/settings");
  }, [search, toast, router]);

  // Load existing SMTP config when modal opens
  useEffect(() => {
    if (smtpOpen) {
      api<{ configured: boolean; smtp: { email: string; displayName: string | null; host: string; port: number; secure: boolean; username: string } | null }>(
        "/api/email-account/smtp",
      )
        .then((res) => {
          if (res.smtp) {
            setFromEmail(res.smtp.email);
            setFromName(res.smtp.displayName ?? "");
            setHost(res.smtp.host);
            setPort(res.smtp.port);
            setSecure(res.smtp.secure);
            setUsername(res.smtp.username);
            setTestRecipient(res.smtp.email);
          }
        })
        .catch(() => undefined);
    }
  }, [smtpOpen]);

  function handlePresetChange(p: string) {
    setPreset(p);
    const chosen = SMTP_PRESETS[p];
    if (chosen) {
      if (chosen.host) setHost(chosen.host);
      setPort(chosen.port);
      setSecure(chosen.secure);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await api("/api/email-account", { method: "DELETE" });
      toast.success("Email account disconnected");
      setDisconnectOpen(false);
      router.refresh();
    } catch (err) {
      toast.error("Could not disconnect", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function connectMock() {
    setBusy(true);
    try {
      await api("/api/email-account/mock", { method: "POST" });
      toast.success("Test sender connected", "Nothing will be delivered.");
      router.refresh();
    } catch (err) {
      toast.error("Could not connect the test sender", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function saveSmtp(e: React.FormEvent) {
    e.preventDefault();
    if (!fromEmail) {
      toast.error("Sending email is required");
      return;
    }
    if (!password) {
      toast.error("Password or App Password is required");
      return;
    }
    setBusy(true);
    try {
      await api("/api/email-account/smtp", {
        method: "POST",
        body: {
          fromEmail,
          fromName,
          host,
          port: Number(port),
          secure,
          username: username || fromEmail,
          password,
          setAsActive: true,
        },
      });
      toast.success("Sending mail connected successfully!", `Sending through ${host}`);
      setSmtpOpen(false);
      router.refresh();
    } catch (err) {
      toast.error("Could not connect sending mail", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function sendTestEmail() {
    if (!testRecipient) {
      toast.error("Please enter a test recipient email address");
      return;
    }
    setTestingSend(true);
    setTestSuccess(false);
    try {
      await api("/api/email-account/smtp/test", {
        method: "POST",
        body: { toEmail: testRecipient },
      });
      setTestSuccess(true);
      toast.success("Test email delivered!", `Sent to ${testRecipient}`);
    } catch (err) {
      toast.error("Test send failed", err instanceof Error ? err.message : undefined);
    } finally {
      setTestingSend(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Sending account"
        description="Emails are sent from your own email account. Choose between direct SMTP (App Password) or Google OAuth."
        actions={
          <Button size="sm" variant="outline" onClick={() => setSmtpOpen(true)}>
            <Server className="mr-1.5 h-3.5 w-3.5" />
            {account?.provider === "SMTP" ? "Edit SMTP Mail" : "Add Direct Sending Mail (SMTP)"}
          </Button>
        }
      />
      <CardBody className="space-y-4">
        {account ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel-2 p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="break-all text-sm font-medium">{account.email}</p>
                <Badge tone={account.provider === "MOCK" ? "warning" : "success"} dot>
                  {account.provider === "MOCK"
                    ? "Test mode"
                    : account.provider === "SMTP"
                      ? "Direct SMTP active"
                      : "Gmail connected"}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {account.displayName ? `${account.displayName} · ` : ""}
                {account.provider === "SMTP" ? "Direct SMTP sending mail" : `Connected ${formatDate(account.connectedAt)}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {account.provider === "SMTP" ? (
                <Button size="sm" variant="outline" onClick={() => setSmtpOpen(true)}>
                  Configure
                </Button>
              ) : account.provider === "GMAIL" ? (
                <Button size="sm" onClick={() => setSwitchOpen(true)} disabled={busy || !googleConfigured}>
                  Switch account
                </Button>
              ) : null}
              <Button variant="danger" size="sm" onClick={() => setDisconnectOpen(true)} loading={busy}>
                Disconnect
              </Button>
            </div>
          </div>
        ) : providerMode === "smtp" ? (
          <div className="space-y-3 rounded-lg border border-line bg-panel-2 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-accent/10 p-2 text-accent">
                <Mail className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-medium">Add Direct Sending Mail (SMTP)</h4>
                <p className="mt-1 text-xs text-muted">
                  Send emails directly through your email provider (Gmail App Password, Outlook, Zoho, SendGrid, or custom SMTP) without needing Google Cloud OAuth setup.
                </p>
                <div className="mt-3">
                  <Button variant="primary" size="sm" onClick={() => setSmtpOpen(true)}>
                    Configure Sending Mail
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : providerMode === "gmail" ? (
          <div className="space-y-3">
            {!googleConfigured && (
              <Alert tone="warning" title="Google OAuth is not configured on the server">
                You can either configure Google OAuth keys, or simply click <strong>&quot;Add Direct Sending Mail (SMTP)&quot;</strong> above to send immediately using an App Password.
              </Alert>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {googleConfigured ? (
                <a href="/api/oauth/google/start" className={buttonClasses({ variant: "primary" })}>
                  Connect Gmail with Google
                </a>
              ) : (
                <Button variant="primary" disabled>
                  Connect Gmail with Google
                </Button>
              )}
              <Button variant="outline" onClick={() => setSmtpOpen(true)}>
                Use Direct Sending Mail (SMTP) Instead
              </Button>
            </div>
            <p className="type-hint text-muted">The app only asks to send email on your behalf and to see your name and email address. It cannot read your inbox.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <Alert tone="warning" title="Test mode is selected">
              Sends are simulated and nothing is delivered. Addresses containing &quot;fail&quot;, &quot;bounce&quot; or &quot;ratelimit&quot; simulate errors.
            </Alert>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={connectMock} loading={busy}>
                Connect test sender
              </Button>
              <Button variant="outline" onClick={() => setSmtpOpen(true)}>
                Configure Real Sending Mail (SMTP)
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-line pt-3">
          <p className="type-hint text-subtle">
            Supports Gmail, Google Workspace, Microsoft 365, Zoho, Amazon SES, SendGrid, and any standard SMTP host.
          </p>
          {account?.provider !== "SMTP" && (
            <button
              type="button"
              onClick={() => setSmtpOpen(true)}
              className="text-xs font-medium text-accent hover:underline"
            >
              Configure SMTP instead
            </button>
          )}
        </div>
      </CardBody>

      {/* Direct SMTP Modal */}
      <Modal
        open={smtpOpen}
        onClose={() => setSmtpOpen(false)}
        title="Direct Sending Mail (SMTP)"
        description="Enter your email and SMTP password/App Password to send campaign emails directly."
        size="md"
        footer={
          <div className="flex w-full items-center justify-between">
            <Button variant="outline" onClick={() => setSmtpOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveSmtp} loading={busy}>
              <ShieldCheck className="mr-1.5 h-4 w-4" />
              Verify & Connect Sending Mail
            </Button>
          </div>
        }
      >
        <form onSubmit={saveSmtp} className="space-y-4">
          <Field label="Email Provider Preset" htmlFor="smtpPreset">
            <Select id="smtpPreset" value={preset} onChange={(e) => handlePresetChange(e.target.value)}>
              {Object.entries(SMTP_PRESETS).map(([key, item]) => (
                <option key={key} value={key}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Sending Email Address" htmlFor="fromEmail">
              <Input
                id="fromEmail"
                type="email"
                placeholder="you@company.com"
                value={fromEmail}
                onChange={(e) => {
                  setFromEmail(e.target.value);
                  if (!username) setUsername(e.target.value);
                  if (!testRecipient) setTestRecipient(e.target.value);
                }}
                required
              />
            </Field>
            <Field label="Sender Name" htmlFor="fromName">
              <Input
                id="fromName"
                placeholder="e.g. Subhash Rao"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Field label="SMTP Host" htmlFor="smtpHost">
                <Input
                  id="smtpHost"
                  placeholder="smtp.gmail.com"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  required
                />
              </Field>
            </div>
            <div>
              <Field label="Port" htmlFor="smtpPort">
                <Input
                  id="smtpPort"
                  type="number"
                  placeholder="465"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  required
                />
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Username (usually email)" htmlFor="smtpUser">
              <Input
                id="smtpUser"
                placeholder="you@company.com"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            <Field label="Password / App Password" htmlFor="smtpPass">
              <Input
                id="smtpPass"
                type="password"
                placeholder="••••••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="smtpSecure"
              checked={secure}
              onChange={(e) => setSecure(e.target.checked)}
              className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
            />
            <label htmlFor="smtpSecure" className="text-xs text-muted">
              Use SSL/TLS secure connection (recommended for port 465)
            </label>
          </div>

          <div className="rounded-md border border-line bg-panel-2 p-3 text-xs text-muted">
            <p className="font-medium text-fg">💡 Gmail Tip:</p>
            <p className="mt-0.5">
              If using a personal or Workspace Gmail address, generate an <strong>App Password</strong> at{" "}
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noreferrer"
                className="text-accent underline"
              >
                myaccount.google.com/apppasswords
              </a>{" "}
              (requires 2-Step Verification) and paste the 16-character code above.
            </p>
          </div>

          {account?.provider === "SMTP" && (
            <div className="rounded-lg border border-line bg-panel p-3">
              <p className="text-xs font-medium text-fg">Send a Live Test Email</p>
              <div className="mt-2 flex gap-2">
                <Input
                  type="email"
                  placeholder="Recipient email address"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  className="flex-1"
                />
                <Button size="sm" variant="outline" onClick={sendTestEmail} loading={testingSend}>
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Test Send
                </Button>
              </div>
              {testSuccess && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-500">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Test email sent successfully!
                </p>
              )}
            </div>
          )}
        </form>
      </Modal>

      {/* Disconnect Modal */}
      <Modal
        open={disconnectOpen}
        onClose={() => setDisconnectOpen(false)}
        title="Disconnect email account"
        description="Stored credentials for this sending mail will be deleted."
        size="sm"
        footer={
          <>
            <Button onClick={() => setDisconnectOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={disconnect} loading={busy}>
              Disconnect
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg">Disconnect this sender account? You can connect it again anytime.</p>
      </Modal>

      {/* Switch Google Account Modal */}
      <Modal
        open={switchOpen}
        onClose={() => setSwitchOpen(false)}
        title="Switch sender account"
        description="Sign in to another Google account; it replaces the current sender."
        size="sm"
        footer={
          <>
            <Button onClick={() => setSwitchOpen(false)}>Cancel</Button>
            <a href="/api/oauth/google/start" className={buttonClasses({ variant: "primary" })}>
              Choose Google account
            </a>
          </>
        }
      >
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-fg">
          <li>Emails not sent yet, in every campaign, will go out from the new account.</li>
          <li>Access for {account?.email} is revoked once the new account is connected.</li>
          <li>Switching is blocked while a campaign is scheduled or sending. Pause or cancel it first.</li>
        </ul>
      </Modal>
    </Card>
  );
}
