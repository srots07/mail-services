"use client";

import { useEffect, useState } from "react";
import { Zap, History, PlusCircle, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { api } from "@/lib/client/api";
import { formatDate } from "@/lib/utils";
import { UpiPaymentModal } from "@/components/dashboard/upi-payment-modal";

interface PaymentRecord {
  id: string;
  amount: number;
  creditsGranted: number;
  utr: string;
  status: string;
  createdAt: string;
}

interface PaymentData {
  credits: {
    totalCredits: number;
    usedCredits: number;
    remainingCredits: number;
    amountInr: number;
    creditsPerPack: number;
  };
  history: PaymentRecord[];
}

export function UserBillingCard() {
  const [data, setData] = useState<PaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  function loadData() {
    setLoading(true);
    api<PaymentData>("/api/payments")
      .then((res) => setData(res))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  }, []);

  const remaining = data?.credits?.remainingCredits ?? 0;
  const used = data?.credits?.usedCredits ?? 0;
  const total = data?.credits?.totalCredits ?? 0;
  const amountInr = data?.credits?.amountInr ?? 85;

  return (
    <>
      <Card>
        <CardHeader
          title="Campaign Credits & Payment"
          description="Purchase campaign runs to personalize and send high-converting outreach batches."
          actions={
            <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>
              <Zap className="h-4 w-4 mr-1.5 text-amber-300" />
              <span>Top Up Runs ($1)</span>
            </Button>
          }
        />
        <CardBody className="space-y-6">
          {/* Credits Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-line bg-panel-2 p-3.5">
              <span className="type-caption text-muted">Runs Remaining</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-fg">{loading ? "..." : remaining}</span>
                <span className="text-xs text-muted">runs</span>
              </div>
              <p className="type-hint text-subtle mt-1">Ready for upcoming campaigns</p>
            </div>

            <div className="rounded-lg border border-line bg-panel-2 p-3.5">
              <span className="type-caption text-muted">Runs Used</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-fg">{loading ? "..." : used}</span>
                <span className="text-xs text-muted">completed</span>
              </div>
              <p className="type-hint text-subtle mt-1">Total batches executed</p>
            </div>

            <div className="rounded-lg border border-line bg-panel-2 p-3.5">
              <span className="type-caption text-muted">Top-up Rate</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-fg">$1</span>
                <span className="text-xs text-muted">/ ₹{amountInr} for 5 runs</span>
              </div>
              <p className="type-hint text-subtle mt-1">Direct instant UPI transfer</p>
            </div>
          </div>

          {/* Payment Method Action Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-line-strong bg-panel p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge tone="accent">UPI Payment Method</Badge>
                <span className="text-xs text-muted flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-success" /> Instant verification
                </span>
              </div>
              <p className="text-sm font-medium text-fg">Need more campaign runs?</p>
              <p className="type-caption text-muted">
                Scan QR code via Google Pay, PhonePe, Paytm, or BHIM. Enter your 12-digit UTR reference to unlock 5 runs instantly.
              </p>
            </div>
            <Button variant="primary" onClick={() => setShowModal(true)} className="shrink-0">
              <PlusCircle className="h-4 w-4 mr-1.5" />
              Pay $1 (₹{amountInr})
            </Button>
          </div>

          {/* User's Own Payment History */}
          <div className="space-y-3 pt-1 border-t border-line">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted" />
                <h4 className="text-sm font-semibold text-fg">Your Payment History</h4>
              </div>
              <span className="type-caption text-muted">
                {data?.history.length ?? 0} transactions
              </span>
            </div>

            {loading ? (
              <p className="type-hint text-muted py-2">Loading transactions...</p>
            ) : !data?.history?.length ? (
              <p className="type-hint text-muted py-2">No top-up payments made yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-left text-xs">
                  <thead className="bg-panel-2 border-b border-line text-muted font-medium">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">UTR Reference</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Credits Added</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.history.map((tx) => (
                      <tr key={tx.id} className="hover:bg-panel-2/50 transition-colors">
                        <td className="px-3 py-2 text-muted">{formatDate(tx.createdAt)}</td>
                        <td className="px-3 py-2 font-mono font-medium text-fg">{tx.utr}</td>
                        <td className="px-3 py-2 font-medium">₹{tx.amount}</td>
                        <td className="px-3 py-2 text-success font-medium">+{tx.creditsGranted} runs</td>
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

      <UpiPaymentModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => {
          loadData();
        }}
      />
    </>
  );
}
