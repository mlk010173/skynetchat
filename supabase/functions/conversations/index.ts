// Edge Function: conversations — histórico do usuário.
// GET           → lista de conversas
// GET ?id=X     → mensagens da conversa X
// PATCH ?id=X   → renomear { title }
// DELETE ?id=X  → apagar conversa
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, PATCH, DELETE, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // ---- exige usuário logado ----
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ ok: false, error: "Autenticação necessária." }, 401);
  }
  const { data } = await svc.auth.getUser(authHeader.slice(7));
  const userId = data?.user?.id;
  if (!userId) return json({ ok: false, error: "Sessão inválida ou expirada." }, 401);

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  // ---- lista ----
  if (req.method === "GET" && !id) {
    const { data: conversations, error } = await svc
      .from("conversations")
      .select("id, title, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) return json({ ok: false, error: "Falha ao listar conversas." }, 500);
    return json({ ok: true, conversations });
  }

  if (!id) return json({ ok: false, error: "Parâmetro id obrigatório." }, 400);

  // garante que a conversa é do usuário antes de qualquer operação
  const { data: conv } = await svc
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!conv) return json({ ok: false, error: "Conversa não encontrada." }, 404);

  if (req.method === "GET") {
    const { data: messages, error } = await svc
      .from("messages")
      .select("role, content, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) return json({ ok: false, error: "Falha ao carregar mensagens." }, 500);
    return json({ ok: true, messages });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null);
    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "";
    if (!title) return json({ ok: false, error: "Título inválido." }, 400);
    const { error } = await svc.from("conversations").update({ title }).eq("id", id);
    if (error) return json({ ok: false, error: "Falha ao renomear." }, 500);
    return json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { error } = await svc.from("conversations").delete().eq("id", id);
    if (error) return json({ ok: false, error: "Falha ao apagar." }, 500);
    return json({ ok: true });
  }

  return json({ ok: false, error: "Método não suportado." }, 405);
});
