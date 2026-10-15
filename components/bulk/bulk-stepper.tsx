"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check } from "lucide-react";
import { BULK_STEPS, bulkStepHref } from "@/lib/bulk/steps";
import { cn } from "@/lib/utils";

/**
 * The 7 campaign steps. Without a campaign (the upload page) step 1 is current and later steps are
 * shown but not yet reachable, so numbering is the same everywhere. Connectors follow the Sorts
 * switchback (flat, rise, flat): the campaign climbs toward Results.
 */
export function BulkStepper({ campaignId }: { campaignId: string | null }) {
  const pathname = usePathname();
  const current = campaignId ? BULK_STEPS.findIndex((s) => pathname === bulkStepHref(campaignId, s.slug)) : 0;
  return (
    <nav aria-label="Campaign steps" className="table-scroll -mx-1 overflow-x-auto px-1 pb-1">
      <ol className="flex min-w-max items-center gap-0.5" data-testid="bulk-stepper">
        {BULK_STEPS.map((s, i) => {
          const active = i === current;
          const done = current >= 0 && i < current;
          const body = (
            <>
              <span
                className={cn(
                  "type-badge relative flex h-5 w-5 items-center justify-center rounded-[5px] border transition-colors",
                  active ? "sorts-action border-transparent" : done ? "border-accent/40 bg-accent-soft text-accent-strong" : "border-line-strong bg-panel-2 text-subtle",
                  !active && "sorts-cut [--cut:3px]",
                )}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden /> : i + 1}
              </span>
              {s.label}
              {done && <span className="sr-only"> (done)</span>}
            </>
          );
          const cls = cn(
            "flex h-9 items-center gap-2 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
            active ? "bg-panel-3 text-fg shadow-card" : done ? "text-muted hover:bg-panel-2 hover:text-fg" : "text-subtle hover:bg-panel-2 hover:text-muted",
          );
          return (
            <li key={s.slug} className="flex items-center gap-0.5">
              {i > 0 && (
                <svg aria-hidden viewBox="0 0 20 12" className={cn("h-3 w-4 shrink-0 sm:w-5", done || active ? "text-accent" : "text-line-strong")}>
                  <path d="M0 9.5H7L12 3.5H20" fill="none" stroke="currentColor" strokeWidth="1.25" />
                </svg>
              )}
              {campaignId ? (
                <Link href={bulkStepHref(campaignId, s.slug)} aria-current={active ? "step" : undefined} className={cls}>
                  {body}
                </Link>
              ) : (
                <span aria-current={active ? "step" : undefined} aria-disabled={!active || undefined} className={cn(cls, !active && "cursor-default hover:bg-transparent")}>
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
