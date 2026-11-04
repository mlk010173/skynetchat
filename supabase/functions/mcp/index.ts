// Servidor MCP do SKYNET (JSON-RPC 2.0 sobre HTTP).
// Compatível com o transporte "streamable http" na forma simples: POST com JSON-RPC, resposta JSON.
// Autenticação: Authorization: Bearer sk-... (mesmas chaves da API pública).
import { autorizar, json, registrar } from "../_shared/apikey.ts";
import { liberar, respostaLimite } from "../_shared/limite.ts";
import { svc } from "../_shared/sessao.ts";
import { perguntar } from "../_shared/chat.ts";
import { infraTudo } from "../_shared/infra.ts";

const PROTOCOLO = "2025-06-18";

const FERRAMENTAS = [
  {
    name: "skynet_perguntar",
    description: "Envia uma pergunta ao SKYNET e devolve a resposta em texto. O roteador escolhe o modelo sozinho.",
    inputSchema: {
      type: "object",
      properties: {
        mensagem: { type: "string", description: "Pergunta ou instrução para o SKYNET (aceita o apelido 'pergunta')." },
        modelo: { type: "string", description: "Opcional. Nome exato do modelo; padrão 'auto'." },
        conversa: { type: "string", description: "Opcional. ID de conversa para manter o contexto." },
      },
      required: ["mensagem"],
    },
  },
  {
    name: "skynet_infra",
    description: "Status ao vivo da infraestrutura: Supabase (projeto, funções, contagens), Vercel (deploy e site) e Render (saúde do agente).",
    inputSchema: {
      type: "object",
      properties: {
        plataforma: { type: "string", description: "Opcional: supabase, vercel, render ou tudo (padrão tudo)." },
      },
    },
  },
  {
    name: "skynet_memoria",
    description: "Memória de longo prazo da conta: salvar um fato (acao=salvar) ou listar (acao=buscar).",
    inputSchema: {
      type: "object",
      properties: {
        acao: { type: "string", description: "salvar ou buscar (padrão buscar)." },
        chave: { type: "string", description: "Identificador curto do fato (ex.: cidade, preferencia)." },
        valor: { type: "string", description: "Texto do fato a guardar." },
        tipo: { type: "string", description: "Opcional: fato, preferencia, decisao." },
      },
      required: ["acao"],
    },
  },
  {
    name: "skynet_modelos",
    description: "Lista os modelos conhecidos e a saúde recente de cada um.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "skynet_historico",
    description: "Lista as conversas da conta autenticada.",
    inputSchema: {
      type: "object",
      properties: { limite: { type: "number", description: "Quantas conversas (padrão 20, máx 100)." } },
    },
  },
  {
    name: "skynet_status",
    description: "Estado ao vivo do SKYNET: site, agente no Render, banco, modelos e integrações com latência.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "skynet_imagem",
    description: "Gera uma imagem a partir de um prompt e devolve o link da imagem.",
    inputSchema: { type: "object", properties: { prompt: { type: "string", description: "Descrição da imagem." } }, required: ["prompt"] },
  },
  {
    name: "skynet_print",
    description: "Captura a tela de uma página web e devolve o link da imagem.",
    inputSchema: { type: "object", properties: { url: { type: "string", description: "Endereço da página." } }, required: ["url"] },
  },
  {
    name: "skynet_midia",
    description: "Encontra mídia tocável (YouTube, Spotify, SoundCloud, Vimeo) e devolve embed e link.",
    inputSchema: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "Nome da música, vídeo, filme ou playlist." },
        provedor: { type: "string", description: "youtube, spotify, soundcloud ou vimeo." },
        url: { type: "string", description: "Opcional. Link direto da mídia." },
      },
    },
  },
];

const resultado = (texto: string, dados?: unknown) => ({
  content: [{ type: "text", text: texto }],
  ...(dados ? { structuredContent: dados } : {}),
  isError: false,
});

const falha = (texto: string) => ({ content: [{ type: "text", text: texto }], isError: true });

