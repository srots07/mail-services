import { z } from "zod";
import { MAX_BULK_ROWS } from "@/lib/bulk/validate";
import { isValidEmail } from "@/lib/csv/validate";

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const senderProfileSchema = z.object({
  label: z.string().trim().max(100).optional(),
  senderName: z.string().trim().min(1, "Sender name is required").max(200),
  designation: optText(200),
  companyName: optText(200),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || isValidEmail(v), "Enter a valid sender email"),
  phone: optText(60),
  website: optText(500),
  isDefault: z.boolean().optional(),
});

export const MAX_CC = 10;

export const ccEmailsSchema = z
  .array(z.string().trim().toLowerCase().max(254))
  .max(MAX_CC, `At most ${MAX_CC} CC addresses`)
  .transform((list) => [...new Set(list.filter(Boolean))])
  .refine((list) => list.every(isValidEmail), "Every CC address must be a valid email");

export const templateSchema = z.object({
  name: z.string().trim().min(1, "Template name is required").max(200),
  body: z.string().max(30000).refine((b) => b.trim().length > 0, "The email body is empty"),
  subjectMode: z.enum(["FIXED", "AI"]).default("FIXED"),
  subjectTemplate: optText(300),
  senderProfileId: z.string().max(64).optional().nullable(),
  aiPersonalization: z.boolean().default(false),
  aiInstructions: optText(10000),
  productLineFallback: optText(300),
  ccEmails: ccEmailsSchema.optional(),
});

const rowSchema = z.record(z.string().max(200), z.string().max(50000));
const mappingSchema = z.object({
  company_name: z.string().max(200).default(""),
  to_name: z.string().max(200).default(""),
  from_name: z.string().max(200).default(""),
  email: z.string().max(200).default(""),
});

export const bulkCheckSchema = z.object({
  headers: z.array(z.string().max(200)).min(1).max(100),
  rows: z.array(rowSchema).min(1, "The file has no rows").max(MAX_BULK_ROWS),
  mapping: mappingSchema.optional(),
});

export const bulkImportSchema = bulkCheckSchema.extend({
  campaignName: z.string().trim().min(1, "Campaign name is required").max(200),
  fileName: z.string().max(255).optional(),
  templateId: z.string().max(64).optional().nullable(),
});

/** Omitted = unchanged; empty string = cleared. */
const patchText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? v : null));

export const bulkSettingsSchema = z.object({
  bulkBody: z.string().max(30000).optional(),
  subjectMode: z.enum(["FIXED", "AI"]).optional(),
  subjectTemplate: patchText(300),
  aiPersonalization: z.boolean().optional(),
  aiInstructions: patchText(10000),
  productLineFallback: patchText(300),
  senderProfileId: z.string().max(64).optional().nullable(),
  templateId: z.string().max(64).optional().nullable(),
  ccEmails: ccEmailsSchema.optional(),
});

export const recipientEmailSchema = z.object({ email: z.string().trim().toLowerCase().min(3).max(254) });

export const bulkSendSchema = z.object({
  confirmText: z.string().max(100),
  expectedCount: z.number().int().min(0).max(MAX_BULK_ROWS).optional(),
  startMode: z.enum(["now", "at"]).default("now"),
  date: z.string().max(10).optional(),
  time: z.string().max(5).optional(),
  timezone: z.string().max(100).optional(),
  intervalSeconds: z.number().int().min(1).max(3600).default(30),
});
