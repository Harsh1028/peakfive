import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
const idSchema = z.object({ id: z.string().uuid() });
export const listAiChats = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.from("ai_conversations").select("id,title,updated_at").eq("user_id", context.userId).order("updated_at", { ascending: false }).limit(100);
  if (error) throw new Error("Conversation history could not be loaded.");
  return data ?? [];
});
export const createAiChat = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.from("ai_conversations").insert({ user_id: context.userId }).select("id").single();
  if (error) throw new Error("Conversation could not be created.");
  return data;
});
export const loadAiChat = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator(idSchema).handler(async ({ data, context }) => {
  const { data: row, error } = await context.supabase.from("ai_conversations").select("*").eq("id", data.id).eq("user_id", context.userId).single();
  if (error) throw new Error("Conversation not found or unavailable to this account.");
  return row;
});
export const deleteAiChat = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(idSchema).handler(async ({ data, context }) => {
  const { error } = await context.supabase.from("ai_conversations").delete().eq("id", data.id).eq("user_id", context.userId);
  if (error) throw new Error("Conversation could not be deleted.");
  return { ok: true };
});
export const clearAiChat = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(idSchema).handler(async ({ data, context }) => {
  const { data: row, error } = await context.supabase.from("ai_conversations").select("revision").eq("id", data.id).eq("user_id", context.userId).single();
  if (error) throw new Error("Conversation unavailable.");
  const update = await context.supabase.from("ai_conversations").update({ messages: [], revision: row.revision + 1, updated_at: new Date().toISOString() }).eq("id", data.id).eq("user_id", context.userId).eq("revision", row.revision).select("id").single();
  if (update.error) throw new Error("Conversation changed; reopen before clearing.");
  return { ok: true };
});
export const saveStoppedAiMessage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid(), messageId: z.string().max(100), text: z.string().max(30000) })).handler(async ({ data, context }) => {
  const { data: row, error } = await context.supabase.from("ai_conversations").select("messages,revision").eq("id", data.id).eq("user_id", context.userId).single();
  if (error || !Array.isArray(row.messages)) throw new Error("Stopped response could not be saved.");
  const messages = row.messages as Json[];
  if (messages.some(m => m && typeof m === "object" && !Array.isArray(m) && m.id === data.messageId)) return { ok: true };
  const saved = await context.supabase.from("ai_conversations").update({ messages: [...messages, { id: data.messageId, role: "assistant", parts: [{ type: "text", text: data.text + "\n\n_Stopped._" }] }], updated_at: new Date().toISOString() }).eq("id", data.id).eq("user_id", context.userId).eq("revision", row.revision).select("id").single();
  if (saved.error) throw new Error("Stopped response could not be saved.");
  return { ok: true };
});