"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { composeOutgoing } from "@/lib/email/compose";
import { cn } from "@/lib/utils";

export interface PreviewAccount {
  email: string;
  displayName: string | null;
  provider: string;
}

export interface PreviewProps {
  account: PreviewAccount | null;
  contact: { email: string | null; fromPersonName: string | null; toPersonName?: string | null };
  email: { subject: string; body: string };
  senderName?: string | null;
  cc?: string[] | null;
}

function initials(s: string): string {
  return s
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/**
 * Renders the exact plain-text message that will be sent. Content is rendered as React text
 * nodes (never as HTML), so generated or edited content cannot inject markup or scripts.
 */
export function EmailPreview({ account, contact, email, senderName, cc }: PreviewProps) {
  const [mode, setMode] = useState<"desktop" | "mobile">("desktop");
  const msg = composeOutgoing({
    account: account ?? { email: "not-connected@sender", displayName: null },
    contact: { email: contact.email, fromPersonName: contact.fromPersonName },
    email,
    senderName,
    cc,
  });
  const fromLabel = msg.from.name ? `${msg.from.name} <${msg.from.email}>` : msg.from.email;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-line-strong bg-panel-2 p-0.5">
          {(["desktop", "mobile"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn("rounded-md px-3 py-1 text-xs capitalize", mode === m ? "bg-accent text-on-accent font-semibold" : "text-muted hover:text-fg")}
            >
              {m} preview
            </button>
          ))}
        </div>
        {!account && <Badge tone="warning">No sender connected - From shown as placeholder</Badge>}
        {account?.provider === "MOCK" && <Badge tone="warning">Test sender (not delivered)</Badge>}
      </div>

      <div className={cn("mx-auto transition-all", mode === "mobile" ? "max-w-[380px]" : "max-w-none")}>
        <div className={cn("overflow-hidden border border-zinc-300 bg-white text-zinc-900 shadow-lg", mode === "mobile" ? "rounded-[28px] border-[6px] border-zinc-800" : "rounded-xl")}>
          {mode === "mobile" && <div className="mx-auto mt-2 h-1.5 w-20 rounded-full bg-zinc-300" />}
          <div className={cn("border-b border-zinc-200", mode === "mobile" ? "px-4 py-3" : "px-6 py-4")}>
            <h2 className={cn("font-semibold leading-snug text-zinc-900", mode === "mobile" ? "text-base" : "text-xl")}>{msg.subject}</h2>
            <div className="mt-3 flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-blue text-xs font-semibold text-white">
                {initials(msg.from.name ?? msg.from.email)}
              </div>
              <div className="min-w-0 text-xs leading-relaxed text-zinc-600">
                <p className="truncate">
                  <span className="font-medium text-zinc-500">From: </span>
                  <span className="text-zinc-900">{fromLabel}</span>
                </p>
                <p className="truncate">
                  <span className="font-medium text-zinc-500">To: </span>
                  <span className="text-zinc-900">{msg.to}</span>
                </p>
                {msg.cc && msg.cc.length > 0 && (
                  <p className="truncate" data-testid="preview-cc">
                    <span className="font-medium text-zinc-500">Cc: </span>
                    <span className="text-zinc-900">{msg.cc.join(", ")}</span>
                  </p>
                )}
                <p className="truncate">
                  <span className="font-medium text-zinc-500">Subject: </span>
                  {msg.subject}
                </p>
              </div>
            </div>
          </div>
          <div
            className={cn(
              "whitespace-pre-wrap break-words font-[Arial,Helvetica,sans-serif] leading-relaxed text-zinc-800",
              mode === "mobile" ? "px-4 py-4 text-sm" : "px-6 py-6 text-[0.9375rem]",
            )}
          >
            {msg.body}
          </div>
        </div>
      </div>
      <p className="text-center type-hint text-subtle">Sent as plain text (UTF-8). What you see here is exactly what the recipient receives.</p>
    </div>
  );
}
