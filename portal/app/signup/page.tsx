import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/app/auth-form";
import { currentUser, safeNext } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Start free trial" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string; plan?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next ?? (sp.plan ? `/account?plan=${encodeURIComponent(sp.plan)}` : undefined));
  if (await currentUser()) redirect(next);
  return (
    <div className="card narrow featured cut">
      <h2>Start your {env().TRIAL_DAYS}-day Sorts trial</h2>
      <p className="muted small">No card needed. You can subscribe any time from your account.</p>
      <AuthForm mode="signup" next={next} />
      <p className="small">
        Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`}>Log in</Link>
      </p>
    </div>
  );
}
