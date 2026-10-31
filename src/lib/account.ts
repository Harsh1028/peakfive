import { z } from "zod";
export const passwordSchema = z.string().min(10, "Use at least 10 characters.").regex(/[a-z]/, "Include a lowercase letter.").regex(/[A-Z]/, "Include an uppercase letter.").regex(/[0-9]/, "Include a number.");
export const signupSchema = z.object({ name: z.string().trim().min(2).max(120), email: z.string().email(), password: passwordSchema, confirm: z.string(), accepted: z.literal(true) }).refine((v) => v.password === v.confirm, { message: "Passwords do not match.", path: ["confirm"] });
export function safeDestination(value: unknown) {
  if (typeof value !== "string" || !/^\/(dashboard|scenarios|settings)(\?|$)/.test(value) || value.includes("\\")) return "/dashboard";
  return value;
}