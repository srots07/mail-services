"use client";

import { useEffect, useState } from "react";
import { Copy, Check, QrCode, Upload, Zap, ShieldCheck, ArrowRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";

export interface UserCredits {
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
  canRunCampaign: boolean;
  upiId: string;
  upiName: string;
  amountInr: number;
  creditsPerPack: number;
  upiIntentUrl: string;
}

export function UpiPaymentModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const toast = useToast();
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [utr, setUtr] = useState("");
  const [screenshotData, setScreenshotData] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [successState, setSuccessState] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      setSuccessState(false);
      setUtr("");
      setScreenshotData(null);
      setFileName("");
      api<{ credits: UserCredits }>("/api/payments")
        .then((res) => setCredits(res.credits))
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }
  }, [open]);

  function copyUpiId() {
    if (!credits?.upiId) return;
    navigator.clipboard.writeText(credits.upiId);
    setCopied(true);
    toast.success("UPI ID copied to clipboard", credits.upiId);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File too large", "Screenshot must be under 2MB");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setScreenshotData(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanUtr = utr.trim();
    if (cleanUtr.length < 6) {
      toast.error("Invalid UTR number", "Please enter the 12-digit transaction/UTR reference from your UPI app.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api<{ success: boolean; creditsAdded: number; newRemaining: number }>("/api/payments", {
        method: "POST",
        body: {
          utr: cleanUtr,
          screenshotData: screenshotData ?? undefined,
        },
      });

      setSuccessState(true);
      toast.success(
        `Payment confirmed! +${res.creditsAdded} runs added`,
        `You now have ${res.newRemaining} campaign runs available.`,
      );
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error("Could not verify payment", err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const upiId = credits?.upiId || "owner@upi";
  const upiName = credits?.upiName || "Sorts Outreach";
  const amountInr = credits?.amountInr ?? 85;
  const qrUrl = credits?.upiIntentUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=4&data=${encodeURIComponent(credits.upiIntentUrl)}`
    : "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Top up Campaign Runs"
      description="Pay via any UPI app (GPay, PhonePe, Paytm, BHIM) — $1 (₹85) for 5 campaign runs."
      size="md"
    >
      {successState ? (
        <div className="py-6 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-fg">5 Campaign Runs Unlocked!</h3>
            <p className="type-hint text-muted mt-1">
              Your payment of ₹{amountInr} has been credited. You can now generate and send campaigns without limits.
            </p>
          </div>
          <div className="pt-2">
            <Button variant="primary" onClick={onClose} className="w-full">
              Continue to Outreach
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          {/* Plan badge & Pricing banner */}
          <div className="flex items-center justify-between rounded-lg border border-line-strong bg-panel-2 p-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-accent" />
              <div>
                <p className="text-sm font-medium text-fg">5 Campaign Runs Pack</p>
                <p className="type-caption text-muted">Personalize & send up to 5 full campaigns</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold text-fg">$1</span>
              <span className="type-caption text-subtle block">₹{amountInr} INR</span>
            </div>
          </div>

          {/* QR Code and UPI ID */}
          <div className="flex flex-col sm:flex-row items-center gap-4 rounded-xl border border-line bg-panel p-4">
            <div className="flex flex-col items-center shrink-0">
              {qrUrl ? (
                <div className="rounded-lg border border-line-strong bg-white p-2 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrUrl} alt="UPI Payment QR Code" className="h-36 w-36" />
                </div>
              ) : (
                <div className="h-36 w-36 flex items-center justify-center rounded-lg border border-line bg-panel-2 text-muted">
                  <QrCode className="h-8 w-8" />
                </div>
              )}
              <span className="type-caption mt-1 text-muted text-[11px]">Scan with any UPI app</span>
            </div>

            <div className="min-w-0 flex-1 space-y-2.5 text-center sm:text-left">
              <div>
                <p className="type-caption text-muted">Payee name</p>
                <p className="text-sm font-semibold text-fg truncate">{upiName}</p>
              </div>

              <div>
                <p className="type-caption text-muted">UPI ID</p>
                <div className="mt-1 flex items-center gap-1.5 justify-center sm:justify-start">
                  <code className="rounded border border-line-strong bg-panel-2 px-2 py-1 font-mono text-xs text-fg select-all">
                    {upiId}
                  </code>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={copyUpiId}
                    title="Copy UPI ID"
                    aria-label="Copy UPI ID"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-muted pt-1 justify-center sm:justify-start">
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                <span>Zero gateway fees · Instant unlock</span>
              </div>
            </div>
          </div>

          {/* Transaction UTR / Ref submission */}
          <div className="space-y-3 pt-1">
            <Field
              label="12-digit UPI Reference / UTR Number *"
              htmlFor="utrInput"
              hint="Found in your Google Pay, PhonePe, or Paytm payment receipt"
            >
              <Input
                id="utrInput"
                placeholder="e.g. 428910294821"
                value={utr}
                onChange={(e) => setUtr(e.target.value)}
                required
                maxLength={24}
                className="font-mono"
              />
            </Field>

            <div>
              <label className="type-mono-label block text-muted mb-1.5">
                Payment Screenshot (Optional)
              </label>
              <div className="flex items-center gap-2">
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-panel-2 px-3 py-2 text-xs text-fg hover:border-accent hover:text-accent transition-colors">
                  <Upload className="h-3.5 w-3.5" />
                  <span>{fileName ? "Change screenshot" : "Attach receipt screenshot"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                {fileName && <span className="type-caption text-muted truncate max-w-[12rem]">{fileName}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting} disabled={!utr.trim()}>
              <span>Confirm & Unlock 5 Runs</span>
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
