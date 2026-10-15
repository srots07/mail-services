"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronRight, LayoutDashboard, List, LogOut, Mail, Menu, PanelLeft, Plus, Rows3, Rows4, Search, Send, Settings } from "lucide-react";
import { LicenseBanner } from "@/components/license/license-notice";
import { SortsLogo, SortsMark } from "@/components/sorts/logo";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { useTheme, type Density } from "@/components/theme/theme-provider";
import { Button, ButtonLink } from "@/components/ui/button";
import { CommandPalette, openCommandPalette, type PaletteCampaign } from "@/components/ui/command-palette";
import { CreditsBadge } from "@/components/dashboard/credits-badge";
import { Tooltip } from "@/components/ui/tooltip";
import { BULK_STEPS } from "@/lib/bulk/steps";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: typeof List; exact: boolean; badge?: "attention" };

/** Grouped by the Sorts workflow: see what matters, run outreach, configure the workspace. */
const GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true }] },
  {
    label: "Outreach",
    items: [
      { href: "/campaigns", label: "Campaigns", icon: List, exact: false, badge: "attention" },
      { href: "/campaigns/new", label: "New campaign", icon: Plus, exact: true },
    ],
  },
  {
    label: "Sending",
    items: [
      { href: "/sending", label: "Delivery & Sent Mail", icon: Send, exact: true },
      { href: "/settings#sending-account", label: "Sending Accounts", icon: Mail, exact: false },
    ],
  },
  { label: "Workspace", items: [{ href: "/settings", label: "Settings", icon: Settings, exact: true }] },
];

const COLLAPSED_KEY = "sidebar-collapsed";
const COLLAPSED_EVENT = "sidebar-collapsed-change";

