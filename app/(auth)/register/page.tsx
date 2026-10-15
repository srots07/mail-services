import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { ButtonLink } from "@/components/ui/button";
import { Alert, LoadingState } from "@/components/ui/misc";
import { getSession } from "@/lib/auth/session";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage() {
  if (await getSession()) redirect("/dashboard");
  if (!env().allowRegistration) {
    return (
      <Alert
        tone="warning"
        title="Registration is turned off"
        action={
          <ButtonLink href="/login" size="sm" variant="secondary">
            Sign in instead
          </ButtonLink>
        }
      >
        New accounts cannot be created on this instance. Ask the owner for access.
      </Alert>
    );
  }
  return (
    <Suspense fallback={<LoadingState variant="form" message="Loading registration form" />}>
      <AuthForm mode="register" />
    </Suspense>
  );
}
