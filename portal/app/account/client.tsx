"use client";

import { useState } from "react";

type RazorpayHandlerResponse = {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
};

type RazorpayCtor = new (options: Record<string, unknown>) => { open: () => void; on: (e: string, cb: () => void) => void };

declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : {};
  if (!res || !res.ok) throw new Error(data.error ?? "Could not reach the server. Try again.");
  return data;
}

function loadCheckout(): Promise<RazorpayCtor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Checkout failed to load.")));
    s.onerror = () => reject(new Error("Could not load Razorpay checkout. Check your connection."));
    document.body.appendChild(s);
  });
}

export function BillingActions(props: {
  canSubscribe: boolean;
  canCancel: boolean;
  preferredPlan: "MONTHLY" | "YEARLY";
  monthlyLabel: string;
  yearlyLabel: string;
  mock: boolean;
  email: string;
  name: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function subscribe(plan: "MONTHLY" | "YEARLY") {
    setBusy(true);
    setError(null);
    try {
      const start = await post("/api/billing/subscribe", { plan });
      if (start.mock) {
        if (!window.confirm(`Development mode: simulate a successful ${plan.toLowerCase()} payment?`)) return;
        await post("/api/billing/verify", { mock: true, subscriptionId: start.subscriptionId });
        window.location.reload();
        return;
      }
      const Razorpay = await loadCheckout();
      await new Promise<void>((resolve, reject) => {
        const rz = new Razorpay({
          key: start.keyId,
          subscription_id: start.subscriptionId,
          name: "Sorts",
          description: plan === "YEARLY" ? "Yearly subscription" : "Monthly subscription",
          prefill: { email: props.email, name: props.name },
          handler: (resp: RazorpayHandlerResponse) => {
            post("/api/billing/verify", {
              paymentId: resp.razorpay_payment_id,
              subscriptionId: resp.razorpay_subscription_id,
              signature: resp.razorpay_signature,
            }).then(() => resolve(), reject);
          },
          modal: { ondismiss: () => reject(new Error("Checkout closed before payment.")) },
        });
        rz.on("payment.failed", () => reject(new Error("The payment failed. Try another card or UPI.")));
        rz.open();
      });
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm("Cancel the subscription? You keep access until the end of the paid period.")) return;
    setBusy(true);
    setError(null);
    try {
      await post("/api/billing/cancel", {});
      setNote("Cancelled. You keep access until the end of the current period.");
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const plans: { plan: "MONTHLY" | "YEARLY"; label: string }[] = [
    { plan: "MONTHLY", label: `Subscribe monthly · ${props.monthlyLabel}` },
    { plan: "YEARLY", label: `Subscribe yearly · ${props.yearlyLabel}` },
  ];
  if (props.preferredPlan === "YEARLY") plans.reverse();

  return (
    <div>
      {props.canSubscribe && (
        <div className="row">
          {plans.map((p, i) => (
            <button key={p.plan} className={i === 0 ? "btn" : "btn secondary"} disabled={busy} onClick={() => subscribe(p.plan)}>
              {p.label}
            </button>
          ))}
        </div>
      )}
      {props.mock && props.canSubscribe && <p className="small muted">Razorpay keys are not set: payments are simulated (development only).</p>}
      {props.canCancel && (
        <p>
          <button className="btn danger" disabled={busy} onClick={cancel}>Cancel subscription</button>
        </p>
      )}
      {error && <div className="alert error" role="alert">{error}</div>}
      {note && <div className="alert ok">{note}</div>}
    </div>
  );
}

export function DeviceList({ devices }: { devices: { id: string; name: string; lastSeen: string; added: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  async function remove(id: string, name: string) {
    if (!window.confirm(`Disconnect "${name}"? That PC will stop sending until it is connected again.`)) return;
    try {
      await post("/api/device/revoke", { deviceId: id });
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <>
      <table>
        <thead>
          <tr><th>PC</th><th>Last seen</th><th /></tr>
        </thead>
        <tbody>
          {devices.map((d) => (
            <tr key={d.id}>
              <td>{d.name}<div className="small muted">Added {d.added}</div></td>
              <td>{d.lastSeen}</td>
              <td><button className="btn danger" onClick={() => remove(d.id, d.name)}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <div className="alert error" role="alert">{error}</div>}
    </>
  );
}
