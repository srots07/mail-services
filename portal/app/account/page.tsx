import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { entitlement } from "@/lib/subscription";
import { BillingActions, DeviceList } from "./client";

function fmt(d: Date | null): string {
  return d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const user = await requireUser("/account");
  const sp = await searchParams;
  const e = env();
  const sub = user.subscription;
  const ent = entitlement(sub);
  const devices = await db().device.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, lastSeenAt: true, createdAt: true },
  });
  const paying = sub && ["ACTIVE", "PAST_DUE", "PENDING"].includes(sub.status) && !!sub.razorpaySubscriptionId;

  let badge: React.ReactNode;
  if (ent.active && ent.kind === "trial") badge = <span className="badge warn">Free trial</span>;
  else if (ent.active && sub?.status === "PAST_DUE") badge = <span className="badge warn">Payment failed — retrying</span>;
  else if (ent.active && sub?.cancelAtPeriodEnd) badge = <span className="badge warn">Cancels at period end</span>;
  else if (ent.active && sub?.status === "CANCELLED") badge = <span className="badge warn">Cancelled</span>;
  else if (ent.active) badge = <span className="badge ok">Active</span>;
  else badge = <span className="badge bad">Not active — sending is locked</span>;

  return (
    <>
      <span className="eyebrow">Sorts account</span>
      <h1 style={{ margin: "10px 0 4px" }}>Your account</h1>
      <p className="muted" style={{ marginTop: 0 }}>{user.email}</p>

      <div className="grid">
        <div className="card">
          <h3>Subscription {badge}</h3>
          {ent.active && ent.kind === "trial" && (
            <p>Your free trial ends on <b>{fmt(ent.until)}</b>. Subscribe now to keep sending after that; you will not be charged before the trial ends.</p>
          )}
          {ent.active && ent.kind === "paid" && (
            <p>
              Plan: <b>{sub?.plan === "YEARLY" ? "Yearly" : "Monthly"}</b>. {sub?.cancelAtPeriodEnd || sub?.status === "CANCELLED" ? "Access ends" : "Renews"} on{" "}
              <b>{fmt(sub?.currentPeriodEnd ?? null)}</b>.
            </p>
          )}
          {!ent.active && <p>Your trial or subscription has ended. Subscribe to send emails again; drafts and contacts in the app are kept.</p>}
          {sub?.status === "PENDING" && ent.kind === "trial" && (
            <div className="alert ok">Subscribed. Your first payment is taken when the trial ends on {fmt(ent.until)}.</div>
          )}
          {sub?.status === "PENDING" && ent.kind !== "trial" && (
            <div className="alert warn">Payment is being confirmed. This page updates within a minute.</div>
          )}
          <BillingActions
            canSubscribe={!paying}
            canCancel={!!paying && !sub?.cancelAtPeriodEnd}
            preferredPlan={sp.plan === "yearly" ? "YEARLY" : "MONTHLY"}
            monthlyLabel={e.PRICE_MONTHLY_LABEL}
            yearlyLabel={e.PRICE_YEARLY_LABEL}
            mock={e.razorpayMock}
            email={user.email}
            name={user.name ?? ""}
          />
        </div>

        <div className="card">
          <h3>Connected PCs ({devices.length}/{e.MAX_DEVICES})</h3>
          {devices.length === 0 ? (
            <p className="muted">
              No PC connected yet. Install Sorts (<Link href="/download">download</Link>), then click <b>Account → Connect account</b> in it.
            </p>
          ) : (
            <DeviceList devices={devices.map((d) => ({ id: d.id, name: d.name, lastSeen: fmt(d.lastSeenAt), added: fmt(d.createdAt) }))} />
          )}
        </div>
      </div>
    </>
  );
}