async function chamarFerramenta(nome: string, args: any, accountId: string) {
  const db = svc();
  if (nome === "skynet_perguntar") {
    const mensagem = String(args?.mensagem ?? args?.pergunta ?? args?.prompt ?? args?.message ?? "").trim();
    if (!mensagem) return falha("Faltou o campo 'mensagem' (também aceito como 'pergunta' ou 'prompt').");
    const r = await perguntar(mensagem, args?.modelo || args?.model || "auto",
      args?.conversa || args?.conversation || null, accountId);
    return resultado(r.answer || "(resposta vazia)", { modelo: r.model, conversa: r.conversationId });
  }
  if (nome === "skynet_infra") {
    const qual = String(args?.plataforma ?? "tudo").toLowerCase();
    const r = await infraTudo();
    const escolhido = qual === "supabase" ? { supabase: r.supabase }
      : qual === "vercel" ? { vercel: r.vercel }
      : qual === "render" ? { render: r.render }
      : { supabase: r.supabase, vercel: r.vercel, render: r.render };
    return resultado(
      [r.supabase.resumo, r.vercel.resumo, r.render.resumo].filter(Boolean).join("\n"),
      escolhido,
    );
  }
  if (nome === "skynet_memoria") {
    const acao = String(args?.acao ?? "buscar").toLowerCase();
    if (acao === "salvar") {
      const valor = String(args?.valor ?? args?.texto ?? "").trim();
      const chave = String(args?.chave ?? "").trim() ||
        "nota-" + valor.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 42);
      if (valor.length < 3) return falha("Faltou 'valor' com o fato a guardar.");
      const { error } = await db.from("acc_memory").upsert({
        account_id: accountId,
        chave,
        valor: valor.slice(0, 1000),
        tipo: String(args?.tipo ?? "fato"),
        updated_at: new Date().toISOString(),
      }, { onConflict: "account_id,chave" });
      if (error) return falha("Não consegui salvar a memória.");
      return resultado(`Memória "${chave}" salva.`, { ok: true, chave });
    }
    const { data } = await db
      .from("acc_memory")
      .select("chave, valor, tipo, updated_at")
      .eq("account_id", accountId)
      .order("updated_at", { ascending: false })
      .limit(50);
    const lista = data ?? [];
    return resultado(
      lista.length ? lista.map((m: any) => `- ${m.chave}: ${m.valor}`).join("\n") : "Nenhuma memória guardada ainda.",
      { ok: true, memorias: lista },
    );
  }
  if (nome === "skynet_status" || nome === "skynet_imagem" || nome === "skynet_print" || nome === "skynet_midia") {
    const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const chamar = async (fn: string, body?: unknown) => {
      const r = await fetch(`${base}/functions/v1/${fn}`, {
        method: body ? "POST" : "GET",
        headers: { apikey: anon, authorization: `Bearer ${anon}`, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(60000),
      });
      return await r.json().catch(() => ({ ok: false, erro: `HTTP ${r.status}` }));
    };
    if (nome === "skynet_status") {
      const d = await chamar("status");
      return resultado(`Site: ${d?.site ?? "?"} · agente: ${d?.agente ?? "?"} · banco: ${d?.banco ?? "?"} · funções: ${(d?.funcoes ?? d?.functions ?? []).length}`, d);
    }
    if (nome === "skynet_imagem") {
      const prompt = String(args?.prompt ?? "").trim();
      if (!prompt) return falha("Faltou o campo 'prompt'.");
      const d = await chamar("imagem", { prompt });
      const link = d?.data_url ?? d?.url ?? d?.imagem ?? "";
      if (!d?.ok || !link) return falha(String(d?.erro ?? d?.error ?? "não foi possível gerar a imagem"));
      return resultado(`Imagem gerada por ${d?.provedor ?? "?"} (${d?.modelo ?? ""}). Link: ${link.slice(0, 120)}`, { url: link, provedor: d?.provedor });
    }
    if (nome === "skynet_print") {
      const url = String(args?.url ?? "").trim();
      if (!url) return falha("Faltou o campo 'url'.");
      const { capturarTela } = await import("../_shared/print.ts");
      const c = await capturarTela(url);
      if (!c.ok) return falha(c.erro ?? "falha na captura");
      return resultado(`Captura de ${c.alvo} (${c.provedor}): ${c.url}`, { url: c.url, alvo: c.alvo });
    }
    const { resolverMidia } = await import("../_shared/midia.ts");
    const m = await resolverMidia({ consulta: String(args?.consulta ?? ""), provedor: String(args?.provedor ?? ""), url: String(args?.url ?? "") });
    if (!m.ok) return falha(m.mensagem ?? "mídia não encontrada");
    return resultado(`Tocando ${m.provedor}: ${m.titulo ?? ""}. Embed: ${m.embed}`, m);
  }
  if (nome === "skynet_modelos") {
    const { data } = await db
      .from("model_health")
      .select("model, ok, latency_ms, checked_at")
      .order("checked_at", { ascending: false })
      .limit(120);
    const vistos = new Map<string, any>();
    for (const l of data ?? []) if (!vistos.has(l.model)) vistos.set(l.model, l);
    const lista = [...vistos.values()];
    return resultado(
      lista.length ? lista.map((m) => `${m.ok ? "ok" : "falha"} · ${m.model} · ${m.latency_ms ?? "?"}ms`).join("\n")
        : "Nenhuma medição registrada ainda.",
      { modelos: lista },
    );
  }
  if (nome === "skynet_historico") {
    const limite = Math.min(Number(args?.limite ?? 20) || 20, 100);
    const { data } = await db
      .from("conversations").select("id, title, updated_at")
      .eq("account_id", accountId).order("updated_at", { ascending: false }).limit(limite);
    return resultado(
      (data ?? []).map((c: any) => `${c.title ?? "sem título"} — ${c.updated_at}`).join("\n") || "Sem conversas.",
      { conversas: data ?? [] },
    );
  }
  return falha(`Ferramenta desconhecida: ${nome}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const inicio = performance.now();

  if (req.method === "GET") {
    return json({
      ok: true,
      nome: "skynet-mcp",
      transporte: "streamable-http (POST JSON-RPC)",
      protocolo: PROTOCOLO,
      ferramentas: FERRAMENTAS.map((f) => f.name),
      autenticacao: "Authorization: Bearer sk-...",
    });
  }
  if (req.method !== "POST") return json({ ok: false, error: "Use POST com JSON-RPC." }, 405);

  const autor = await autorizar(req);
  if (!autor) {
    await registrar(null, "/mcp", 401, Math.round(performance.now() - inicio));
    return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Chave MCP inválida." } }, 401);
  }

  if (!(await liberar("mcp:" + autor.keyId, 90, "minute"))) return respostaLimite();

  const corpo = await req.json().catch(() => null) as any;
  if (!corpo || typeof corpo.method !== "string") {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON-RPC inválido." } }, 400);
  }
  const id = corpo.id ?? null;
  const responder = (result: unknown) => json({ jsonrpc: "2.0", id, result });
  const erro = (code: number, message: string) => json({ jsonrpc: "2.0", id, error: { code, message } });

  switch (corpo.method) {
    case "initialize":
      return responder({
        protocolVersion: PROTOCOLO,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "skynet", version: "1.0.0" },
        instructions: "Ferramentas do SKYNET: pergunte com skynet_perguntar, veja a infra com skynet_infra, guarde fatos com skynet_memoria. Modelos ficam no servidor.",
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      return new Response(null, { status: 202 });
    case "ping":
      return responder({});
    case "tools/list":
      return responder({ tools: FERRAMENTAS });
    case "tools/call": {
      const nome = String(corpo.params?.name ?? "");
      const args = corpo.params?.arguments ?? {};
      try {
        const saida = await chamarFerramenta(nome, args, autor.accountId);
        await registrar(autor, "/mcp:" + nome, 200, Math.round(performance.now() - inicio));
        return responder(saida);
      } catch (e) {
        await registrar(autor, "/mcp:" + nome, 500, Math.round(performance.now() - inicio));
        return responder(falha(`Erro ao executar ${nome}: ${(e as Error).message}`));
      }
    }
    default:
      return erro(-32601, `Método não suportado: ${corpo.method}`);
  }
});
