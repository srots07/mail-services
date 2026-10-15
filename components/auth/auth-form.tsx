"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { api } from "@/lib/client/api";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const search = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api(`/api/auth/${mode}`, { body: mode === "login" ? { email, password } : { name, email, password } });
      const next = search.get("next");
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sorts couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card variant="brand" className="p-6 sm:p-7">
      <form onSubmit={onSubmit} className="space-y-4" aria-labelledby="auth-title">
        <div>
          <h2 id="auth-title" className="type-h2 text-fg">
            {mode === "login" ? "Sign in to Sorts" : "Create your Sorts account"}
          </h2>
          <p className="type-caption mt-1 text-muted">
            {mode === "login" ? "Use the email you registered with to open your campaigns." : "Your campaigns, contacts and sender profiles stay in this account."}
          </p>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        {mode === "register" && (
          <Field label="Your name" htmlFor="name">
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </Field>
        )}
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </Field>
        <Field label="Password" htmlFor="password" hint={mode === "register" ? "At least 10 characters." : undefined}>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={loading}>
          {mode === "login" ? "Sign in" : "Create account"}
          <ArrowRight aria-hidden />
        </Button>
        <p className="type-caption text-center text-muted">
          {mode === "login" ? (
            <>
              No account yet?{" "}
              <Link href="/register" className="text-accent-strong hover:underline">
                Create one
              </Link>
            </>
          ) : (
            <>
              Already registered?{" "}
              <Link href="/login" className="text-accent-strong hover:underline">
                Sign in
              </Link>
            </>
          )}
        </p>
      </form>
    </Card>
  );
}
