import { z } from "zod";

export const idsSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).max(10_000).optional(),
  all: z.boolean().optional(),
});

export const editEmailSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, "Subject is required")
    .max(250)
    .refine((s) => !/[\r\n]/.test(s), "Subject cannot contain line breaks"),
  body: z.string().trim().min(1, "Body is required").max(20_000),
  approve: z.boolean().optional(),
});

export const testEmailSchema = z.object({
  campaignContactId: z.string().min(1).max(64),
  to: z.string().trim().toLowerCase().email("Enter a valid test email address").max(254),
});

export const MAX_INTERVAL_SECONDS = 24 * 60 * 60;

export const resumeSchema = z.object({
  confirm: z.literal(true, { message: "You must confirm before sending." }),
  intervalSeconds: z.number().int().min(1).max(MAX_INTERVAL_SECONDS).optional(),
});

export const providerSettingsSchema = z.object({
  ai: z.enum(["openrouter", "groq", "mock"]).optional(),
  email: z.enum(["gmail", "mock"]).optional(),
  research: z.enum(["live", "mock"]).optional(),
});