function subscribeCollapsed(onChange: () => void): () => void {
  window.addEventListener(COLLAPSED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(COLLAPSED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readCollapsed(): boolean {
  return localStorage.getItem(COLLAPSED_KEY) === "1";
}

function subscribeNothing(): () => void {
  return () => {};
}

function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  if (href === "/campaigns" && pathname === "/campaigns/new") return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function crumbsFor(pathname: string, names: Map<string, string>): { href: string; label: string }[] {
  const campaigns = { href: "/campaigns", label: "Campaigns" };
  if (pathname === "/dashboard") return [{ href: "/dashboard", label: "Dashboard" }];
  if (pathname === "/sending") return [{ href: "/sending", label: "Sending & Delivery" }];
  if (pathname === "/settings") return [{ href: "/settings", label: "Settings" }];
  if (pathname === "/campaigns/new") return [campaigns, { href: pathname, label: "New campaign" }];
  const step = pathname.match(/^\/campaigns\/([^/]+)(?:\/bulk\/([^/]+))?$/);
  if (step) {
    const crumbs = [campaigns, { href: `/campaigns/${step[1]}`, label: names.get(step[1]) ?? "Campaign" }];
    if (step[2]) crumbs.push({ href: pathname, label: BULK_STEPS.find((s) => s.slug === step[2])?.label ?? "Step" });
    return crumbs;
  }
  return [campaigns];
}

export function AppShell({
  user,
  mockMode,
  autoLogin,
  providers,
  campaigns,
  attention,
  version,
  children,
}: {
  user: { name: string | null; email: string };
  mockMode: boolean;
  autoLogin: boolean;
  providers: { ai: string; email: string };
  campaigns: PaletteCampaign[];
  /** Campaigns waiting on a decision (review, paused, failures). */
  attention: number;
  /** Display label such as "v2". */
  version: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { density, setDensity, ready } = useTheme();
  const [open, setOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const mac = useSyncExternalStore(subscribeNothing, isMac, () => false);

  function toggleCollapsed() {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "0" : "1");
    window.dispatchEvent(new Event(COLLAPSED_EVENT));
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  const crumbs = crumbsFor(pathname, new Map(campaigns.map((c) => [c.id, c.name])));

  function navLink(item: NavItem, rail: boolean) {
    const active = isActive(pathname, item.href, item.exact);
    const Icon = item.icon;
    const count = item.badge === "attention" ? attention : 0;
    const tip = count ? `${item.label} · ${count} need${count === 1 ? "s" : ""} attention` : item.label;
    return (
      <Tooltip key={item.href} label={tip} side="right" disabled={!rail}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          onClick={() => setOpen(false)}
          className={cn(
            "type-nav group relative flex min-h-10 items-center gap-3 rounded-md transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
            rail ? "justify-center px-0" : "px-3",
            active ? "bg-panel-3 text-fg" : "text-muted hover:bg-panel-2 hover:text-fg",
          )}
        >
          {active && <span aria-hidden className="sorts-tick" />}
          <Icon className={cn("h-4 w-4 shrink-0 transition-colors", active ? "text-accent-strong" : "text-subtle group-hover:text-muted")} strokeWidth={1.75} aria-hidden />
          {rail ? <span className="sr-only">{item.label}</span> : <span className="flex-1 truncate">{item.label}</span>}
          {count > 0 &&
            (rail ? (
              <span aria-hidden className="absolute right-2.5 top-2 h-1.5 w-1.5 rounded-full bg-warning" />
            ) : (
              <span className="type-badge rounded-sm border border-warning/30 bg-warning-soft px-1.5 py-0.5 text-warning">
                {count}
                <span className="sr-only"> need attention</span>
              </span>
            ))}
        </Link>
      </Tooltip>
    );
  }

  function sidebar(rail: boolean, drawer = false) {
    return (
      <div className="flex h-full flex-col">
        <Link
          href="/dashboard"
          onClick={() => setOpen(false)}
          className={cn(
            "flex h-[var(--topbar-h)] shrink-0 items-center border-b border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60",
            rail ? "justify-center px-2" : "px-4",
          )}
          aria-label="Sorts, go to dashboard"
        >
          {rail ? <SortsMark size={28} priority /> : <SortsLogo size={28} tagline="Review-first AI outreach" priority />}
        </Link>
        <nav className={cn("flex-1 space-y-5 p-2.5 pl-3.5", rail ? "overflow-visible pl-2.5" : "overflow-y-auto")} aria-label="Primary">
          {GROUPS.map((group) => (
            <div key={group.label}>
              {rail ? (
                <span className="mx-auto mb-2 block h-px w-6 bg-line" aria-hidden />
              ) : (
                <p className="type-mono-label mb-1.5 px-3 text-subtle">{group.label}</p>
              )}
              <div className="space-y-0.5">{group.items.map((item) => navLink(item, rail))}</div>
            </div>
          ))}
        </nav>
        {drawer && (
          <div className="border-t border-line p-3">
            <ButtonLink href="/campaigns/new" variant="primary" className="w-full" onClick={() => setOpen(false)}>
              <Plus aria-hidden />
              New campaign
            </ButtonLink>
          </div>
        )}
        <div className="border-t border-line p-2.5">
          <div className={cn("flex items-center gap-2 rounded-md py-1.5", rail ? "flex-col justify-center px-0" : "px-2")}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line-strong bg-panel-3 text-xs font-semibold text-accent-strong" aria-hidden>
              {(user.name ?? user.email).slice(0, 1).toUpperCase()}
            </span>
            {!rail && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-fg">{user.name ?? "Your account"}</p>
                <p className="type-hint truncate text-muted">{user.email}</p>
              </div>
            )}
            {!autoLogin && (
              <Tooltip label="Sign out" side="right" disabled={!rail}>
                <Button variant="ghost" size="icon-sm" onClick={logout} aria-label="Sign out">
                  <LogOut strokeWidth={1.75} />
                </Button>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[var(--z-palette)] focus:rounded-md focus:bg-panel-3 focus:px-3 focus:py-2 focus:text-sm focus:text-fg">
        Skip to content
      </a>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[var(--z-shell)] hidden border-r border-line bg-panel/95 backdrop-blur transition-[width] duration-200 motion-reduce:transition-none lg:block",
          collapsed ? "w-[var(--sidebar-rail-w)]" : "w-[var(--sidebar-w)]",
        )}
        aria-label="Sidebar"
      >
        {sidebar(collapsed)}
      </aside>
      {open && (
        <div className="fixed inset-0 z-[var(--z-overlay)] lg:hidden">
          <button type="button" className="modal-backdrop absolute inset-0 bg-overlay" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="modal-panel absolute inset-y-0 left-0 w-[min(18rem,85vw)] border-r border-line bg-panel" aria-label="Sidebar">
            {sidebar(false, true)}
          </aside>
        </div>
      )}
      <div className={cn("flex min-h-screen flex-col transition-[padding] duration-200 motion-reduce:transition-none", collapsed ? "lg:pl-[var(--sidebar-rail-w)]" : "lg:pl-[var(--sidebar-w)]")}>
        <header className="sticky top-0 z-20 flex h-[var(--topbar-h)] items-center gap-2 border-b border-line bg-canvas/80 px-3 backdrop-blur sm:gap-3 sm:px-4">
          <span className="contents lg:hidden">
            <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu strokeWidth={1.75} />
            </Button>
            <Link href="/dashboard" aria-label="Sorts, go to dashboard" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 sm:hidden">
              <SortsMark size={24} />
            </Link>
          </span>
          <span className="hidden lg:contents">
            <Button variant="ghost" size="icon-sm" onClick={toggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-pressed={collapsed}>
              <PanelLeft strokeWidth={1.75} />
            </Button>
          </span>
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="hidden min-w-0 items-center gap-1 text-sm text-muted sm:flex">
              {crumbs.map((crumb, index) => {
                const last = index === crumbs.length - 1;
                return (
                  <li key={crumb.href} className={cn("min-w-0 items-center gap-1", last ? "flex" : "hidden sm:flex")}>
                    {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />}
                    {last ? (
                      <span className="truncate font-medium text-fg" aria-current="page">
                        {crumb.label}
                      </span>
                    ) : (
                      <Link href={crumb.href} className="truncate transition-colors hover:text-fg">
                        {crumb.label}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
          <button
            type="button"
            onClick={openCommandPalette}
            className="flex h-9 items-center gap-2 rounded-md border border-line-strong bg-panel-2 px-2.5 text-xs text-muted transition-colors hover:border-accent/40 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 sm:min-w-48"
            aria-label="Search pages, campaigns and actions"
            aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
          >
            <Search className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            <span className="hidden flex-1 text-left sm:inline">Search Sorts</span>
            <kbd className="type-badge hidden rounded border border-line-strong bg-panel px-1 text-subtle sm:inline">{mac ? "⌘K" : "Ctrl K"}</kbd>
          </button>
          <CreditsBadge />
          <DensityControl density={ready ? density : "comfortable"} onChange={setDensity} />
          <ThemeSwitcher compact />
        </header>
        {mockMode && (
          <div className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning-soft px-4 py-2 text-center text-xs text-warning" role="status">
            <span className="led" aria-hidden />
            <span>
              Test mode: AI output and sends are simulated, nothing reaches a real inbox.{" "}
              <Link href="/settings" className="font-medium underline underline-offset-2">
                Connect real providers
              </Link>
            </span>
          </div>
        )}
        <LicenseBanner />
        <main id="main" className="mx-auto w-full max-w-[var(--content-max)] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
        <StatusBar providers={providers} version={version} />
      </div>
      <CommandPalette campaigns={campaigns} />
    </div>
  );
}

const PROVIDER_NAMES: Record<string, string> = { mock: "Test mode", openrouter: "OpenRouter", gmail: "Gmail" };

function StatusBar({ providers, version }: { providers: { ai: string; email: string }; version: string }) {
  const items = [
    { label: "AI drafting", value: providers.ai },
    { label: "Sending", value: providers.email },
  ];
  return (
    <footer className="border-t border-line bg-panel/60 px-4 sm:px-6 lg:px-8" aria-label="Sorts system status">
      <div className="type-caption mx-auto flex min-h-9 w-full max-w-[var(--content-max)] flex-wrap items-center gap-x-5 gap-y-1 py-1.5 text-subtle">
        {items.map((item) => {
          const live = item.value !== "mock";
          return (
            <span key={item.label} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn("led", live ? "text-success" : "text-warning")} />
              {item.label}
              <span className={live ? "text-fg" : "text-warning"}>{PROVIDER_NAMES[item.value] ?? item.value}</span>
            </span>
          );
        })}
        <Link href="/settings" className="transition-colors hover:text-fg">
          Manage providers
        </Link>
        <span className="type-data ml-auto inline-flex items-center gap-1.5" title="Sorts version">
          <SortsMark size={12} />
          Sorts {version}
        </span>
      </div>
    </footer>
  );
}

function DensityControl({ density, onChange }: { density: Density; onChange: (density: Density) => void }) {
  const options = [
    { key: "comfortable" as const, label: "Comfortable rows", icon: Rows3 },
    { key: "compact" as const, label: "Compact rows", icon: Rows4 },
  ];
  return (
    <div className="hidden items-center rounded-md border border-line bg-panel-2 p-0.5 md:inline-flex" role="radiogroup" aria-label="Row density">
      {options.map(({ key, label, icon: Icon }) => (
        <Tooltip key={key} label={label}>
          <button
            type="button"
            role="radio"
            aria-checked={density === key}
            aria-label={label}
            onClick={() => onChange(key)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
              density === key ? "bg-panel text-fg shadow-card" : "text-muted hover:text-fg",
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
