export const BULK_STEPS = [
  { slug: "contacts", label: "Contacts" },
  { slug: "template", label: "Email body" },
  { slug: "sender", label: "Sender & CC" },
  { slug: "generate", label: "Generate" },
  { slug: "review", label: "Review" },
  { slug: "send", label: "Send" },
  { slug: "results", label: "Results" },
] as const;

export type BulkStepSlug = (typeof BULK_STEPS)[number]["slug"];

export function isBulkStep(s: string): s is BulkStepSlug {
  return BULK_STEPS.some((x) => x.slug === s);
}

export function bulkStepHref(campaignId: string, slug: BulkStepSlug): string {
  return `/campaigns/${campaignId}/bulk/${slug}`;
}

export function bulkStepCode(slug: BulkStepSlug): string {
  return `Step ${BULK_STEPS.findIndex((s) => s.slug === slug) + 1} of ${BULK_STEPS.length}`;
}

export function nextBulkStep(slug: BulkStepSlug): BulkStepSlug | null {
  const i = BULK_STEPS.findIndex((s) => s.slug === slug);
  return BULK_STEPS[i + 1]?.slug ?? null;
}
