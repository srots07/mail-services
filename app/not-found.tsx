import type { Metadata } from "next";
import { SortsAmbient } from "@/components/sorts/ambient";
import { SortsLogo } from "@/components/sorts/logo";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-canvas px-4 text-center">
      <SortsAmbient fade="radial" />
      <div className="relative mb-8">
        <SortsLogo size={32} priority />
      </div>
      <div className="sorts-surface sorts-edge sorts-cut sorts-cut-accent relative max-w-md rounded-lg border border-line px-8 py-8 shadow-card">
        <p className="type-mono-label flex items-center justify-center gap-2 text-warning">
          <span className="led" aria-hidden />
          Error 404
        </p>
        <h1 className="type-h1 mt-3 text-fg">This page doesn&apos;t exist</h1>
        <p className="type-body mt-2 text-muted">The link may be out of date, or the campaign was deleted or belongs to another account.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <ButtonLink href="/dashboard" variant="primary">
            Go to dashboard
          </ButtonLink>
          <ButtonLink href="/campaigns">View campaigns</ButtonLink>
        </div>
      </div>
    </main>
  );
}
