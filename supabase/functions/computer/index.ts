// computer — SKYNET COMPUTER / LIVE WORKSPACE.
// Ponte autenticada entre o navegador do usuário e o Chromium real que roda no
// worker (server/computer.mjs, no Render). Cada conta tem a própria sessão: o id
// da sessão do worker nunca é reaproveitado por outra conta.
//
// Regra de honestidade: se o worker estiver fora do ar ou sem browser, a resposta
// é 503 com motivo "browser_indisponivel" e o erro real. Nunca uma tela inventada.
import { contaDaSessao, svc } from "../_shared/sessao.ts";
import { ipDe, liberar } from "../_shared/limite.ts";

const AGENTE = (Deno.env.get("AGENT_URL") ?? "https://skynet-agent.onrender.com").replace(/\/+$/, "");
const TOKEN = Deno.env.get("AGENT_TOKEN") ?? "";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, x-session, content-type, x-client-info",
  "access-control-allow-methods": "POST, GET, OPTIONS",
};
const json = (codigo: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), {
    status: codigo,
    headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const ACOES = new Set([
  "iniciar", "estado", "tela", "clique", "digitar", "tecla", "rolar",
  "navegar", "voltar", "avancar", "recarregar",
  "abas", "nova_aba", "trocar_aba", "fechar_aba",
  "inspecionar", "logs", "reiniciar", "encerrar", "diagnostico",
]);
// ações que precisam de sessão viva e não gastam cota tão rápido quanto a tela
const LEVES = new Set(["tela", "estado", "logs", "abas"]);

async function dono(req: Request): Promise<{ contaId: string; uid: string | null } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  if (bearer.startsWith("eyJ")) {
    const { data } = await svc().auth.getUser(bearer);
    const uid = data?.user?.id ?? null;
    if (!uid) return null;
    const { data: conta } = await svc().from("accounts").select("id").eq("auth_user_id", uid).maybeSingle();
    return { contaId: (conta as any)?.id ?? uid, uid };
  }
  const conta = await contaDaSessao(req);
  if (conta) return { contaId: conta.id, uid: null };
  // chamada interna do próprio backend (chat/agent): x-conta-id com a service key
  const interna = req.headers.get("x-conta-id");
  const chave = req.headers.get("apikey") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (interna && chave && service && chave === service) return { contaId: interna, uid: null };
  return null;
}

async function sessaoDaConta(contaId: string) {
  const { data } = await svc()
    .from("computer_sessions")
    .select("id, worker_id, estado, url_atual, criado_em, ultimo_uso")
    .eq("account_id", contaId)
    .eq("estado", "ativa")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string; worker_id: string; estado: string; url_atual: string | null } | null;
}

async function falarWorker(acao: string, corpo: Record<string, unknown>) {
  const r = await fetch(`${AGENTE}/compute/${acao}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(acao === "iniciar" || acao === "navegar" || acao === "diagnostico" ? 45_000 : 30_000),
  }).catch((e) => ({ ok: false, status: 0, erro: String(e) }) as any);
  if ((r as any).status === 0) {
    return { ok: false, motivo: "worker_indisponivel", detalhe: String((r as any).erro ?? "sem resposta").slice(0, 200) };
  }
  const texto = await r.text().catch(() => "");
  let dados: any = null;
  try { dados = JSON.parse(texto); } catch { dados = { ok: false, detalhe: texto.slice(0, 200) }; }
  if (r.status === 401) return { ok: false, motivo: "worker_nao_autorizado", detalhe: "token do worker recusado" };
  if (!r.ok && !dados?.erro) return { ...dados, ok: false, motivo: "falha_no_worker", detalhe: texto.slice(0, 200) };
  return dados;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const url = new URL(req.url);
  const donoDaChamada = await dono(req);
  if (!donoDaChamada) return json(401, { ok: false, erro: "não autorizado" });
  const { contaId } = donoDaChamada;

  // -------- catálogo (GET) --------
  if (req.method === "GET") {
    const s = await sessaoDaConta(contaId);
    return json(200, {
      ok: true,
      acoes: [...ACOES],
      worker: AGENTE,
      sessao: s ? { id: s.id, estado: s.estado, url: s.url_atual } : null,
    });
  }

  // limite: 90 ações/min por conta (tela ao vivo consome, então é generoso)
  if (!(await liberar(`computer:${contaId}:${ipDe(req)}`, 90, "minute"))) {
    return json(429, { ok: false, erro: "muitas ações em pouco tempo", retry_after: 60 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }
  const acao = String(body.acao ?? body.action ?? "").trim().toLowerCase();
  if (!ACOES.has(acao)) {
    return json(400, { ok: false, erro: `ação desconhecida: ${acao || "(vazia)"}`, acoes: [...ACOES] });
  }

  // -------- diagnóstico: não precisa de sessão --------
  if (acao === "diagnostico") {
    const r = await falarWorker("diagnostico", {});
    return json(200, r);
  }

  // -------- iniciar / reiniciar: garante sessão no worker --------
  if (acao === "iniciar" || acao === "reiniciar") {
    const atual = await sessaoDaConta(contaId);
    if (atual && acao === "iniciar") {
      // já existe: só devolve o estado atual com uma tela nova
      const tela = await falarWorker("tela", { sessao: atual.worker_id });
      return json(200, { ...tela, sessao: { id: atual.id, url: atual.url_atual }, reaproveitada: true });
    }
    const workerId = `${contaId}:${crypto.randomUUID().slice(0, 8)}`;
    const r = await falarWorker("iniciar", { sessao: workerId, url: body.url ?? "https://example.com" });
    if (!r?.ok) {
      const db = svc();
      await db.from("computer_sessions").update({ estado: "falhou", ultimo_uso: new Date().toISOString() }).eq("account_id", contaId).eq("estado", "ativa");
      return json(503, {
        ok: false,
        motivo: r?.motivo ?? "browser_indisponivel",
        detalhe: r?.erro ?? r?.detalhe ?? "o worker não conseguiu abrir o navegador",
      });
    }
    const db = svc();
    if (atual) await db.from("computer_sessions").update({ estado: "encerrada", ultimo_uso: new Date().toISOString() }).eq("id", atual.id);
    const { data: nova } = await db
      .from("computer_sessions")
      .insert({
        account_id: contaId,
        worker_id: workerId,
        estado: "ativa",
        url_atual: (r as any)?.url ?? String(body.url ?? ""),
        permissoes: { navegar: true, clicar: true, digitar: true, inspecionar: true },
      })
      .select("id")
      .maybeSingle();
    return json(200, { ...r, sessao: { id: (nova as any)?.id ?? null, url: (r as any)?.url } });
  }

  // -------- demais ações: precisam de sessão ativa --------
  const sessao = await sessaoDaConta(contaId);
  if (!sessao) return json(409, { ok: false, erro: "nenhuma sessão ativa: chame iniciar primeiro", motivo: "sem_sessao" });

  const r = await falarWorker(acao, { ...body, sessao: sessao.worker_id });
  const db = svc();
  await db.from("computer_sessions").update({ ultimo_uso: new Date().toISOString() }).eq("id", sessao.id);
  if (acao === "encerrar") {
    await db.from("computer_sessions").update({ estado: "encerrada" }).eq("id", sessao.id);
  }
  if (typeof (r as any)?.url === "string" && (r as any).url) {
    await db.from("computer_sessions").update({ url_atual: (r as any).url }).eq("id", sessao.id);
  }
  const codigo = (r as any)?.ok === false && (r as any)?.motivo ? 503 : 200;
  return json(codigo, r);
});
