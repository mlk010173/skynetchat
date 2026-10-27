#!/usr/bin/env node
/**
 * SKYNET MCP server — JSON-RPC 2.0 sobre stdio (padrão) e HTTP (?http=1 ou PORT).
 * Sem dependências externas. Segredos só por variável de ambiente.
 */
import http from "node:http";

export const VERSION = "1.0.0";
export const ENDPOINTS = {
  render: process.env.RENDER_URL || "https://skynet-agent.onrender.com",
  supabase: process.env.SUPABASE_URL || "https://rkgwhhtenfozdwzpvxjj.supabase.co",
  vercel: process.env.VERCEL_URL || "https://skynetchat-xi.vercel.app",
  pages: process.env.PAGES_URL || "https://mlk010173.github.io/skynetchat/",
};

/** Conectores: apenas o que foi comprovado. Nada é marcado operacional sem prova. */
export const CONNECTORS = [
  { name: "gmail", label: "Gmail", authorized: true, scopes: ["gmail.readonly", "gmail.send", "gmail.modify"], can: ["ler", "enviar", "marcar/excluir (lixeira)"], evidence: "profile 200 + leitura da INBOX em 27/10/2026" },
  { name: "github", label: "GitHub", authorized: true, scopes: ["read:user", "repo"], can: ["ler", "escrever codigo", "abrir PR"], evidence: "PR #1 aberto em mlk010173/skynetchat" },
  { name: "supabase", label: "Supabase", authorized: true, scopes: ["database", "edge_functions", "secrets", "auth", "storage:read"], can: ["ler/escrever banco", "publicar funcoes"], evidence: "chat v27 publicado" },
  { name: "googledrive", label: "Google Drive", authorized: false, scopes: ["drive.readonly", "drive.file"], can: [], evidence: "aprovacao pendente do proprietario" },
];

export const SCREENS = [
  { path: "/", name: "home" },
  { path: "/login", name: "login" },
  { path: "/sign-up", name: "cadastro" },
  { path: "/chat", name: "chat" },
  { path: "/voz", name: "voz" },
  { path: "/monetize", name: "monetizacao" },
  { path: "/termos", name: "termos" },
];

const EDGE = new Set(["chat", "models", "conversations", "imagem"]);

export const TOOLS = [
  { name: "skynet_status", description: "Verifica ao vivo Render, Supabase, Vercel e Pages. Retorna codigo HTTP de cada um.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "skynet_connectors", description: "Lista conectores nativos com estado de autorizacao, escopos e grau de permissao.", inputSchema: { type: "object", properties: { onlyAuthorized: { type: "boolean" } } } },
  { name: "skynet_api", description: "Chama uma funcao edge do Supabase (chat, models, conversations, imagem).", inputSchema: { type: "object", properties: { function: { type: "string" }, payload: { type: "object" } }, required: ["function"] } },
  { name: "skynet_screens", description: "Lista as telas/rotas do app e a URL publica de cada uma.", inputSchema: { type: "object", properties: { base: { type: "string" } } } },
  { name: "skynet_subagent", description: "Executa uma tarefa delimitada como subagente: no maximo 3 passos, usando a funcao chat.", inputSchema: { type: "object", properties: { goal: { type: "string" }, maxSteps: { type: "number" } }, required: ["goal"] } },
];

export function validateToolCall(name, args = {}) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { ok: false, error: `ferramenta desconhecida: ${name}` };
  for (const req of tool.inputSchema.required || []) {
    if (args[req] === undefined || args[req] === null || args[req] === "") return { ok: false, error: `campo obrigatorio ausente: ${req}` };
  }
  if (name === "skynet_api" && !EDGE.has(args.function)) return { ok: false, error: `funcao nao permitida: ${args.function}` };
  if (name === "skynet_subagent" && typeof args.goal !== "string") return { ok: false, error: "goal precisa ser texto" };
  return { ok: true, tool };
}

async function ping(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    return { url, status: r.status, ok: r.ok };
  } catch (e) {
    return { url, status: 0, ok: false, error: e.name === "AbortError" ? "timeout" : "falha de rede" };
  } finally { clearTimeout(t); }
}

