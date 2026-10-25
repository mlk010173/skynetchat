// Edge Function: chat — SKYNET
// Chat real com: autenticação opcional, rate-limit anônimo no banco,
// histórico persistido, MEMÓRIA VETORIAL (pgvector) entre conversas e
// resposta em STREAMING (SSE) de qualquer provedor OpenAI-compatível.
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

const sseHeaders = { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" };
const sse = (event: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);

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

  // ---- provedor de IA configurado? (antes de qualquer persistência) ----
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return json({
      ok: false,
      configured: false,
      error: "IA ainda não configurada: defina OPENAI_API_KEY nos secrets desta função (Dashboard → Edge Functions → chat → Secrets).",
    }, 503);
  }
  const baseUrl = (Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const models = (Deno.env.get("SKYNET_MODELS") ?? "gpt-4o-mini,gpt-4o")
    .split(",").map((m) => m.trim()).filter(Boolean);
  const model = body.model && models.includes(body.model) ? body.model : models[0];

  // ---- memória vetorial: embeddings da mensagem (melhor esforço) ----
  const embedModel = Deno.env.get("SKYNET_EMBEDDING_MODEL") ?? "text-embedding-3-small";
  let userEmbedding: number[] | null = null;
  try {
    const embRes = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: embedModel, input: content.slice(0, 2000) }),
    });
    const embData = await embRes.json().catch(() => null);
    if (embRes.ok && Array.isArray(embData?.data?.[0]?.embedding)) {
      userEmbedding = embData.data[0].embedding;
    }
  } catch { /* memória é opcional — o chat continua sem ela */ }

  // ---- memórias relevantes de OUTRAS conversas (pgvector) ----
  let memories: string[] = [];
  if (userId && userEmbedding) {
    try {
      const { data: mem } = await svc.rpc("match_memories", {
        p_user: userId,
        p_conv: body.conversationId ?? null,
        p_embedding: userEmbedding,
        p_threshold: 0.75,
        p_count: 8,
      });
      if (Array.isArray(mem)) {
        memories = mem.map((m: { role: string; content: string }) => `${m.role === "user" ? "usuário" : "skynet"}: ${m.content}`.slice(0, 400));
      }
    } catch { /* sem memórias, segue o chat */ }
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

  // ---- contexto das últimas 30 mensagens + memórias ----
  const messages: { role: string; content: string }[] = [];
  if (userId && convId) {
    const { data: history } = await svc
      .from("messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (history?.length) {
      for (const m of history.reverse()) messages.push({ role: m.role, content: m.content });
    }
  }
  const systemParts = [
    "Você é o SKYNET, um assistente de IA direto, útil e honesto. Responda em português.",
  ];
  if (memories.length) {
    systemParts.push(
      `Memórias relevantes de conversas anteriores deste usuário (use se forem úteis):\n- ${memories.join("\n- ")}`,
    );
  }
  const llmMessages = [
    { role: "system", content: systemParts.join("\n\n") },
    ...messages,
    { role: "user", content },
  ];

  // ---- salva a mensagem do usuário (com embedding, se houver) ----
  if (userId && convId) {
    const { error: mErr } = await svc
      .from("messages")
      .insert({
        conversation_id: convId,
        role: "user",
        content,
        ...(userEmbedding ? { embedding: userEmbedding } : {}),
      });
    if (mErr) return json({ ok: false, error: "Falha ao salvar mensagem." }, 500);
  }

  // ---- streaming da resposta (SSE) ----
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: llmMessages,
            max_tokens: 1024,
            temperature: 0.7,
            stream: true,
          }),
        });

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => "");
          controller.enqueue(sse({
            ok: false,
            error: `Provedor de IA respondeu com erro (${res.status}). ${errText.slice(0, 200)}`,
          }));
          controller.close();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = "";
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload);
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (delta) {
                full += delta;
                controller.enqueue(sse({ delta }));
              }
            } catch { /* ignora fragmentos parciais */ }
          }
        }

        // persiste a resposta completa (com embedding, se houver)
        if (full) {
          if (userId && convId) {
            let replyEmbedding: number[] | null = null;
            try {
              const embRes = await fetch(`${baseUrl}/embeddings`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: embedModel, input: full.slice(0, 2000) }),
              });
              const embData = await embRes.json().catch(() => null);
              if (embRes.ok && Array.isArray(embData?.data?.[0]?.embedding)) {
                replyEmbedding = embData.data[0].embedding;
              }
            } catch { /* opcional */ }
            await svc.from("messages").insert({
              conversation_id: convId,
              role: "assistant",
              content: full,
              ...(replyEmbedding ? { embedding: replyEmbedding } : {}),
            });
          }
          controller.enqueue(sse({ done: true, conversationId: convId, model }));
        } else {
          controller.enqueue(sse({ ok: false, error: "O provedor de IA não retornou conteúdo." }));
        }
        controller.close();
      } catch (err) {
        controller.enqueue(sse({ ok: false, error: "Sem conexão com o provedor de IA." }));
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders });
});
