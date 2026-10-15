"use client";

import Link from "next/link";
import { useState } from "react";

export function ActivateForm({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; limit: boolean } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/device/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userCode: code }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) {
      setError({ message: data.error ?? "Could not reach the server. Try again.", limit: data.code === "DEVICE_LIMIT" });
      return;
    }
    setDone(data.deviceName ?? "Your PC");
  }

  if (done) {
    return (
      <div className="alert ok">
        <b>{done}</b> is connected. You can close this tab and go back to Sorts; it updates within a few seconds.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <label htmlFor="code">Code shown in Sorts</label>
      <input
        id="code"
        className="code-input"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="XXXX-XXXX"
        autoComplete="off"
        maxLength={12}
        required
      />
      {error && (
        <div className="alert error" role="alert">
          {error.message} {error.limit && <Link href="/account">Open account page</Link>}
        </div>
      )}
      <p style={{ marginTop: 18 }}>
        <button className="btn" type="submit" disabled={busy}>{busy ? "Connecting…" : "Connect this PC"}</button>
      </p>
    </form>
  );
}