export async function callTool(name, args = {}) {
  const v = validateToolCall(name, args);
  if (!v.ok) return { ok: false, error: v.error };

  if (name === "skynet_status") {
    const [render, supabase, vercel, pages] = await Promise.all([
      ping(`${ENDPOINTS.render}/health`),
      ping(`${ENDPOINTS.supabase}/functions/v1/models`),
      ping(ENDPOINTS.vercel),
      ping(ENDPOINTS.pages),
    ]);
    return { ok: true, render, supabase, vercel, pages };
  }
  if (name === "skynet_connectors") {
    const list = args.onlyAuthorized ? CONNECTORS.filter((c) => c.authorized) : CONNECTORS;
    return { ok: true, total: list.length, authorized: list.filter((c) => c.authorized).length, connectors: list };
  }
  if (name === "skynet_screens") {
    const base = (args.base || ENDPOINTS.vercel).replace(/\/$/, "");
    return { ok: true, screens: SCREENS.map((s) => ({ ...s, url: base + s.path })) };
  }
  if (name === "skynet_api") {
    const key = process.env.SUPABASE_ANON_KEY || "";
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60000);
    try {
      const r = await fetch(`${ENDPOINTS.supabase}/functions/v1/${args.function}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(key ? { apikey: key } : {}) },
        body: JSON.stringify(args.payload || {}),
        signal: ctrl.signal,
      });
      const text = await r.text();
      return { ok: r.ok, status: r.status, body: text.slice(0, 4000) };
    } catch (e) {
      return { ok: false, status: 0, error: e.name === "AbortError" ? "timeout" : "falha de rede" };
    } finally { clearTimeout(t); }
  }
  if (name === "skynet_subagent") {
    const maxSteps = Math.min(Math.max(Number(args.maxSteps) || 1, 1), 3);
    const steps = [];
    let context = args.goal;
    for (let i = 1; i <= maxSteps; i++) {
      const r = await callTool("skynet_api", { function: "chat", payload: { content: context } });
      const trace = r.body ? r.body.match(/"delta":"((?:[^"\\]|\\.)*)"/g) : null;
      const answer = trace ? trace.map((m) => JSON.parse(`"${m.slice(9, -1)}"`)).join("") : (r.body || "");
      steps.push({ step: i, status: r.status, chars: answer.length });
      if (!answer) break;
      context = `${args.goal}\n\nResultado anterior: ${answer.slice(0, 800)}`;
      if (i === maxSteps) return { ok: true, steps, answer: answer.slice(0, 2000) };
    }
    return { ok: steps.length > 0, steps, answer: "" };
  }
  return { ok: false, error: "nao implementado" };
}

export function buildRpcResponse(msg) {
  const { id = null, method, params } = msg || {};
  const reply = (result) => ({ jsonrpc: "2.0", id, result });
  const fail = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

  if (!method) return fail(-32600, "requisicao invalida");
  if (method === "initialize") {
    return reply({ protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "skynet-mcp", version: VERSION } });
  }
  if (method === "ping") return reply({ ok: true });
  if (method === "tools/list") return reply({ tools: TOOLS });
  if (method === "shutdown") return reply({ ok: true });
  if (method !== "tools/call") return fail(-32601, `metodo nao encontrado: ${method}`);
  return null; // resolvido no runtime assincrono
}

async function handle(msg) {
  const sync = buildRpcResponse(msg);
  if (sync) return sync;
  if (msg.method === "tools/call") {
    const { name, arguments: args } = msg.params || {};
    const out = await callTool(name, args || {});
    return {
      jsonrpc: "2.0",
      id: msg.id ?? null,
      result: { content: [{ type: "text", text: JSON.stringify(out) }], isError: !out.ok },
    };
  }
  return { jsonrpc: "2.0", id: msg.id ?? null, error: { code: -32601, message: "nao suportado" } };
}

function startHttp() {
  const port = Number(process.env.PORT || 8090);
  http.createServer((req, res) => {
    if (req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: true, name: "skynet-mcp", version: VERSION, tools: TOOLS.map((t) => t.name) }));
    }
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on("end", async () => {
      let msg;
      try { msg = JSON.parse(raw || "{}"); } catch { res.writeHead(400).end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON invalido" } })); return; }
      const out = await handle(msg);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
    });
  }).listen(port, () => process.stderr.write(`skynet-mcp HTTP em :${port}\n`));
}

function startStdio() {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", async (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON invalido" } }) + "\n"); continue; }
      const out = await handle(msg);
      process.stdout.write(JSON.stringify(out) + "\n");
    }
  });
}

const isMain = process.argv[1] && process.argv[1].endsWith("mcp-server.mjs");
if (isMain) {
  if (process.argv.includes("--http") || process.env.MCP_HTTP === "1") startHttp();
  else startStdio();
}
