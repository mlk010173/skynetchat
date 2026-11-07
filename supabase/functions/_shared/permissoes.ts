// Política de permissões das ferramentas do SKYNET.
// livre     -> roda direto (leitura, cálculo, consulta)
// leve      -> pede autorização uma vez por dia, depois roda sozinha até o dia seguinte
// critico   -> pede autorização a cada execução (comando no servidor, deploy, escrita)
// bloqueado -> não roda nunca
import { createClient } from "npm:@supabase/supabase-js@2";

export type Politica = "livre" | "leve" | "critico" | "bloqueado";

export const PADROES: Record<string, Politica> = {
  // leitura e cálculo
  web_pesquisar: "livre",
  abrir: "livre",
  navegar: "livre",
  calcular: "livre",
  moeda: "livre",
  clima: "livre",
  hora: "livre",
  sistema: "livre",
  infra: "leve",
  github: "livre",
  memoria: "livre",
  midia: "livre",
  print: "livre",
  // gera ou grava algo
  imagem: "leve",
  widget: "leve",
  arquivo: "leve",
  mcp: "critico",   // comandos via MCP sempre pedem autorização
  // mexe no servidor
  terminal: "critico",
  deploy: "critico",
};

export const ROTULOS: Record<string, string> = {
  web_pesquisar: "Pesquisar na web",
  abrir: "Abrir página",
  navegar: "Navegar no site",
  calcular: "Calcular",
  moeda: "Consultar câmbio",
  clima: "Consultar clima",
  hora: "Ver hora",
  sistema: "Checar o sistema",
  infra: "Consultar infraestrutura",
  github: "Consultar GitHub",
  memoria: "Memória",
  midia: "Tocar mídia",
  print: "Capturar tela do site",
  imagem: "Gerar imagem",
  widget: "Criar widget",
  arquivo: "Gerar arquivo",
  mcp: "Usar ferramenta MCP",
  terminal: "Executar comando no servidor",
  deploy: "Publicar/deploy",
};

const svc = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

/** Política efetiva da ferramenta para a conta (banco manda, padrão é o fallback). */
export async function politicaDa(dono: string, ferramenta: string): Promise<Politica> {
  const padrao = PADROES[ferramenta] ?? "livre";
  if (!dono) return padrao;
  const { data } = await svc()
    .from("acc_permissoes")
    .select("politica, aprovado_em")
    .eq("dono", dono)
    .eq("ferramenta", ferramenta)
    .maybeSingle();
  const politica = (data?.politica as Politica) ?? padrao;
  if (politica === "leve" && data?.aprovado_em) {
    const horas = (Date.now() - new Date(data.aprovado_em).getTime()) / 3_600_000;
    return horas < 24 ? "livre" : "leve";
  }
  return politica;
}

