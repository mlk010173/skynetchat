// Edge Function: conversations — histórico do usuário.
// GET           → lista de conversas
// GET ?id=X     → mensagens da conversa X
// PATCH ?id=X   → renomear { title }
// DELETE ?id=X  → apagar conversa
import { createClient } from "npm:@supabase/supabase-js@2";
import { contaDaSessao } from "../_shared/sessao.ts";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session",
  "Access-Control-Allow-Methods": "GET, PATCH, DELETE, OPTIONS",
};

interface ConvRow { id: string; title: string; updated_at: string }

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

  // ---- exige sessão: token opaco (x-session) da conta, ou JWT do Supabase ----
  const sessao = req.headers.get("x-session") ?? "";
  let userId: string | null = null;
  let accountId: string | null = null;

  if (sessao) {
    const conta = await contaDaSessao(req);
    if (!conta) return json({ ok: false, error: "Sessão inválida ou expirada." }, 401);
    accountId = conta.id;
  } else {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ ok: false, error: "Autenticação necessária." }, 401);
    }
    const { data } = await svc.auth.getUser(authHeader.slice(7));
    userId = data?.user?.id ?? null;
    if (!userId) return json({ ok: false, error: "Sessão inválida ou expirada." }, 401);
  }

  const dono = (query: any) => (accountId ? query.eq("account_id", accountId) : query.eq("user_id", userId!));

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  const q = url.searchParams.get("q")?.trim();

  // ---- lista (com busca opcional por título ou conteúdo das mensagens) ----
  if (req.method === "GET" && !id) {
    let conversations: ConvRow[] | null = null;
    let error: unknown = null;
    if (q) {
      const r = await svc.rpc("search_conversations", { uid: userId, q });
      conversations = r.data as ConvRow[] | null;
      error = r.error;
    } else {
      const r = await dono(
        svc.from("conversations").select("id, title, updated_at"),
      )
        .order("updated_at", { ascending: false })
        .limit(100);
      conversations = r.data as ConvRow[] | null;
      error = r.error;
    }
    if (error) return json({ ok: false, error: "Falha ao listar conversas." }, 500);
    return json({ ok: true, conversations });
  }

  if (!id) return json({ ok: false, error: "Parâmetro id obrigatório." }, 400);

  // garante que a conversa é do usuário antes de qualquer operação
  const { data: conv } = await dono(
    svc.from("conversations").select("id").eq("id", id),
  ).maybeSingle();
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
    const { error } = await dono(svc.from("conversations").update({ title }).eq("id", id));
    if (error) return json({ ok: false, error: "Falha ao renomear." }, 500);
    return json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { error } = await dono(svc.from("conversations").delete().eq("id", id));
    if (error) return json({ ok: false, error: "Falha ao apagar." }, 500);
    return json({ ok: true });
  }

  return json({ ok: false, error: "Método não suportado." }, 405);
});
