// Lembretes do SKYNET: o que o chat promete, o painel cobra.
// GET  /lembretes?estado=abertos|hoje|atrasados|todos|vencidos
// POST /lembretes?acao=criar|concluir|reabrir|excluir|adiar|editar
// Auth: sessão por código (x-session), JWT do Supabase Auth ou chamada interna
// (service role + x-conta-id) para o chat.
import { contaDaSessao, svc } from "../_shared/sessao.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-api-key, x-session, content-type, x-client-info, x-conta-id",
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "content-type": "application/json" } });

async function dono(req: Request): Promise<string> {
  const conta = await contaDaSessao(req).catch(() => null);
  if (conta?.id) return conta.id;
  const auth = (req.headers.get("Authorization") ?? "").trim();
  if (auth.startsWith("Bearer ") && auth.length > 30) {
    const db = svc();
    const { data } = await db.auth.getUser(auth.slice(7));
    if (data?.user?.id) return data.user.id;
    // interno: prova que a chave é service role de verdade
    const cliente = (await import("npm:@supabase/supabase-js@2")).createClient(
      Deno.env.get("SUPABASE_URL")!, auth.slice(7), { auth: { persistSession: false } },
    );
    const { error } = await cliente.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (!error) {
      const cab = (req.headers.get("x-conta-id") ?? "").trim();
      if (cab) return cab;
    }
  }
  return "";
}

function quando(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const db = svc();
  const id = await dono(req);
  if (!id) return json({ ok: false, error: "Entre na sua conta para ver seus lembretes." }, 401);

  const url = new URL(req.url);

  if (req.method === "GET") {
    const estado = (url.searchParams.get("estado") ?? "abertos").toLowerCase();
    const agora = new Date().toISOString();
    let q = db.from("lembretes").select("id, titulo, detalhe, quando, feito, avisado, origem, criado_em, concluido_em").eq("dono", id);
    if (estado === "abertos") q = q.eq("feito", false);
    else if (estado === "todos") q = q;
    else if (estado === "vencidos" || estado === "atrasados") q = q.eq("feito", false).lt("quando", agora);
    else if (estado === "hoje") {
      const inicio = new Date(); inicio.setHours(0, 0, 0, 0);
      const fim = new Date(); fim.setHours(23, 59, 59, 999);
      q = q.eq("feito", false).gte("quando", inicio.toISOString()).lte("quando", fim.toISOString());
    }
    const { data, error } = await q.order("quando", { ascending: true, nullsFirst: false }).limit(200);
    if (error) return json({ ok: false, error: "Falha ao listar lembretes." }, 500);

    const abertos = (data ?? []).filter((l) => !l.feito);
    return json({
      ok: true,
      lembretes: data ?? [],
      resumo: {
        abertos: abertos.length,
        vencidos: abertos.filter((l) => l.quando && new Date(l.quando) < new Date()).length,
        semData: abertos.filter((l) => !l.quando).length,
        proximo: abertos.find((l) => l.quando && new Date(l.quando) >= new Date())?.quando ?? null,
      },
      agora,
    });
  }

  if (req.method !== "POST") return json({ ok: false, error: "Método não suportado." }, 405);

  const corpo = await req.json().catch(() => null) as Record<string, unknown> | null;
  const acao = (url.searchParams.get("acao") ?? String(corpo?.acao ?? "criar")).toLowerCase();

  if (acao === "criar") {
    const titulo = String(corpo?.titulo ?? corpo?.texto ?? "").trim().slice(0, 160);
    if (!titulo) return json({ ok: false, error: "Diga o que devo lembrar." }, 400);
    const { data, error } = await db.from("lembretes").insert({
      dono: id,
      titulo,
      detalhe: String(corpo?.detalhe ?? "").trim().slice(0, 400) || null,
      quando: quando(corpo?.quando),
      origem: String(corpo?.origem ?? "chat").slice(0, 24),
    }).select("id, titulo, detalhe, quando, feito, criado_em").single();
    if (error) return json({ ok: false, error: "Não consegui salvar o lembrete." }, 500);
    return json({ ok: true, lembrete: data });
  }

  const alvo = String(url.searchParams.get("id") ?? corpo?.id ?? "").trim();
  if (!alvo) return json({ ok: false, error: "Informe o lembrete." }, 400);

  if (acao === "concluir" || acao === "reabrir") {
    const feito = acao === "concluir";
    const { error } = await db.from("lembretes")
      .update({ feito, concluido_em: feito ? new Date().toISOString() : null }).eq("id", alvo).eq("dono", id);
    if (error) return json({ ok: false, error: "Falha ao atualizar." }, 500);
    return json({ ok: true, id: alvo, feito });
  }

  if (acao === "excluir") {
    const { error } = await db.from("lembretes").delete().eq("id", alvo).eq("dono", id);
    if (error) return json({ ok: false, error: "Falha ao excluir." }, 500);
    return json({ ok: true, id: alvo, excluido: true });
  }

  if (acao === "adiar") {
    const minutos = Math.max(1, Math.min(7 * 24 * 60, Number(corpo?.minutos ?? 10)));
    const { data: atual } = await db.from("lembretes").select("quando").eq("id", alvo).eq("dono", id).maybeSingle();
    const base = atual?.quando && new Date(atual.quando) > new Date() ? new Date(atual.quando) : new Date();
    const novo = new Date(base.getTime() + minutos * 60000).toISOString();
    const { error } = await db.from("lembretes").update({ quando: novo, avisado: false }).eq("id", alvo).eq("dono", id);
    if (error) return json({ ok: false, error: "Falha ao adiar." }, 500);
    return json({ ok: true, id: alvo, quando: novo, minutos });
  }

  if (acao === "editar") {
    const patch: Record<string, unknown> = {};
    if (typeof corpo?.titulo === "string") patch.titulo = corpo.titulo.trim().slice(0, 160);
    if (typeof corpo?.detalhe === "string") patch.detalhe = corpo.detalhe.trim().slice(0, 400) || null;
    if (corpo?.quando !== undefined) patch.quando = quando(corpo.quando);
    if (!Object.keys(patch).length) return json({ ok: false, error: "Nada para alterar." }, 400);
    const { data, error } = await db.from("lembretes").update(patch).eq("id", alvo).eq("dono", id)
      .select("id, titulo, detalhe, quando, feito").single();
    if (error) return json({ ok: false, error: "Falha ao editar." }, 500);
    return json({ ok: true, lembrete: data });
  }

  return json({ ok: false, error: `Ação desconhecida: ${acao}` }, 400);
});
