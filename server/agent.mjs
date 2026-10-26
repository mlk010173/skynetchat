// Backend do agente SKYNET (Render). Sem dependencias externas.
// Rotas: /health, /tools (catalogo), /mcp (JSON-RPC: tools/list, tools/call, ping),
//        /tools/web_pesquisar, /tools/abrir, /tools/memoria_salvar, /tools/memoria_buscar,
//        /tools/terminal (com whitelist e token).
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const PORT = process.env.PORT ?? 10000;
const TOKEN = process.env.AGENT_TOKEN ?? "";
const VERSION = "1.1.0";
const MAX_TEXTO = 9000;
const UA = "Mozilla/5.0 (compatible; skynet-agent/" + VERSION + ")";

const COMANDOS = {
  ls: "ls", pwd: "pwd", df: "df", free: "free", uptime: "uptime",
  node: "node", python3: "python3", git: "git",
  cat: "cat", head: "head", tail: "tail", grep: "grep", wc: "wc",
};
const PROIBIDO = /[;&|`$><\n\r\\'"*?~]/;

export function sanitizar(texto) {
  return String(texto ?? "")
    .replace(/sk-[A-Za-z0-9_\-]{8,}/g, "[removido]")
    .replace(/gsk_[A-Za-z0-9_\-]{8,}/g, "[removido]")
    .replace(/nvapi-[A-Za-z0-9_\-]{8,}/g, "[removido]")
    .replace(/AIza[A-Za-z0-9_\-]{8,}/g, "[removido]")
    .replace(/eyJ[A-Za-z0-9_\-.]{20,}/g, "[removido]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [removido]");
}

export function validarComando(linha) {
  if (typeof linha !== "string" || !linha.trim()) return { ok: false, erro: "comando vazio" };
  if (linha.length > 300) return { ok: false, erro: "comando longo demais" };
  if (PROIBIDO.test(linha)) return { ok: false, erro: "metacaractere nao permitido" };
  const partes = linha.trim().split(/\s+/);
  const bin = partes[0];
  if (!COMANDOS[bin]) return { ok: false, erro: "binario fora da whitelist: " + bin };
  return { ok: true, bin, args: partes.slice(1, 9) };
}

// ---------- ferramentas de rede ----------
const HOSTS_PROIBIDOS = /^(localhost$|127\.|0\.0\.0\.0$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[::1\]$|::1$)/i;

export function urlPermitida(valor) {
  let u;
  try { u = new URL(String(valor ?? "").trim()); } catch { return { ok: false, erro: "url invalida" }; }
  if (u.protocol !== "https:") return { ok: false, erro: "somente https" };
  if (HOSTS_PROIBIDOS.test(u.hostname)) return { ok: false, erro: "host nao permitido" };
  return { ok: true, url: u.toString() };
}

export function htmlParaTexto(html) {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function limparUrl(href) {
  let h = String(href ?? "").trim();
  if (h.startsWith("//")) h = "https:" + h;
  const m = h.match(/[?&]uddg=([^&]+)/);
  if (m) { try { return decodeURIComponent(m[1]); } catch { return h; } }
  return h;
}

export function extrairResultados(html, limite = 6) {
  const texto = String(html ?? "");
  const itens = [];
  const reLink = /<a[^>]*class="[^"]*result(?:-link|__a)[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = reLink.exec(texto)) && itens.length < limite) {
    const url = limparUrl(m[1]);
    const titulo = htmlParaTexto(m[2]).slice(0, 160);
    if (url && titulo) itens.push({ titulo, url });
  }
  const reSnip = /<(?:td|a|div)[^>]*class="[^"]*result(?:-snippet|__snippet)[^"]*"[^>]*>([\s\S]*?)<\/(?:td|a|div)>/gi;
  let s; let i = 0;
  while ((s = reSnip.exec(texto)) && i < itens.length) {
    const t = htmlParaTexto(s[1]).slice(0, 300);
    if (t) { itens[i].trecho = t; i++; }
  }
  return itens;
}

async function pesquisarWeb(consulta) {
  const q = String(consulta ?? "").trim().slice(0, 300);
  if (!q) return { ok: false, erro: "consulta vazia" };
  const alvos = ["https://html.duckduckgo.com/html/", "https://lite.duckduckgo.com/lite/"];
  for (const alvo of alvos) {
    try {
      const res = await fetch(alvo, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
        body: new URLSearchParams({ q }).toString(),
        signal: AbortSignal.timeout(12000),
      });
      const resultados = extrairResultados(await res.text(), 6);
      if (resultados.length) return { ok: true, consulta: q, fonte: alvo, quando: new Date().toISOString(), resultados };
    } catch { /* tenta o proximo */ }
  }
  return { ok: false, erro: "nenhum resultado obtido agora" };
}

async function abrirPagina(alvo) {
  const v = urlPermitida(alvo);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const res = await fetch(v.url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15000), redirect: "follow" });
    const final = urlPermitida(res.url || v.url);           // redirecionamento nao pode escapar da regra
    if (!final.ok) return { ok: false, erro: "redirecionamento bloqueado" };
    const tipo = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/json/i.test(tipo)) return { ok: false, erro: "conteudo nao textual: " + tipo };
    const bruto = await res.text();
    const texto = /json/i.test(tipo) ? bruto.slice(0, MAX_TEXTO) : htmlParaTexto(bruto).slice(0, MAX_TEXTO);
    const titulo = (bruto.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim().slice(0, 140);
    return { ok: true, url: final.url, status: res.status, titulo, texto };
  } catch (e) {
    return { ok: false, erro: sanitizar(e?.message ?? "falha ao abrir") };
  }
}

function memoriaIndisponivel() {
  return { ok: false, erro: "memoria de longo prazo nao configurada neste servidor (defina as variaveis do Supabase no Render)" };
}

async function executar(linha) {
  const v = validarComando(linha);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const { stdout, stderr } = await run(v.bin, v.args, { timeout: 8000, maxBuffer: 200 * 1024, cwd: process.cwd() });
    return { ok: true, saida: sanitizar(stdout).slice(0, 8000), erro_saida: sanitizar(stderr).slice(0, 2000) };
  } catch (e) {
    return { ok: false, erro: sanitizar(e?.message ?? "falha ao executar") };
  }
}

const FERRAMENTAS = [
  { nome: "web_pesquisar", desc: "Pesquisa na web agora (tempo real) e devolve titulo, link e trecho", entrada: "consulta", endpoint: "POST /tools/web_pesquisar" },
  { nome: "abrir", desc: "Abre uma pagina https e devolve o texto principal", entrada: "url", endpoint: "POST /tools/abrir" },
  { nome: "terminal", desc: "Executa um binario da whitelist (ls, cat, grep, node, python3, git, df...)", entrada: "cmd", endpoint: "POST /tools/terminal", protegida: true },
  { nome: "memoria_salvar", desc: "Grava um fato na memoria do agente (requer Supabase configurado no Render)", entrada: "texto", endpoint: "POST /tools/memoria_salvar" },
  { nome: "memoria_buscar", desc: "Busca na memoria do agente (requer Supabase configurado no Render)", entrada: "consulta", endpoint: "POST /tools/memoria_buscar" },
];

const json = (res, code, body) => {
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
};

async function lerCorpo(req) {
  let corpo = "";
  for await (const c of req) corpo += c;
  try { return JSON.parse(corpo || "{}"); } catch { return null; }
}

/** Executa uma ferramenta pelo nome (usado pelas rotas e pelo MCP). */
export async function executarFerramenta(nome, args = {}) {
  switch (nome) {
    case "web_pesquisar": return pesquisarWeb(args.consulta ?? args.q);
    case "abrir": return abrirPagina(args.url);
    case "memoria_salvar": return memoriaIndisponivel();
    case "memoria_buscar": return memoriaIndisponivel();
    case "terminal": return executar(args.cmd);
    default: return { ok: false, erro: "ferramenta desconhecida: " + nome };
  }
}

export const handler = async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "OPTIONS") return json(res, 204, {});

  if (url.pathname === "/health") return json(res, 200, { ok: true, servico: "skynet-agent", versao: VERSION, ferramentas: FERRAMENTAS.length });
  if (url.pathname === "/tools") return json(res, 200, { ok: true, ferramentas: FERRAMENTAS });

  if (url.pathname === "/mcp" && req.method === "POST") {
    const msg = await lerCorpo(req);
    if (!msg) return json(res, 400, { jsonrpc: "2.0", error: { code: -32700, message: "JSON invalido" } });
    if (msg.method === "tools/list") return json(res, 200, { jsonrpc: "2.0", id: msg.id, result: { tools: FERRAMENTAS.map((f) => ({ name: f.nome, description: f.desc, inputSchema: { type: "object", properties: { [f.entrada]: { type: "string" } }, required: [f.entrada] } })) } });
    if (msg.method === "tools/call") {
      const nome = msg.params?.name;
      const args = msg.params?.arguments ?? {};
      const r = await executarFerramenta(nome, args);
      return json(res, 200, { jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: JSON.stringify(r).slice(0, 12000) }], isError: !r.ok } });
    }
    if (msg.method === "ping") return json(res, 200, { jsonrpc: "2.0", id: msg.id, result: {} });
    return json(res, 200, { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "metodo nao suportado" } });
  }

  if (url.pathname === "/tools/terminal" && req.method === "POST") {
    const auth = req.headers.authorization ?? "";
    if (!TOKEN || auth !== "Bearer " + TOKEN) return json(res, 401, { ok: false, erro: "nao autorizado" });
    const dados = await lerCorpo(req);
    if (!dados) return json(res, 400, { ok: false, erro: "JSON invalido" });
    return json(res, 200, await executar(dados.cmd));
  }

  if (url.pathname === "/tools/web_pesquisar" && req.method === "POST") {
    const dados = await lerCorpo(req);
    if (!dados) return json(res, 400, { ok: false, erro: "JSON invalido" });
    return json(res, 200, await pesquisarWeb(dados.consulta ?? dados.q));
  }

  if (url.pathname === "/tools/abrir" && req.method === "POST") {
    const dados = await lerCorpo(req);
    if (!dados) return json(res, 400, { ok: false, erro: "JSON invalido" });
    return json(res, 200, await abrirPagina(dados.url));
  }

  if ((url.pathname === "/tools/memoria_salvar" || url.pathname === "/tools/memoria_buscar") && req.method === "POST") {
    return json(res, 200, memoriaIndisponivel());
  }

  return json(res, 404, { ok: false, erro: "rota nao encontrada" });
};

export const server = createServer(handler);
if (process.env.SKYNET_AGENT_NO_LISTEN !== "1") {
  server.listen(PORT, () => console.log("skynet-agent v" + VERSION + " ouvindo na porta " + PORT));
}
