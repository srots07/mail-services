import type { OutgoingEmail } from "./provider";

export interface ComposeInput {
  account: { email: string; displayName: string | null };
  contact: { email: string | null; fromPersonName: string | null };
  email: { subject: string; body: string };
  /** Campaign sender profile name; the row's from name takes priority. */
  senderName?: string | null;
  /** Campaign CC list, copied on every email. */
  cc?: string[] | null;
}

/** Single source of truth for the message that is previewed and the message that is sent. */
export function composeOutgoing({ account, contact, email, senderName, cc }: ComposeInput): OutgoingEmail {
  const to = contact.email ?? "";
  return {
    from: { email: account.email, name: contact.fromPersonName?.trim() || senderName?.trim() || account.displayName || null },
    to,
    cc: (cc ?? []).filter((a) => a && a.toLowerCase() !== to.toLowerCase()),
    subject: email.subject,
    body: email.body,
  };
}
