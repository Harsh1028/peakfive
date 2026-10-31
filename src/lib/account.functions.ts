import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateRequest, type OptimizeRequest } from "./peakfive-api";
import type { Json } from "@/integrations/supabase/types";

export const getAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .single();
    if (error) throw new Error("Your profile could not be loaded.");
    const deletion = await context.supabase
      .from("account_deletion_requests")
      .select("requested_at,status")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { profile: data, deletion: deletion.data };
  });
export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ display_name: z.string().trim().min(2).max(120) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("profiles").update(data).eq("id", context.userId);
    if (error) throw new Error("Profile update failed.");
    return { ok: true };
  });
export const acceptTerms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ terms_version: "draft-2026-10-31", terms_accepted_at: new Date().toISOString() })
      .eq("id", context.userId);
    if (error) throw new Error("Acknowledgement could not be saved.");
    return { ok: true };
  });
export const listScenarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("saved_scenarios")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Saved scenarios could not be loaded.");
    return data ?? [];
  });
export const saveScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; description: string; inputs: OptimizeRequest }) => {
    const metadata = z
      .object({ name: z.string().trim().min(1).max(120), description: z.string().max(2000) })
      .parse(input);
    return { ...metadata, inputs: validateRequest(input.inputs) };
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("saved_scenarios")
      .insert({ ...data, inputs: data.inputs as unknown as Json, user_id: context.userId })
      .select("id")
      .single();
    if (error)
      throw new Error("Scenario could not be saved. Confirm the account acknowledgement first.");
    return row;
  });
export const deleteScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("saved_scenarios")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Scenario could not be deleted.");
    return { ok: true };
  });
export const requestAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ confirmation: z.literal("DELETE") }))
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("account_deletion_requests")
      .insert({ user_id: context.userId });
    if (error && error.code !== "23505")
      throw new Error("Deletion request could not be submitted.");
    return { ok: true };
  });
