"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Zap, Key, CheckCircle2, AlertCircle, Eye, EyeOff, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";

interface GroqStatus {
  configured: boolean;
  maskedKey: string;
  model: string;
  availableModels: { id: string; label: string; desc: string }[];
}

export function GroqKeyCard({ initialStatus }: { initialStatus?: GroqStatus }) {
  const router = useRouter();
  const toast = useToast();

  const [status, setStatus] = useState<GroqStatus | null>(initialStatus ?? null);
  const [loading, setLoading] = useState(!initialStatus);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; latencyMs?: number; error?: string } | null>(null);

  const [newKey, setNewKey] = useState("");
  const [selectedModel, setSelectedModel] = useState(initialStatus?.model ?? "openai/gpt-oss-120b");
  const [showKey, setShowKey] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api<GroqStatus>("/api/settings/groq");
      setStatus(res);
      setSelectedModel(res.model);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialStatus) {
      void refreshStatus();
    }
  }, [initialStatus, refreshStatus]);

  async function handleTestCurrentKey() {
    if (!status?.configured) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api<{ ok: boolean; latencyMs?: number; error?: string }>("/api/settings/groq", {
        method: "PUT",
        body: { apiKey: newKey.trim() || "current" },
      });
      setTestResult(res);
      if (res.ok) {
        toast.success(`Groq API connected (${res.latencyMs}ms)`, `Model ${status.model} is ready.`);
      } else {
        toast.error("Groq connection test failed", res.error);
      }
    } catch (err) {
      toast.error("Test failed", err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveKey(e: React.FormEvent) {
    e.preventDefault();
    const keyToSave = newKey.trim();
    if (!keyToSave) {
      toast.error("Please enter a Groq API key", "Key usually starts with 'gsk_'");
      return;
    }

    setSaving(true);
    setTestResult(null);
    try {
      const res = await api<{ success: boolean; status: GroqStatus }>("/api/settings/groq", {
        method: "POST",
        body: {
          apiKey: keyToSave,
          model: selectedModel,
        },
      });

      setStatus(res.status);
      setNewKey("");
      toast.success("Groq API key connected!", `Verified and active with model ${res.status.model}`);
      router.refresh();
    } catch (err) {
      toast.error("Could not connect Groq key", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Groq API key"
        description="High-speed AI inference. Used for ultra-fast drafting and automatic failover whenever OpenRouter has insufficient credits."
        actions={
          <Badge tone={status?.configured ? "success" : "neutral"} dot={Boolean(status?.configured)}>
            {status?.configured ? "Connected" : "Not connected"}
          </Badge>
        }
      />
      <CardBody className="space-y-4">
        {/* Connection Status Box */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-line bg-panel-2 p-3.5">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-accent shrink-0" />
              <span className="text-sm font-medium">Groq Cloud Integration</span>
              {status?.configured ? (
                <span className="flex items-center text-xs text-success gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Active
                </span>
              ) : (
                <span className="flex items-center text-xs text-muted gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  No key stored
                </span>
              )}
            </div>
            <p className="type-hint text-muted">
              {status?.configured ? (
                <>
                  Stored key: <code className="font-mono text-fg bg-panel px-1.5 py-0.5 rounded text-xs">{status.maskedKey}</code> · Model:{" "}
                  <code className="font-mono text-fg bg-panel px-1.5 py-0.5 rounded text-xs">{status.model}</code>
                </>
              ) : (
                "Enter your Groq key below to enable failover and high-speed drafting."
              )}
            </p>
          </div>

          {status?.configured && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              loading={testing}
              onClick={() => void handleTestCurrentKey()}
              className="shrink-0"
            >
              Test connection
            </Button>
          )}
        </div>

        {testResult && (
          <Alert tone={testResult.ok ? "success" : "danger"}>
            {testResult.ok
              ? `Connection successful! Groq API responded in ${testResult.latencyMs}ms.`
              : `Connection test failed: ${testResult.error}`}
          </Alert>
        )}

        {/* Key Configuration Form */}
        <form onSubmit={handleSaveKey} className="space-y-4 pt-1">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
            <Field
              label={status?.configured ? "Update Groq API key" : "Connect Groq API key"}
              htmlFor="groqApiKey"
              hint={
                <span className="flex items-center gap-1.5 pt-0.5">
                  <Key className="h-3 w-3" />
                  Starts with <code className="font-mono">gsk_...</code>
                </span>
              }
            >
              <div className="relative">
                <Input
                  id="groqApiKey"
                  type={showKey ? "text" : "password"}
                  placeholder={status?.configured ? "Enter new key to replace existing" : "gsk_..."}
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="pr-10 font-mono text-xs sm:text-sm"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-fg focus:outline-none"
                  aria-label={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            <Field
              label="Groq Model"
              htmlFor="groqModel"
              hint="Optimized for high-speed email drafting"
            >
              <Select
                id="groqModel"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {status?.availableModels?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                )) ?? (
                  <>
                    <option value="openai/gpt-oss-120b">GPT-OSS 120B (Recommended)</option>
                    <option value="openai/gpt-oss-20b">GPT-OSS 20B</option>
                    <option value="qwen/qwen3.8-27b">Qwen 3.8 27B</option>
                  </>
                )}
              </Select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="type-caption flex items-center gap-1 text-accent hover:underline"
            >
              Get a free Groq API key <ExternalLink className="h-3 w-3" />
            </a>

            <Button
              type="submit"
              variant="primary"
              loading={saving}
              disabled={!newKey.trim()}
            >
              {status?.configured ? "Update key & connect" : "Connect Groq key"}
            </Button>
          </div>
        </form>

        <Alert tone="info">
          <strong>Seamless AI continuity:</strong> If OpenRouter runs out of credits or encounters an issue, Sorts automatically routes generation through this Groq key so your campaign draft queue is never halted.
        </Alert>
      </CardBody>
    </Card>
  );
}
