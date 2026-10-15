"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { UpiPaymentModal, type UserCredits } from "./upi-payment-modal";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";

export function CreditsBadge() {
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  function loadCredits() {
    api<{ credits: UserCredits }>("/api/payments")
      .then((res) => setCredits(res.credits))
      .catch(() => undefined);
  }

  useEffect(() => {
    loadCredits();
    const handleRefresh = () => loadCredits();
    window.addEventListener("sorts:credits-change", handleRefresh);
    window.addEventListener("focus", handleRefresh);
    return () => {
      window.removeEventListener("sorts:credits-change", handleRefresh);
      window.removeEventListener("focus", handleRefresh);
    };
  }, []);

  if (!credits) return null;

  const remaining = credits.remainingCredits;
  const isZero = remaining <= 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
          isZero
            ? "border border-danger/40 bg-danger-soft text-danger hover:bg-danger/20 animate-pulse"
            : remaining <= 2
            ? "border border-warning/40 bg-warning-soft text-warning hover:bg-warning/20"
            : "border border-line-strong bg-panel-2 text-fg hover:border-accent/40 hover:bg-panel",
        )}
        title="Campaign usage balance — click to top up via UPI"
        aria-label="Campaign usage balance"
      >
        <Zap className={cn("h-3.5 w-3.5", isZero ? "text-danger" : "text-accent")} />
        <span className="font-semibold">{remaining}</span>
        <span className="hidden sm:inline text-muted font-normal">
          {remaining === 1 ? "run left" : "runs left"}
        </span>
        {isZero && (
          <span className="ml-1 rounded bg-danger px-1.5 py-0.2 text-[10px] font-bold text-white uppercase">
            Top up $1
          </span>
        )}
      </button>

      <UpiPaymentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => loadCredits()}
      />
    </>
  );
}
