import { createClient } from "@supabase/supabase-js";
import { convertToModelMessages, validateUIMessages, type UIMessage } from "ai";
import { z } from "zod";
import { createResponsesCall } from "./responses.server";
import { withLovableAiGatewayRunIdHeader } from "./run-id";
import { ADVISOR_INSTRUCTIONS, validateAdvisorContext } from "./context";
import type { Database, Json } from "@/integrations/supabase/types";

const bodySchema = z.object({ threadId: z.string().uuid().optional(), messages: z.array(z.unknown()).min(1).max(200), context: z.unknown() });
function safeError(message: string, status: number) { return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } }); }
function safeMessage(value: unknown): string {
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message.slice(0, 2000);
    if (obj.error) return safeMessage(obj.error);
  }
  return "AI request could not be completed. Your optimizer is unaffected.";
}
export async function handleAdvisorChat(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return safeError("Cross-site requests are not allowed.", 403);
    const text = await request.text();
    if (text.length > 250000) return safeError("Conversation is too large. Start a new conversation.", 400);
    const input = bodySchema.parse(JSON.parse(text));
    const context = validateAdvisorContext(input.context);
    const incoming = await validateUIMessages({ messages: input.messages });
    if (incoming.some(m => !["user", "assistant"].includes(m.role) || m.parts.some(p => !["text", "reasoning"].includes(p.type)))) return safeError("Only text conversations are supported.", 400);
    const last = incoming.at(-1);
    const question = last?.parts.filter(p => p.type === "text").map(p => p.text).join("\n") ?? "";
    if (last?.role !== "user" || !question.trim() || question.length > 4000) return safeError("Enter a question of up to 4,000 characters.", 400);
    // Avoid permanently recording obvious credential disclosures; no request-body logging.
    if (/\b(?:Bearer\s+[A-Za-z0-9._-]{20,}|sk-[A-Za-z0-9_-]{15,}|sb_secret_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)|(?:password|api[_ -]?key|access[_ -]?token)\s*[:=]\s*\S+/i.test(question)) return safeError("Please remove passwords, access tokens and API keys before sending.", 400);
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    const aiKey = process.env["LOVABLE_API_KEY"];
    if (!url || !key || !aiKey) return safeError("AI service configuration is unavailable.", 401);
    const authorization = request.headers.get("authorization");
    if (authorization && !authorization.startsWith("Bearer ")) return safeError("Invalid sign-in session.", 401);
    const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: authorization ? { Authorization: authorization } : {}, fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
      headers.set("apikey", key);
      return fetch(input, { ...init, headers });
    } } });
    let userId: string | undefined;
    if (authorization) {
      const auth = await client.auth.getUser(authorization.slice(7));
      if (auth.error || !auth.data.user) return safeError("Your sign-in session expired. Sign in again.", 401);
      userId = auth.data.user.id;
    }
    if (input.threadId && !userId) return safeError("Sign in to access saved conversations.", 401);
    let messages: UIMessage[] = incoming;
    let revision = 0;
    if (input.threadId && userId) {
      const stored = await client.from("ai_conversations").select("messages,revision").eq("id", input.threadId).eq("user_id", userId).single();
      if (stored.error) return safeError("Conversation not found or unavailable to this account.", 404);
      const history = await validateUIMessages({ messages: stored.data.messages as unknown[] });
      // Server-stored history is authoritative. Never accept caller-authored assistant messages for a saved chat.
      messages = [...history, last];
      revision = stored.data.revision;
    }
    // Privileged access is exclusively for private server-owned usage and access-denial state.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ip = request.headers.get("cf-connecting-ip") ?? "local-preview";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${aiKey}:${ip}`));
    const scope = userId ? `user:${userId}` : `guest:${Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("")}`;
    const blocked = await supabaseAdmin.from("ai_access_blocks").select("reason,status").in("scope", ["workspace", "provider:openai"]);
    if (blocked.error) return safeError("AI usage protection is unavailable.", 503);
    if (blocked.data?.[0]) return safeError(blocked.data[0].reason, blocked.data[0].status);
    const allowance = await supabaseAdmin.rpc("reserve_ai_request", { p_scope: scope, p_authenticated: !!userId });
    if (allowance.error) return safeError("AI usage protection is unavailable.", 503);
    if (!allowance.data) return safeError("AI daily usage limit reached. Please return tomorrow (UTC). Pump scheduling remains available.", 429);
    if (input.threadId && userId) {
      const update = await client.from("ai_conversations").update({ messages: messages as unknown as Json, revision: revision + 1, title: question.slice(0, 120), updated_at: new Date().toISOString() }).eq("id", input.threadId).eq("user_id", userId).eq("revision", revision).select("id").single();
      if (update.error) return safeError("Conversation changed. Reopen it before sending another message.", 409);
      revision++;
    }
    let upstream: Response | undefined;
    let upstreamError = "";
    const { result, runIdFetch } = createResponsesCall(request, { baseURL: "https://ai.gateway.lovable.dev/v1", apiKey: aiKey, model: "openai/gpt-6-astra" }, await convertToModelMessages(messages), `${ADVISOR_INSTRUCTIONS}\nCURRENT READ-ONLY SNAPSHOT (client-provided, validated structure; NOT municipal measurements):\n${JSON.stringify(context)}`, async response => {
      upstream = response;
      if (!response.ok) {
        const errorBody = await response.clone().json().catch(() => null);
        upstreamError = safeMessage(errorBody);
        if ([402, 403].includes(response.status)) {
          const object = errorBody as { error?: { type?: string }; type?: string } | null;
          const type = object?.type ?? object?.error?.type ?? "";
          const workspace = response.status === 402 || ["credit_limit_reached", "ai_disabled"].includes(type);
          const saved = await supabaseAdmin.from("ai_access_blocks").upsert({ scope: workspace ? "workspace" : "provider:openai", reason: upstreamError, status: response.status });
          if (saved.error) throw new Error("AI access could not be safely paused.");
        }
      }
    });
    const stream = result.toUIMessageStreamResponse({ originalMessages: messages, sendReasoning: true,
      onError: error => upstreamError || (error instanceof Error && error.name === "AbortError" ? "Stopped." : "AI response was interrupted. No new schedule was calculated."),
      onFinish: async ({ responseMessage, isAborted }) => {
        if (isAborted || !input.threadId || !userId) return;
        const saved = await client.from("ai_conversations").update({ messages: [...messages, responseMessage] as unknown as Json, updated_at: new Date().toISOString() }).eq("id", input.threadId).eq("user_id", userId).eq("revision", revision).select("id").single();
        if (saved.error) throw new Error("The answer could not be saved; reopen the conversation to check history.");
      },
    });
    await runIdFetch.waitForRunId();
    if (upstream && !upstream.ok) {
      await stream.body?.cancel();
      return safeError(upstreamError, upstream.status);
    }
    return withLovableAiGatewayRunIdHeader(stream, runIdFetch, { "Cache-Control": "no-store" });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    if (error instanceof z.ZodError || error instanceof SyntaxError) return safeError("Invalid chat or schedule context. Reopen the assistant and try again.", 400);
    return safeError("AI request could not be completed. Your optimizer is unaffected.", 500);
  }
}