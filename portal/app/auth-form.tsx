"use client";

import { useState } from "react";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      setError(data.error ?? "Couldn't reach Sorts. Check your connection and try again.");
      setBusy(false);
      return;
    }
    window.location.assign(next);
  }

  return (
    <form onSubmit={onSubmit}>
      {mode === "signup" && (
        <>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" autoComplete="name" maxLength={100} />
        </>
      )}
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" required autoComplete="email" />
      <label htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        required
        minLength={mode === "signup" ? 8 : 1}
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
      />
      {error && <div className="alert error" role="alert">{error}</div>}
      <p style={{ marginTop: 18 }}>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? (mode === "signup" ? "Creating account…" : "Logging in…") : mode === "signup" ? "Create account and start trial" : "Log in"}
        </button>
      </p>
    </form>
  );
}
