"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ComponentType } from "react";
import { CornerDownLeft, LayoutDashboard, List, Monitor, Moon, Plus, Search, Send, Settings, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";

type Command = {
  id: string;
  label: string;
  group: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  run: () => void;
};

export const PALETTE_EVENT = "command-palette-open";

export function openCommandPalette() {
  window.dispatchEvent(new Event(PALETTE_EVENT));
}

export interface PaletteCampaign {
  id: string;
  name: string;
}

export function CommandPalette({ campaigns = [] }: { campaigns?: PaletteCampaign[] }) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const listId = useId();

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href);
    return [
      { id: "dashboard", label: "Dashboard", group: "Go to", icon: LayoutDashboard, run: go("/dashboard") },
      { id: "campaigns", label: "Campaigns", group: "Go to", icon: List, run: go("/campaigns") },
      { id: "settings", label: "Settings", group: "Go to", icon: Settings, run: go("/settings") },
      { id: "new-campaign", label: "Start a new campaign", group: "Actions", icon: Plus, run: go("/campaigns/new") },
      ...campaigns.map((c) => ({ id: `c-${c.id}`, label: c.name, group: "Campaigns", icon: Send, run: go(`/campaigns/${c.id}`) })),
      { id: "theme-dark", label: "Dark theme", group: "Appearance", icon: Moon, run: () => setTheme("dark") },
      { id: "theme-light", label: "Light theme", group: "Appearance", icon: Sun, run: () => setTheme("light") },
      { id: "theme-system", label: "Match system theme", group: "Appearance", icon: Monitor, run: () => setTheme("system") },
    ];
  }, [router, setTheme, campaigns]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? commands.filter((c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)) : commands;
  }, [commands, query]);

  const openRef = useRef(false);

  useEffect(() => {
    function show() {
      if (openRef.current) return;
      openRef.current = true;
      restoreRef.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setIndex(0);
      setOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (openRef.current) {
          openRef.current = false;
          setOpen(false);
        } else show();
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(PALETTE_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(PALETTE_EVENT, show);
    };
  }, []);

  function close(restore = true) {
    openRef.current = false;
    setOpen(false);
    if (restore) restoreRef.current?.focus?.();
  }

  if (!open) return null;

  function run(command: Command | undefined) {
    if (!command) return;
    close(false);
    command.run();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(results[index]);
    } else if (event.key === "Tab") {
      event.preventDefault();
    }
  }

  let lastGroup = "";
  const activeId = results[index] ? `${listId}-${results[index].id}` : undefined;

  return (
    <div className="modal-backdrop fixed inset-0 z-[var(--z-palette)] flex items-start justify-center bg-overlay p-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={() => close()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        className="modal-panel sorts-surface sorts-edge w-full max-w-lg overflow-hidden rounded-lg border border-line-strong shadow-lift"
      >
        <div className="relative flex items-center gap-2 border-b border-line px-4">
          <Search className="h-4 w-4 text-subtle" strokeWidth={1.75} aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            placeholder="Search pages, campaigns and actions"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            className="h-12 flex-1 bg-transparent text-sm text-fg placeholder:text-subtle focus:outline-none"
          />
          <kbd className="rounded border border-line-strong px-1.5 py-0.5 type-badge text-subtle">ESC</kbd>
        </div>
        <ul id={listId} role="listbox" aria-label="Commands" className="relative max-h-80 overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center">
              <p className="text-sm text-fg">Nothing matches &ldquo;{query}&rdquo;</p>
              <p className="type-caption mt-1 text-muted">Try a page name, a campaign name or &ldquo;theme&rdquo;.</p>
            </li>
          )}
          {results.map((command, i) => {
            const header = command.group !== lastGroup ? command.group : null;
            lastGroup = command.group;
            const Icon = command.icon;
            const selected = i === index;
            return (
              <li key={command.id} role="presentation">
                {header && <p className="type-mono-label px-3 pb-1 pt-2 text-subtle">{header}</p>}
                <div
                  id={`${listId}-${command.id}`}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => run(command)}
                  className={cn(
                    "flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-sm",
                    selected ? "bg-accent-soft text-fg" : "text-muted",
                  )}
                >
                  <Icon className={cn("h-4 w-4", selected && "text-accent")} strokeWidth={1.75} />
                  <span className="flex-1">{command.label}</span>
                  {selected && <CornerDownLeft className="h-3.5 w-3.5 text-subtle" strokeWidth={1.75} aria-hidden />}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="type-caption flex items-center gap-4 border-t border-line px-4 py-2 text-subtle" aria-hidden>
          <span>↑↓ to move</span>
          <span>Enter to open</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