export async function assinatura(ferramenta: string, payload: unknown): Promise<string> {
  const bruto = `${ferramenta}:${JSON.stringify(payload ?? {})}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bruto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 20);
}

/** Cria (ou reaproveita) um pedido de autorização pendente. */
export async function pedirAutorizacao(
  dono: string,
  ferramenta: string,
  payload: unknown,
  resumo: string,
  extra: { conversa?: string | null; texto?: string | null } = {},
): Promise<{ id: string; politica: Politica } | null> {
  if (!dono) return null;
  const db = svc();
  const sig = await assinatura(ferramenta, payload);
  const { data: aberto } = await db
    .from("acc_pedidos")
    .select("id")
    .eq("dono", dono)
    .eq("ferramenta", ferramenta)
    .eq("assinatura", sig)
    .eq("estado", "pendente")
    .gt("expira_em", new Date().toISOString())
    .maybeSingle();
  if (aberto?.id) {
    if (extra.conversa || extra.texto) {
      await db.from("acc_pedidos").update({
        conversa_id: extra.conversa ?? null,
        pedido_texto: (extra.texto ?? "").slice(0, 1200) || null,
      }).eq("id", aberto.id);
    }
    return { id: aberto.id, politica: "critico" };
  }
  const { data, error } = await db
    .from("acc_pedidos")
    .insert({
      dono,
      ferramenta,
      assinatura: sig,
      payload: payload ?? {},
      resumo: resumo.slice(0, 240),
      conversa_id: extra.conversa ?? null,
      pedido_texto: (extra.texto ?? "").slice(0, 1200) || null,
    })
    .select("id")
    .maybeSingle();
  if (error || !data?.id) return null;
  return { id: data.id, politica: "critico" };
}

/**
 * Procura autorização válida já dada pelo usuário para esta execução.
 * Consome o pedido (uma autorização vale uma execução).
 */
export async function autorizacaoVale(
  dono: string,
  ferramenta: string,
  payload: unknown,
): Promise<{ autorizado: boolean; pedidoId?: string }> {
  if (!dono) return { autorizado: false };
  const db = svc();
  const sig = await assinatura(ferramenta, payload);
  const { data } = await db
    .from("acc_pedidos")
    .select("id")
    .eq("dono", dono)
    .eq("ferramenta", ferramenta)
    .eq("assinatura", sig)
    .eq("estado", "autorizado")
    .gt("expira_em", new Date().toISOString())
    .order("decidido_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.id) return { autorizado: false };
  await db.from("acc_pedidos").update({ estado: "usado" }).eq("id", data.id);
  return { autorizado: true, pedidoId: data.id };
}

export async function decidir(dono: string, pedidoId: string, autorizar: boolean) {
  const db = svc();
  const { data: pedido } = await db
    .from("acc_pedidos")
    .select("id, ferramenta, estado")
    .eq("id", pedidoId)
    .eq("dono", dono)
    .maybeSingle();
  if (!pedido) return { ok: false, erro: "pedido não encontrado" };
  if (pedido.estado !== "pendente") {
    return { ok: pedido.estado === "autorizado", estado: pedido.estado };
  }
  await db
    .from("acc_pedidos")
    .update({ estado: autorizar ? "autorizado" : "negado", decidido_em: new Date().toISOString() })
    .eq("id", pedidoId);
  if (autorizar) {
    // "leve" aprovado vale o dia inteiro; "critico" volta a pedir na próxima
    const politica = PADROES[pedido.ferramenta] ?? "livre";
    if (politica === "leve") {
      await db.from("acc_permissoes").upsert({
        dono,
        ferramenta: pedido.ferramenta,
        politica: "leve",
        aprovado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      }, { onConflict: "dono,ferramenta" });
    }
  }
  return { ok: true, ferramenta: pedido.ferramenta, autorizado: autorizar };
}

/** Lista políticas efetivas + pedidos pendentes da conta. */
export async function painel(dono: string) {
  const db = svc();
  const [{ data: politicas }, { data: pedidos }] = await Promise.all([
    db.from("acc_permissoes").select("ferramenta, politica, aprovado_em").eq("dono", dono),
    db
      .from("acc_pedidos")
      .select("id, ferramenta, resumo, criado_em, estado")
      .eq("dono", dono)
      .in("estado", ["pendente", "autorizado"])
      .gt("expira_em", new Date().toISOString())
      .order("criado_em", { ascending: false })
      .limit(20),
  ]);
  const mapa: Record<string, { politica: Politica; aprovado_em: string | null }> = {};
  for (const [ferramenta, politica] of Object.entries(PADROES)) {
    mapa[ferramenta] = { politica, aprovado_em: null };
  }
  for (const p of politicas ?? []) {
    mapa[p.ferramenta] = { politica: p.politica as Politica, aprovado_em: p.aprovado_em ?? null };
  }
  return {
    ferramentas: Object.entries(mapa).map(([nome, v]) => ({
      ferramenta: nome,
      rotulo: ROTULOS[nome] ?? nome,
      politica: v.politica,
      aprovado_em: v.aprovado_em,
    })),
    pedidos: pedidos ?? [],
  };
}


// ---------------------------------------------------------------------------
// RETOMADA: o agente continua o que estava fazendo depois da autorização
// ---------------------------------------------------------------------------

export type PedidoRetomada = {
  id: string;
  ferramenta: string;
  payload: Record<string, unknown>;
  texto: string;
  resumo: string;
};

const FRASE_DE_APROVACAO = /^\s*(autorizo|autorizado|aprovado|pode(\s+(executar|continuar|ir|rodar|fazer|mandar))?|sim|ok|okay|vai|manda|mande|executa|execute|roda|libera|liberado|continu[ae]|continuar|continua|segue|prossiga|bora|confirma|confirmo)\b/i;

export const pareceAprovacao = (texto: string) => FRASE_DE_APROVACAO.test(String(texto ?? ""));

/** Pedido autorizado que ainda não foi executado (o que fazer ao continuar). */
export async function pedidoPorId(dono: string, id: string): Promise<PedidoRetomada | null> {
  if (!dono || !id) return null;
  const { data } = await svc()
    .from("acc_pedidos")
    .select("id, ferramenta, payload, pedido_texto, resumo, estado")
    .eq("id", id)
    .eq("dono", dono)
    .maybeSingle();
  if (!data) return null;
  if (data.estado !== "autorizado" && data.estado !== "pendente") return null;
  if (data.estado === "pendente") return null; // ainda sem autorização
  return {
    id: data.id,
    ferramenta: data.ferramenta,
    payload: (data.payload ?? {}) as Record<string, unknown>,
    texto: String(data.pedido_texto ?? ""),
    resumo: String(data.resumo ?? ""),
  };
}

/** Último pedido autorizado e não executado da conta (preferindo a mesma conversa). */
export async function pedidoParaContinuar(
  dono: string,
  conversaId?: string | null,
): Promise<PedidoRetomada | null> {
  if (!dono) return null;
  const db = svc();
  const base = () =>
    db
      .from("acc_pedidos")
      .select("id, ferramenta, payload, pedido_texto, resumo, conversa_id, continuado_em")
      .eq("dono", dono)
      .eq("estado", "autorizado")
      .is("continuado_em", null)
      .gt("expira_em", new Date().toISOString())
      .order("decidido_em", { ascending: false })
      .limit(5);
  const { data } = conversaId
    ? await base().eq("conversa_id", conversaId)
    : await base();
  const linha = (data ?? [])[0] ?? null;
  if (linha) {
    return {
      id: linha.id,
      ferramenta: linha.ferramenta,
      payload: (linha.payload ?? {}) as Record<string, unknown>,
      texto: String(linha.pedido_texto ?? ""),
      resumo: String(linha.resumo ?? ""),
    };
  }
  if (conversaId) return pedidoParaContinuar(dono, null);
  return null;
}

/** Marca que aquele pedido já foi retomado (não repete sozinho). */
export async function marcarContinuado(id: string) {
  if (!id) return;
  await svc().from("acc_pedidos").update({ continuado_em: new Date().toISOString() }).eq("id", id);
}
