import { normalizeHeader } from "@/lib/csv/fields";

/** Columns of a contact file. Every other column is kept as extra data the AI may use. */
export const BULK_FIELDS = [
  { key: "company_name", label: "Company Name", required: true, aliases: ["company_name", "company", "organization", "organisation", "org", "account", "business", "customer_company"] },
  {
    key: "to_name",
    label: "To Name",
    required: true,
    aliases: ["to_name", "to", "to_person_name", "to_person", "customer_name", "customer", "name", "contact_name", "full_name", "first_name", "recipient_name", "recipient", "person", "contact"],
  },
  { key: "from_name", label: "From Name", required: false, aliases: ["from_name", "from", "from_person_name", "from_person", "sender_name", "sender", "sent_by"] },
  { key: "email", label: "Email", required: true, aliases: ["email", "email_address", "e_mail", "mail", "mail_id", "to_email", "recipient_email", "customer_email", "email_id"] },
] as const;

export type BulkFieldKey = (typeof BULK_FIELDS)[number]["key"];
export type BulkMapping = Record<BulkFieldKey, string>;

export const BULK_HEADER_ALIASES: ReadonlySet<string> = new Set(BULK_FIELDS.flatMap((f) => f.aliases as readonly string[]));

export function emptyBulkMapping(): BulkMapping {
  return { company_name: "", to_name: "", from_name: "", email: "" };
}

/** Header -> field by alias priority; one column is never used for two fields. */
export function autoMapBulkColumns(headers: string[]): BulkMapping {
  const mapping = emptyBulkMapping();
  const used = new Set<string>();
  for (const field of BULK_FIELDS) {
    for (const alias of field.aliases as readonly string[]) {
      const match = headers.find((h) => !used.has(h) && normalizeHeader(h) === alias);
      if (match) {
        mapping[field.key] = match;
        used.add(match);
        break;
      }
    }
  }
  return mapping;
}

/** Only keeps mappings to headers that exist in the file. */
export function sanitizeBulkMapping(raw: Partial<Record<string, unknown>> | undefined, headers: string[]): BulkMapping {
  const mapping = emptyBulkMapping();
  for (const f of BULK_FIELDS) {
    const v = raw?.[f.key];
    if (typeof v === "string" && headers.includes(v)) mapping[f.key] = v;
  }
  return mapping;
}
