import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { LoadingState } from "@/components/ui/misc";
import { getSession } from "@/lib/auth/session";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  if (env().autoLogin) redirect("/api/auth/auto");
  return (
    <Suspense fallback={<LoadingState variant="form" message="Loading sign-in form" />}>
      <AuthForm mode="login" />
    </Suspense>
  );
}
