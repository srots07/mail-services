import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/app/auth-form";
import { currentUser, safeNext } from "@/lib/auth";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await currentUser()) redirect(next);
  return (
    <div className="card narrow featured cut">
      <h2>Log in to Sorts</h2>
      <p className="muted small">Manage your subscription and the PCs connected to your account.</p>
      <AuthForm mode="login" next={next} />
      <p className="small">
        New here? <Link href={`/signup?next=${encodeURIComponent(next)}`}>Start a free trial</Link>
      </p>
    </div>
  );
}
