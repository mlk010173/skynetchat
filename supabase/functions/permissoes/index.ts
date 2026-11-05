// Permissões das ferramentas do SKYNET (o que roda direto, o que pede autorização).
// GET  /permissoes                      -> lista ferramentas, políticas e pedidos pendentes
// POST /permissoes?action=politica      -> { ferramenta, politica } grava a escolha do usuário
// POST /permissoes?action=decidir       -> { id, autorizar } autoriza ou nega um pedido
// POST /permissoes?action=reset         -> volta tudo ao padrão
import { contaDaSessao, svc } from "../_shared/sessao.ts";
import { decidir, painel, PADROES } from "../_shared/permissoes.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-api-key, x-session, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const db = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

const POLITICAS = new Set(["livre", "leve", "critico", "bloqueado"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // identidade: sessão do login por código (x-session) ou JWT do Supabase Auth
  const conta = await contaDaSessao(req);
  let dono = conta?.id ?? "";
  if (!dono) {
    const auth = (req.headers.get("Authorization") ?? "").trim();
    if (auth.startsWith("Bearer ") && auth.length > 30) {
      const { data } = await svc().auth.getUser(auth.slice(7));
      dono = data?.user?.id ?? "";
    }
  }
  if (!dono) return json({ ok: false, error: "Entre na sua conta para ver as permissões." }, 401);

  const acao = new URL(req.url).searchParams.get("action") ?? "listar";

  if (req.method === "GET" || acao === "listar") {
    const dados = await painel(dono);
    return json({ ok: true, conta: conta?.nickname ?? null, ...dados });
  }

  if (req.method !== "POST") return json({ ok: false, error: "Método não suportado." }, 405);
  const corpo = await req.json().catch(() => ({} as Record<string, unknown>));

  if (acao === "politica") {
    const ferramenta = String(corpo.ferramenta ?? "").trim();
    const politica = String(corpo.politica ?? "").trim();
    if (!ferramenta || !POLITICAS.has(politica)) {
      return json({ ok: false, error: "Informe 'ferramenta' e 'politica' (livre, leve, critico ou bloqueado)." }, 400);
    }
    const { error } = await db().from("acc_permissoes").upsert({
      account_id: dono,
      ferramenta,
      politica,
      aprovado_em: politica === "leve" ? new Date().toISOString() : null,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: "account_id,ferramenta" });
    if (error) return json({ ok: false, error: "Não consegui salvar a política." }, 500);
    return json({ ok: true, ferramenta, politica, padrao: PADROES[ferramenta] ?? "livre" });
  }

  if (acao === "decidir") {
    const id = String(corpo.id ?? "").trim();
    if (!id) return json({ ok: false, error: "Faltou o id do pedido." }, 400);
    const r = await decidir(dono, id, corpo.autorizar !== false);
    return json(r, r.ok ? 200 : 404);
  }

  if (acao === "reset") {
    const { error } = await db().from("acc_permissoes").delete().eq("account_id", dono);
    if (error) return json({ ok: false, error: "Não consegui restaurar." }, 500);
    return json({ ok: true, restaurado: true });
  }

  return json({ ok: false, error: "Ação desconhecida." }, 404);
});
