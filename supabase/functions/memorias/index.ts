import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

const jsonRes = (status: number, data: any) =>
  new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS,
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // 1. Validar sessão Supabase real do usuário
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return jsonRes(401, { ok: false, error: "Token de autorização não fornecido" });
  }

  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: uData, error: uErr } = await supabaseAuth.auth.getUser(token);
  if (uErr || !uData?.user) {
    return jsonRes(401, { ok: false, error: "Sessão inválida ou expirada" });
  }

  const user = uData.user;
  const userId = user.id;
  const userEmail = user.email || "";

  // Client Service Role para interagir com agent_memory
  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Parser de body ou query params
  let body: any = {};
  if (req.method === "POST" || req.method === "PUT" || req.method === "DELETE") {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }

  const url = new URL(req.url);
  const actionParam = url.searchParams.get("action");
  const idParam = url.searchParams.get("id");

  const action = body.action || actionParam || "list";
  const id = body.id || idParam;

  // Helper para filtro por usuário (email = userId OU email = userEmail)
  const applyUserFilter = (query: any) => {
    if (userEmail && userEmail !== userId) {
      return query.or(`email.eq.${userId},email.eq.${userEmail}`);
    }
    return query.eq("email", userId);
  };

  try {
    if (action === "list") {
      let query = svc
        .from("agent_memory")
        .select("id, texto, criado_em, email")
        .order("criado_em", { ascending: false })
        .limit(20);

      query = applyUserFilter(query);

      const { data, error } = await query;
      if (error) {
        return jsonRes(500, { ok: false, error: error.message });
      }

      const memorias = (data || []).map((m: any) => ({
        id: m.id,
        texto: m.texto,
        criado_em: m.criado_em,
        score: m.score ?? null,
      }));

      return jsonRes(200, { ok: true, memorias, data: memorias });
    }

    if (action === "read") {
      if (!id) {
        return jsonRes(400, { ok: false, error: "ID da memória é obrigatório" });
      }

      let query = svc
        .from("agent_memory")
        .select("id, texto, criado_em, email")
        .eq("id", id);

      query = applyUserFilter(query);

      const { data, error } = await query.maybeSingle();
      if (error) {
        return jsonRes(500, { ok: false, error: error.message });
      }

      if (!data) {
        return jsonRes(404, { ok: false, error: "Memória não encontrada ou sem acesso" });
      }

      const memoria = {
        id: data.id,
        texto: data.texto,
        criado_em: data.criado_em,
        score: data.score ?? null,
      };

      return jsonRes(200, { ok: true, memoria, texto: data.texto, id: data.id, criado_em: data.criado_em });
    }

    if (action === "delete") {
      if (!id) {
        return jsonRes(400, { ok: false, error: "ID da memória é obrigatório" });
      }

      let query = svc
        .from("agent_memory")
        .delete()
        .eq("id", id);

      query = applyUserFilter(query);

      const { data, error } = await query.select();
      if (error) {
        return jsonRes(500, { ok: false, error: error.message });
      }

      if (!data || data.length === 0) {
        return jsonRes(404, { ok: false, error: "Memória não encontrada ou não pertence ao usuário" });
      }

      return jsonRes(200, { ok: true, deleted: true, id });
    }

    return jsonRes(400, { ok: false, error: `Ação não suportada: ${action}` });
  } catch (err: any) {
    return jsonRes(500, { ok: false, error: err.message || "Erro interno na edge function" });
  }
});
