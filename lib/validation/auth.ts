import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  password: z.string().min(10, "Password must be at least 10 characters").max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  password: z.string().min(1, "Password is required").max(200),
});
