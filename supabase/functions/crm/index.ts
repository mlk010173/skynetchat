// CRM do SKYNET: contatos, pipeline de negócios e atividades.
// GET  /crm?recurso=painel|contatos|negocios|atividades|contato&id=
// POST /crm?acao=contato|negocio|atividade|etapa|concluir|excluir
// Auth: sessão do login por código (x-session) ou JWT do Supabase Auth.
import { contaDaSessao, svc } from "../_shared/sessao.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-api-key, x-session, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const ETAPAS = ["novo", "contato_feito", "proposta", "negociacao", "ganho", "perdido"] as const;
const TIPOS = ["ligacao", "email", "reuniao", "tarefa", "nota"] as const;
const PROB: Record<string, number> = { novo: 10, contato_feito: 30, proposta: 55, negociacao: 75, ganho: 100, perdido: 0 };

const num = (v: unknown, padrao = 0) => {
  const bruto = String(v ?? "").trim();
  if (!bruto) return padrao;
  const n = Number(bruto.replace(/[^0-9,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : padrao;
};
const limpo = (v: unknown, max = 500) => (v == null ? null : String(v).trim().slice(0, max) || null);
const dataOuNull = (v: unknown) => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

async function dono(req: Request): Promise<string> {
  const conta = await contaDaSessao(req).catch(() => null);
  if (conta?.id) return conta.id;
  const auth = (req.headers.get("Authorization") ?? "").trim();
  if (auth.startsWith("Bearer ") && auth.length > 30) {
    const db = svc();
    const { data } = await db.auth.getUser(auth.slice(7));
    if (data?.user?.id) return data.user.id;
  }
  // chamada interna confiável (chat -> crm): service role + x-conta-id
  const chaveServico = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const contaHeader = (req.headers.get("x-conta-id") ?? "").trim();
  if (chaveServico.length > 20 && contaHeader && auth === `Bearer ${chaveServico}`) return contaHeader;
  return "";
}

async function painel(db: ReturnType<typeof svc>, id: string) {
  const hoje = new Date();
  const inicioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).toISOString();
  const fimDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1).toISOString();
  const seteDias = new Date(hoje.getTime() - 7 * 864e5).toISOString();

  const [negocios, contatos, ativHoje, ativAtrasadas, novos] = await Promise.all([
    db.from("crm_negocios").select("id, titulo, etapa, valor, probabilidade, previsao, contato_id, atualizado_em").eq("dono", id).order("atualizado_em", { ascending: false }).limit(200),
    db.from("crm_contatos").select("id, nome, empresa, email, telefone, ultimo_contato, atualizado_em").eq("dono", id).order("atualizado_em", { ascending: false }).limit(200),
    db.from("crm_atividades").select("id, titulo, tipo, quando, contato_id, negocio_id").eq("dono", id).eq("concluida", false).gte("quando", inicioDia).lt("quando", fimDia).order("quando").limit(50),
    db.from("crm_atividades").select("id, titulo, tipo, quando, contato_id, negocio_id").eq("dono", id).eq("concluida", false).lt("quando", inicioDia).order("quando").limit(50),
    db.from("crm_contatos").select("id", { count: "exact", head: true }).eq("dono", id).gte("criado_em", seteDias),
  ]);

  const lista = negocios.data ?? [];
  const abertos = lista.filter((n) => n.etapa !== "ganho" && n.etapa !== "perdido");
  const ganhos = lista.filter((n) => n.etapa === "ganho");
  const perdidos = lista.filter((n) => n.etapa === "perdido");
  const valor = (arr: { valor?: number | string }[]) => arr.reduce((s, n) => s + Number(n.valor ?? 0), 0);
  const decididos = ganhos.length + perdidos.length;

  const porEtapa = ETAPAS.map((etapa) => {
    const itens = lista.filter((n) => n.etapa === etapa);
    return { etapa, quantidade: itens.length, valor: valor(itens) };
  });

  return {
    metricas: {
      pipeline: valor(abertos),
      ticket_medio: abertos.length ? valor(abertos) / abertos.length : 0,
      ganho_total: valor(ganhos),
      negócios_abertos: abertos.length,
      conversao: decididos ? Math.round((ganhos.length / decididos) * 100) : 0,
      contatos: contatos.data?.length ?? 0,
      novos_7d: novos.count ?? 0,
      atividades_hoje: ativHoje.data?.length ?? 0,
      atividades_atrasadas: ativAtrasadas.data?.length ?? 0,
      ponderado: abertos.reduce((s, n) => s + Number(n.valor ?? 0) * (Number(n.probabilidade ?? 0) / 100), 0),
    },
    por_etapa: porEtapa,
    negocios: lista,
    contatos: contatos.data ?? [],
    hoje: ativHoje.data ?? [],
    atrasadas: ativAtrasadas.data ?? [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const id = await dono(req);
  if (!id) return json({ ok: false, error: "Entre na sua conta para usar o CRM." }, 401);
  const db = svc();
  const url = new URL(req.url);
  const q = url.searchParams;

  if (req.method === "GET") {
    const recurso = q.get("recurso") ?? "painel";
    try {
      if (recurso === "painel") return json({ ok: true, ...(await painel(db, id)) });

      if (recurso === "contatos") {
        const busca = (q.get("busca") ?? "").replace(/[%*,()]/g, " ").trim();
        let query = db.from("crm_contatos").select("*").eq("dono", id);
        if (busca) query = query.or(`nome.ilike.*${busca}*,empresa.ilike.*${busca}*,email.ilike.*${busca}*`);
        const { data, error } = await query.order("atualizado_em", { ascending: false }).limit(200);
        if (error) throw error;
        return json({ ok: true, contatos: data ?? [] });
      }

      if (recurso === "negocios") {
        const { data, error } = await db.from("crm_negocios").select("*, crm_contatos(nome, empresa)").eq("dono", id).order("atualizado_em", { ascending: false }).limit(300);
        if (error) throw error;
        return json({ ok: true, negocios: data ?? [] });
      }

      if (recurso === "atividades") {
        const filtro = q.get("filtro") ?? "todas";
        let query = db.from("crm_atividades").select("*, crm_contatos(nome)").eq("dono", id);
        if (filtro === "abertas") query = query.eq("concluida", false);
        if (filtro === "hoje") {
          const h = new Date();
          query = query.gte("quando", new Date(h.getFullYear(), h.getMonth(), h.getDate()).toISOString());
        }
        const { data, error } = await query.order("quando", { ascending: false }).limit(200);
        if (error) throw error;
        return json({ ok: true, atividades: data ?? [] });
      }

      if (recurso === "contato") {
        const cid = q.get("id") ?? "";
        const [{ data: contato }, { data: negocios }, { data: atividades }] = await Promise.all([
          db.from("crm_contatos").select("*").eq("dono", id).eq("id", cid).maybeSingle(),
          db.from("crm_negocios").select("*").eq("dono", id).eq("contato_id", cid).order("atualizado_em", { ascending: false }),
          db.from("crm_atividades").select("*").eq("dono", id).eq("contato_id", cid).order("quando", { ascending: false }).limit(60),
        ]);
        if (!contato) return json({ ok: false, error: "Contato não encontrado." }, 404);
        return json({ ok: true, contato, negocios: negocios ?? [], atividades: atividades ?? [] });
      }

      return json({ ok: false, error: "Recurso desconhecido." }, 404);
    } catch (e) {
      return json({ ok: false, error: `Falha ao ler o CRM: ${String((e as Error)?.message ?? e).slice(0, 120)}` }, 500);
    }
  }

  if (req.method !== "POST" && req.method !== "DELETE") return json({ ok: false, error: "Método não suportado." }, 405);
  const acao = q.get("acao") ?? "";
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  try {
    if (acao === "contato") {
      const campos: Record<string, unknown> = {
        dono: id,
        nome: limpo(body.nome, 120),
        email: limpo(body.email, 160),
        telefone: limpo(body.telefone, 40),
        empresa: limpo(body.empresa, 120),
        cargo: limpo(body.cargo, 120),
        origem: limpo(body.origem, 40) ?? "manual",
        notas: limpo(body.notas, 4000),
        atualizado_em: new Date().toISOString(),
      };
      if (!campos.nome) return json({ ok: false, error: "Informe o nome do contato." }, 400);
      if (Array.isArray(body.tags)) campos.tags = body.tags.slice(0, 10).map((t) => String(t).slice(0, 30));
      if (body.ultimo_contato) campos.ultimo_contato = dataOuNull(body.ultimo_contato);
      if (body.id) {
        const { data, error } = await db.from("crm_contatos").update(campos).eq("id", String(body.id)).eq("dono", id).select().maybeSingle();
        if (error) throw error;
        return json({ ok: true, contato: data });
      }
      const { data, error } = await db.from("crm_contatos").insert(campos).select().maybeSingle();
      if (error) throw error;
      return json({ ok: true, contato: data });
    }

    if (acao === "negocio") {
      const etapa = ETAPAS.includes(String(body.etapa) as typeof ETAPAS[number]) ? String(body.etapa) : "novo";
      const campos: Record<string, unknown> = {
        dono: id,
        titulo: limpo(body.titulo, 140),
        etapa,
        valor: num(body.valor, 0),
        moeda: limpo(body.moeda, 6) ?? "BRL",
        probabilidade: Math.max(0, Math.min(100, num(body.probabilidade, PROB[etapa]))),
        previsao: body.previsao ? String(body.previsao).slice(0, 10) : null,
        notas: limpo(body.notas, 4000),
        contato_id: body.contato_id ? String(body.contato_id) : null,
        atualizado_em: new Date().toISOString(),
      };
      if (!campos.titulo) return json({ ok: false, error: "Informe o título do negócio." }, 400);
      if (etapa === "ganho" || etapa === "perdido") campos.fechado_em = new Date().toISOString();
      if (body.id) {
        const { data, error } = await db.from("crm_negocios").update(campos).eq("id", String(body.id)).eq("dono", id).select().maybeSingle();
        if (error) throw error;
        return json({ ok: true, negocio: data });
      }
      const { data, error } = await db.from("crm_negocios").insert(campos).select().maybeSingle();
      if (error) throw error;
      return json({ ok: true, negocio: data });
    }

    if (acao === "etapa") {
      const negocioId = String(body.id ?? "");
      const etapa = String(body.etapa ?? "");
      if (!negocioId || !ETAPAS.includes(etapa as typeof ETAPAS[number])) {
        return json({ ok: false, error: "Informe o negócio e uma etapa válida." }, 400);
      }
      const { data, error } = await db
        .from("crm_negocios")
        .update({
          etapa,
          probabilidade: PROB[etapa],
          atualizado_em: new Date().toISOString(),
          fechado_em: etapa === "ganho" || etapa === "perdido" ? new Date().toISOString() : null,
        })
        .eq("id", negocioId)
        .eq("dono", id)
        .select()
        .maybeSingle();
      if (error) throw error;
      return json({ ok: true, negocio: data });
    }

    if (acao === "atividade") {
      const tipo = TIPOS.includes(String(body.tipo) as typeof TIPOS[number]) ? String(body.tipo) : "nota";
      const campos: Record<string, unknown> = {
        dono: id,
        tipo,
        titulo: limpo(body.titulo, 160),
        descricao: limpo(body.descricao, 4000),
        quando: dataOuNull(body.quando) ?? new Date().toISOString(),
        contato_id: body.contato_id ? String(body.contato_id) : null,
        negocio_id: body.negocio_id ? String(body.negocio_id) : null,
      };
      if (!campos.titulo) return json({ ok: false, error: "Informe o título da atividade." }, 400);
      const { data, error } = await db.from("crm_atividades").insert(campos).select().maybeSingle();
      if (error) throw error;
      if (campos.contato_id) {
        await db.from("crm_contatos").update({ ultimo_contato: new Date().toISOString() }).eq("id", String(campos.contato_id)).eq("dono", id);
      }
      return json({ ok: true, atividade: data });
    }

    if (acao === "concluir") {
      const { data, error } = await db
        .from("crm_atividades")
        .update({ concluida: body.concluida !== false })
        .eq("id", String(body.id ?? ""))
        .eq("dono", id)
        .select()
        .maybeSingle();
      if (error) throw error;
      return json({ ok: true, atividade: data });
    }

    if (acao === "excluir") {
      const tabela = String(body.tabela ?? "");
      const mapa: Record<string, string> = { contato: "crm_contatos", negocio: "crm_negocios", atividade: "crm_atividades" };
      const alvo = mapa[tabela];
      if (!alvo) return json({ ok: false, error: "Tabela inválida." }, 400);
      const { error } = await db.from(alvo).delete().eq("id", String(body.id ?? "")).eq("dono", id);
      if (error) throw error;
      return json({ ok: true, removido: true });
    }

    return json({ ok: false, error: "Ação desconhecida." }, 404);
  } catch (e) {
    return json({ ok: false, error: `Falha ao salvar: ${String((e as Error)?.message ?? e).slice(0, 140)}` }, 500);
  }
});
