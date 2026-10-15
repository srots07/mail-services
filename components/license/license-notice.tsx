"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { api } from "@/lib/client/api";
import type { LicenseState } from "@/lib/license-verify";

export type LicenseInfo = LicenseState & { message: string; portalUrl: string | null; desktop: boolean };

/** Subscription state, re-checked when the window regains focus (the desktop shell refreshes license.json). */
export function useLicense(): { license: LicenseInfo | null; reload: () => void } {
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const reload = useCallback(() => {
    api<LicenseInfo>("/api/license")
      .then(setLicense)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    const t = setTimeout(reload, 0);
    window.addEventListener("focus", reload);
    return () => {
      clearTimeout(t);
      window.removeEventListener("focus", reload);
    };
  }, [reload]);
  return { license, reload };
}

function daysLeft(until: string | null): number {
  if (!until) return 0;
  return Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 86_400_000));
}

function needsConnect(license: LicenseInfo): boolean {
  return license.desktop && (license.state === "missing" || license.state === "invalid");
}

function LicenseActions({ license, size = "sm" }: { license: LicenseInfo; size?: "sm" | "md" }) {
  return (
    <>
      {needsConnect(license) && (
        // A real navigation (not client routing): the desktop window intercepts it to open its Connect dialog.
        <a href="/desktop/connect-account" className={buttonClasses({ variant: "primary", size })} data-testid="license-connect">
          Connect account
        </a>
      )}
      {license.portalUrl && !needsConnect(license) && (
        <a
          href={`${license.portalUrl}/account`}
          target="_blank"
          rel="noreferrer"
          className={buttonClasses({ variant: license.state === "trial" ? "secondary" : "primary", size })}
          data-testid="license-subscribe"
        >
          Subscribe
        </a>
      )}
    </>
  );
}

/** Thin bar under the header: trial countdown, or why sending is locked. */
export function LicenseBanner() {
  const { license } = useLicense();
  if (!license?.required || license.state === "active") return null;
  if (license.state === "trial") {
    const days = daysLeft(license.until);
    return (
      <div className="flex flex-wrap items-center justify-center gap-3 border-b border-info/30 bg-info-soft px-4 py-1.5 text-center text-xs text-info" role="status" data-testid="license-banner">
        <span>
          Free trial: {days} day{days === 1 ? "" : "s"} left.
        </span>
        <LicenseActions license={license} />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 border-b border-danger/30 bg-danger-soft px-4 py-1.5 text-center text-xs text-danger" role="alert" data-testid="license-banner">
      <span>Sending is locked. {license.message}</span>
      <LicenseActions license={license} />
    </div>
  );
}

/** Shown in the Send step instead of letting the user start a send that the server would refuse. */
export function LicenseLock({ license, onRecheck }: { license: LicenseInfo; onRecheck: () => void }) {
  return (
    <Alert
      tone="danger"
      title="A subscription is needed to send"
      action={
        <>
          <LicenseActions license={license} />
          <Button size="sm" variant="ghost" onClick={onRecheck}>
            Check again
          </Button>
        </>
      }
    >
      {license.message} Everything else (contacts, generating and reviewing emails) keeps working.
    </Alert>
  );
}
