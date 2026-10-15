"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";

type AiChoice = "openrouter" | "groq" | "mock";
type EmailChoice = "gmail" | "mock" | "smtp";

interface Health {
  label: string;
  connected: boolean;
  detail: string;
}

interface Status {
  ai: Health;
  email: Health;
  mode: "REAL" | "MOCK" | "MIXED";
}

export function ProviderSettingsCard({ ai, email, mockAllowed }: { ai: AiChoice; email: EmailChoice; mockAllowed: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  const check = useCallback(async (force: boolean) => {
    setChecking(true);
    try {
      setStatus(await api<Status>(`/api/settings/providers/status${force ? "?refresh=1" : ""}`));
    } catch {
      setStatus(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<Status>("/api/settings/providers/status")
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ai, email]);

  async function save(patch: { ai?: AiChoice; email?: EmailChoice }) {
    setSaving(true);
    try {
      await api("/api/settings/providers", { method: "PUT", body: patch });
      toast.success("Provider updated");
      router.refresh();
    } catch (err) {
      toast.error("Could not change provider", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  const row = (name: string, h: Health | undefined) => (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm">
          {name}: <span className="font-medium">{h?.label ?? "…"}</span>
        </p>
        <p className="type-hint truncate text-muted" title={h?.detail}>
          {h?.detail ?? "Checking…"}
        </p>
      </div>
      {h && (
        <Badge tone={h.connected ? "success" : "danger"} dot>
          {h.connected ? "Connected" : "Not connected"}
        </Badge>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader
        title="Providers"
        description="The app always uses exactly the providers chosen here and never silently switches to another one."
        actions={
          <Button size="sm" variant="outline" loading={checking} onClick={() => void check(true)}>
            Check connection
          </Button>
        }
      />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          <Field label="AI provider" htmlFor="aiProvider">
            <Select id="aiProvider" value={ai} disabled={saving || !mockAllowed} onChange={(e) => void save({ ai: e.target.value as AiChoice })}>
              <option value="openrouter">OpenRouter</option>
              {mockAllowed && <option value="mock">Test mode (no AI)</option>}
            </Select>
          </Field>
          <Field label="Email provider" htmlFor="emailProvider">
            <Select id="emailProvider" value={email} disabled={saving} onChange={(e) => void save({ email: e.target.value as EmailChoice })}>
              <option value="gmail">Gmail (Google OAuth)</option>
              <option value="smtp">Direct SMTP (Any Provider / App Password)</option>
              {mockAllowed && <option value="mock">Test mode (not delivered)</option>}
            </Select>
          </Field>
        </div>
        <div className="space-y-2">
          {row("AI", status?.ai)}
          {row("Email", status?.email)}
          {status && (
            <p className="type-caption flex items-center gap-2 text-muted">
              Mode:
              <Badge tone={status.mode === "REAL" ? "accent" : "warning"}>{status.mode === "REAL" ? "Live" : status.mode === "MOCK" ? "Test mode" : "Partly test mode"}</Badge>
            </p>
          )}
        </div>
        {!mockAllowed && <Alert tone="info">Production build: only the real providers (OpenRouter and Gmail) are available.</Alert>}
      </CardBody>
    </Card>
  );
}
