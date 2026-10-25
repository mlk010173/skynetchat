// Edge Function: chat — SKYNET (repo mlk010173/skynetchat)
// Chat real com rate-limit anônimo no banco, autenticação Supabase,
// histórico persistido e chamada a provedor OpenAI-compatível.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const service = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

const ANON_LIMIT = 20;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Método não suportado." }, 405);

  const svc = service();

  // ---- autenticação (opcional: modo anônimo) ----
  let userId: string | null = null;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader.startsWith("Bearer ") && authHeader.length > 30) {
    const { data } = await svc.auth.getUser(authHeader.slice(7));
    userId = data?.user?.id ?? null;
  }

  // ---- corpo ----
  let body: { conversationId?: string; content?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Corpo inválido." }, 400);
  }
  const content = (body.content ?? "").trim();
  if (!content) return json({ ok: false, error: "Mensagem vazia." }, 400);
  if (content.length > 4000) return json({ ok: false, error: "Mensagem longa demais (máx. 4000 caracteres)." }, 400);

  // ---- rate-limit anônimo por IP (persistido no banco) ----
  if (!userId) {
    const ip = (req.headers.get("x-forwarded-for") ?? "desconhecido").split(",")[0].trim();
    const { error: insErr } = await svc.from("anon_requests").insert({ ip });
    if (insErr) return json({ ok: false, error: "Falha ao registrar requisição." }, 500);
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await svc
      .from("anon_requests")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", since);
    if ((count ?? 0) > ANON_LIMIT) {
      return json({
        ok: false,
        error: `Limite de ${ANON_LIMIT} mensagens por hora atingido no modo anônimo. Crie uma conta para conversar sem limite.`,
      }, 429);
    }
  }

  // ---- provedor de IA configurado? (verificado antes de qualquer persistência) ----
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return json({
      ok: false,
      configured: false,
      error: "IA ainda não configurada: defina OPENAI_API_KEY nos secrets desta função (Dashboard → Edge Functions → chat → Secrets).",
    }, 503);
  }

  // ---- conversa (persistência apenas para usuários logados) ----
  let convId: string | null = body.conversationId ?? null;
  if (userId && convId) {
    const { data: conv } = await svc
      .from("conversations")
      .select("id")
      .eq("id", convId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!conv) return json({ ok: false, error: "Conversa não encontrada." }, 404);
  } else if (userId) {
    convId = crypto.randomUUID();
    const { error: cErr } = await svc
      .from("conversations")
      .insert({ id: convId, user_id: userId, title: content.slice(0, 80) });
    if (cErr) return json({ ok: false, error: "Falha ao criar conversa." }, 500);
  }

  // ---- contexto das últimas 30 mensagens ----
  const context: { role: string; content: string }[] = [{ role: "user", content }];
  if (userId && convId) {
    const { data: history } = await svc
      .from("messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (history?.length) {
      for (const m of history.reverse()) context.unshift({ role: m.role, content: m.content });
    }
    const { error: mErr } = await svc
      .from("messages")
      .insert({ conversation_id: convId, role: "user", content });
    if (mErr) return json({ ok: false, error: "Falha ao salvar mensagem." }, 500);
  }

  const baseUrl = (Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const models = (Deno.env.get("SKYNET_MODELS") ?? "gpt-4o-mini,gpt-4o")
    .split(",").map((m) => m.trim()).filter(Boolean);
  const model = body.model && models.includes(body.model) ? body.model : models[0];

  let reply: string;
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Você é o SKYNET, um assistente de IA direto, útil e honesto. Responda em português." },
          ...context,
        ],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.choices?.[0]?.message?.content) {
      return json({
        ok: false,
        error: `Provedor de IA respondeu com erro (${res.status}). Verifique a chave/modelo configurados.`,
      }, 502);
    }
    reply = data.choices[0].message.content as string;
  } catch {
    return json({ ok: false, error: "Sem conexão com o provedor de IA." }, 502);
  }

  // ---- persiste a resposta ----
  if (userId && convId) {
    const { error: rErr } = await svc
      .from("messages")
      .insert({ conversation_id: convId, role: "assistant", content: reply });
    if (rErr) return json({ ok: false, error: "Falha ao salvar resposta." }, 500);
    await svc.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
  }

  return json({ ok: true, reply, conversationId: convId, model });
});
