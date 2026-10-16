"use client";

import { useEffect, useState } from "react";
import { IndianRupee, QrCode, Shield, Check, History, ExternalLink, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";
import { formatDate } from "@/lib/utils";

interface PaymentRecord {
  id: string;
  amount: number;
  creditsGranted: number;
  utr: string;
  status: string;
  createdAt: string;
  screenshotData: string | null;
  user?: {
    id: string;
    email: string;
    name: string | null;
  };
}

interface PaymentData {
  credits: {
    upiId: string;
    upiName: string;
    amountInr: number;
    creditsPerPack: number;
    totalCredits: number;
    usedCredits: number;
    remainingCredits: number;
  };
  history: PaymentRecord[];
  isAdmin?: boolean;
}

export function UpiSettingsCard() {
  const toast = useToast();
  const [data, setData] = useState<PaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [upiId, setUpiId] = useState("");
  const [upiName, setUpiName] = useState("");
  const [amountInr, setAmountInr] = useState("85");
  const [viewScreenshot, setViewScreenshot] = useState<string | null>(null);

  function loadData(showLoading = false) {
    if (showLoading) setLoading(true);
    api<PaymentData>("/api/payments")
      .then((res) => {
        setData(res);
        setUpiId(res.credits.upiId);
        setUpiName(res.credits.upiName);
        setAmountInr(String(res.credits.amountInr));
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let active = true;
    api<PaymentData>("/api/payments")
      .then((res) => {
        if (!active) return;
        setData(res);
        setUpiId(res.credits.upiId);
        setUpiName(res.credits.upiName);
        setAmountInr(String(res.credits.amountInr));
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!upiId.trim()) {
      toast.error("Please enter a valid UPI ID");
      return;
    }

    setSaving(true);
    try {
      await api("/api/payments", {
        method: "PUT",
        body: {
          upiId: upiId.trim(),
          upiName: upiName.trim(),
          amountInr: Number(amountInr) || 85,
        },
      });
      toast.success("UPI details updated successfully");
      loadData();
    } catch (err) {
      toast.error("Could not update UPI details", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Direct UPI Payment Configuration (Admin)"
          description="Owner/Main Administrator settings: Collect payments directly to your UPI ID without a third-party gateway fee. Verified submissions automatically credit users."
          actions={
            <div className="flex items-center gap-2">
              <Badge tone="accent">Admin Only</Badge>
              <Badge tone="neutral">₹{amountInr} = 5 runs</Badge>
            </div>
          }
        />
        <CardBody className="space-y-5">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
              <Field
                label="Your Receiving UPI ID"
                htmlFor="adminUpiId"
                hint="e.g. yourname@okaxis, yourname@upi"
              >
                <Input
                  id="adminUpiId"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="e.g. subhash@okaxis"
                  required
                />
              </Field>

              <Field
                label="Payee Display Name"
                htmlFor="adminUpiName"
                hint="Name shown on QR codes & apps"
              >
                <Input
                  id="adminUpiName"
                  value={upiName}
                  onChange={(e) => setUpiName(e.target.value)}
                  placeholder="e.g. Subhash / Sorts"
                  required
                />
              </Field>

              <Field
                label="Price for 5 Runs (INR)"
                htmlFor="adminAmountInr"
                hint="Default is ₹85 (~$1 USD)"
              >
                <Input
                  id="adminAmountInr"
                  type="number"
                  value={amountInr}
                  onChange={(e) => setAmountInr(e.target.value)}
                  min={1}
                  required
                />
              </Field>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="type-caption text-muted">
                Changes take effect immediately on all payment modals and QR codes for all users.
              </p>
              <Button type="submit" variant="primary" loading={saving}>
                Save UPI details
              </Button>
            </div>
          </form>

          {/* Payment Submissions Ledger */}
          <div className="space-y-3 pt-2 border-t border-line">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted" />
                <h4 className="text-sm font-semibold text-fg">All Customer Payment Submissions</h4>
              </div>
              <span className="type-caption text-muted">
                {data?.history.length ?? 0} total transactions
              </span>
            </div>

            {loading ? (
              <p className="type-hint text-muted py-2">Loading transactions...</p>
            ) : !data?.history?.length ? (
              <p className="type-hint text-muted py-2">No payments submitted yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-left text-xs">
                  <thead className="bg-panel-2 border-b border-line text-muted font-medium">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">User / Account</th>
                      <th className="px-3 py-2">UTR / Ref</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Credits</th>
                      <th className="px-3 py-2">Receipt</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.history.map((tx) => (
                      <tr key={tx.id} className="hover:bg-panel-2/50 transition-colors">
                        <td className="px-3 py-2 text-muted">{formatDate(tx.createdAt)}</td>
                        <td className="px-3 py-2 text-fg font-medium">
                          {tx.user?.email ? (
                            <span title={tx.user.email} className="truncate max-w-[10rem] block">
                              {tx.user.name ? `${tx.user.name} (${tx.user.email})` : tx.user.email}
                            </span>
                          ) : (
                            <span className="text-muted">Account</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono font-medium text-fg">{tx.utr}</td>
                        <td className="px-3 py-2">₹{tx.amount}</td>
                        <td className="px-3 py-2 text-success font-medium">+{tx.creditsGranted} runs</td>
                        <td className="px-3 py-2">
                          {tx.screenshotData ? (
                            <button
                              type="button"
                              onClick={() => setViewScreenshot(tx.screenshotData)}
                              className="inline-flex items-center gap-1 text-accent hover:underline font-medium"
                            >
                              <ImageIcon className="h-3 w-3" />
                              View receipt
                            </button>
                          ) : (
                            <span className="text-subtle">No file</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone="success" dot>
                            {tx.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Screenshot Viewer Modal */}
      <Modal
        open={Boolean(viewScreenshot)}
        onClose={() => setViewScreenshot(null)}
        title="Payment Screenshot"
        size="md"
      >
        {viewScreenshot && (
          <div className="p-2 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewScreenshot}
              alt="Payment receipt screenshot"
              className="max-h-[70vh] rounded-md object-contain border border-line"
            />
          </div>
        )}
      </Modal>
    </>
  );
}
