// Servidor MCP do SKYNET (JSON-RPC 2.0 sobre HTTP).
// Compatível com o transporte "streamable http" na forma simples: POST com JSON-RPC, resposta JSON.
// Autenticação: Authorization: Bearer sk-... (mesmas chaves da API pública).
import { autorizar, json, registrar } from "../_shared/apikey.ts";
import { liberar, respostaLimite } from "../_shared/limite.ts";
import { svc } from "../_shared/sessao.ts";
import { perguntar } from "../_shared/chat.ts";

const PROTOCOLO = "2025-06-18";

const FERRAMENTAS = [
  {
    name: "skynet_perguntar",
    description: "Envia uma pergunta ao SKYNET e devolve a resposta em texto. O roteador escolhe o modelo sozinho.",
    inputSchema: {
      type: "object",
      properties: {
        mensagem: { type: "string", description: "Pergunta ou instrução para o SKYNET." },
        modelo: { type: "string", description: "Opcional. Nome exato do modelo; padrão 'auto'." },
        conversa: { type: "string", description: "Opcional. ID de conversa para manter o contexto." },
      },
      required: ["mensagem"],
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
    const mensagem = String(args?.mensagem ?? "").trim();
    if (!mensagem) return falha("Faltou o campo 'mensagem'.");
    const r = await perguntar(mensagem, args?.modelo || "auto", args?.conversa || null);
    return resultado(r.answer || "(resposta vazia)", { modelo: r.model, conversa: r.conversationId });
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
        instructions: "Ferramentas do SKYNET: pergunte qualquer coisa com skynet_perguntar. Modelos ficam no servidor.",
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
