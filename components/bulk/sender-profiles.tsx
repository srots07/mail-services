"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";

export interface SenderProfileView {
  id: string;
  label: string;
  senderName: string;
  designation: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  isDefault: boolean;
}

type Draft = Omit<SenderProfileView, "id" | "isDefault"> & { isDefault: boolean };

const EMPTY: Draft = { label: "", senderName: "", designation: "", companyName: "", email: "", phone: "", website: "", isDefault: false };

/** Reusable sender details. Sender values are the same for every email of a campaign. */
export function SenderProfiles({
  selectedId,
  onSelect,
  onChange,
  hideConnectHint,
}: {
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onChange?: () => void;
  hideConnectHint?: boolean;
}) {
  const toast = useToast();
  const [profiles, setProfiles] = useState<SenderProfileView[] | null>(null);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ profiles: SenderProfileView[]; connectedEmail: string | null }>("/api/sender-profiles");
    setProfiles(r.profiles);
    setConnectedEmail(r.connectedEmail);
    return r.profiles;
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      load()
        .then((list) => {
          if (list.length === 0) setEditing({ id: null, draft: { ...EMPTY, isDefault: true } });
        })
        .catch(() => setProfiles([]));
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      const body = { ...editing.draft, label: editing.draft.label || undefined };
      const saved = editing.id
        ? await api<SenderProfileView>(`/api/sender-profiles/${editing.id}`, { method: "PUT", body })
        : await api<SenderProfileView>("/api/sender-profiles", { body });
      toast.success("Sender profile saved");
      setEditing(null);
      await load();
      onChange?.();
      if (onSelect && (!selectedId || !editing.id)) onSelect(saved.id);
    } catch (err) {
      toast.error("Could not save", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault(p: SenderProfileView) {
    try {
      await api(`/api/sender-profiles/${p.id}`, { method: "PUT", body: { ...p, isDefault: true } });
      await load();
      onChange?.();
    } catch (err) {
      toast.error("Could not update", err instanceof Error ? err.message : undefined);
    }
  }

  async function remove(p: SenderProfileView) {
    if (!window.confirm(`Delete sender profile "${p.label}"?`)) return;
    try {
      await api(`/api/sender-profiles/${p.id}`, { method: "DELETE" });
      await load();
      onChange?.();
    } catch (err) {
      toast.error("Could not delete", err instanceof Error ? err.message : undefined);
    }
  }

  const set = (k: keyof Draft, v: string | boolean) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, [k]: v } } : e));

  return (
    <div className="space-y-4">
      {profiles && profiles.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line" data-testid="sender-profiles">
          {profiles.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              {onSelect && <input type="radio" name="sender-profile" aria-label={`Use ${p.label}`} checked={selectedId === p.id} onChange={() => onSelect(p.id)} style={{ accentColor: "var(--accent)" }} />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {p.senderName}
                  {p.designation && <span className="text-muted">, {p.designation}</span>}
                  {p.isDefault && (
                    <Badge tone="accent" className="ml-2">
                      Default
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted">{[p.companyName, p.email ?? connectedEmail, p.phone, p.website].filter(Boolean).join(" | ")}</p>
              </div>
              <div className="flex gap-1.5">
                {!p.isDefault && (
                  <Button size="sm" variant="ghost" onClick={() => void makeDefault(p)}>
                    Make default
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setEditing({ id: p.id, draft: { ...EMPTY, ...p, designation: p.designation ?? "", companyName: p.companyName ?? "", email: p.email ?? "", phone: p.phone ?? "", website: p.website ?? "" } })}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(p)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <div className="space-y-3 rounded-lg border border-line p-4">
          <p className="text-sm font-medium">{editing.id ? "Edit sender profile" : "New sender profile"}</p>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
            <Field label="Your name *" htmlFor="sp-name">
              <Input id="sp-name" value={editing.draft.senderName} onChange={(e) => set("senderName", e.target.value)} />
            </Field>
            <Field label="Designation" htmlFor="sp-designation">
              <Input id="sp-designation" value={editing.draft.designation ?? ""} onChange={(e) => set("designation", e.target.value)} />
            </Field>
            <Field label="Company" htmlFor="sp-company">
              <Input id="sp-company" value={editing.draft.companyName ?? ""} onChange={(e) => set("companyName", e.target.value)} />
            </Field>
            <Field label="Email" htmlFor="sp-email" hint={connectedEmail ? `Leave empty to use ${connectedEmail}` : undefined}>
              <Input id="sp-email" type="email" value={editing.draft.email ?? ""} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Phone" htmlFor="sp-phone">
              <Input id="sp-phone" value={editing.draft.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Website" htmlFor="sp-website">
              <Input id="sp-website" value={editing.draft.website ?? ""} onChange={(e) => set("website", e.target.value)} />
            </Field>
            <Field label="Profile label" htmlFor="sp-label" hint="Optional, e.g. 'Sales India'">
              <Input id="sp-label" value={editing.draft.label} onChange={(e) => set("label", e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <Checkbox checked={editing.draft.isDefault} onChange={(e) => set("isDefault", e.target.checked)} />
              Default profile
            </label>
          </div>
          <div className="flex justify-end gap-2">
            {profiles && profiles.length > 0 && (
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            )}
            <Button variant="primary" loading={busy} disabled={!editing.draft.senderName.trim()} onClick={() => void save()} data-testid="sender-save">
              Save profile
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setEditing({ id: null, draft: { ...EMPTY } })}>Add sender profile</Button>
      )}
      {!connectedEmail && !hideConnectHint && <Alert tone="info">Connect Gmail in Settings so emails are sent from your account.</Alert>}
    </div>
  );
}
