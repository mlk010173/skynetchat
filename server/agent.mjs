// Backend do agente SKYNET (Render). Sem dependencias externas.
// Rotas: /health, /tools (catalogo), /mcp (JSON-RPC minimo), /tools/terminal (com whitelist).
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const PORT = process.env.PORT ?? 10000;
const TOKEN = process.env.AGENT_TOKEN ?? "";
const VERSION = "1.0.0";

// whitelist: nenhum shell, nenhum metacaractere. So estes binarios, com args validados.
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
  { nome: "terminal", desc: "Executa um binario da whitelist (ls, cat, grep, node, python3, git, df...)", entrada: "cmd" },
  { nome: "memoria_buscar", desc: "Busca na memoria vetorial do agente (Supabase pgvector)", entrada: "consulta" },
  { nome: "memoria_salvar", desc: "Grava um fato na memoria do agente", entrada: "texto" },
  { nome: "web_pesquisar", desc: "Pesquisa na web", entrada: "consulta" },
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

export const handler = async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "OPTIONS") return json(res, 204, {});

  if (url.pathname === "/health") return json(res, 200, { ok: true, servico: "skynet-agent", versao: VERSION });
  if (url.pathname === "/tools") return json(res, 200, { ok: true, ferramentas: FERRAMENTAS });

  if (url.pathname === "/mcp" && req.method === "POST") {
    let corpo = "";
    for await (const c of req) corpo += c;
    let msg = {};
    try { msg = JSON.parse(corpo || "{}"); } catch { return json(res, 400, { jsonrpc: "2.0", error: { code: -32700, message: "JSON invalido" } }); }
    if (msg.method === "tools/list") return json(res, 200, { jsonrpc: "2.0", id: msg.id, result: { tools: FERRAMENTAS.map(f => ({ name: f.nome, description: f.desc })) } });
    if (msg.method === "ping") return json(res, 200, { jsonrpc: "2.0", id: msg.id, result: {} });
    return json(res, 200, { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "metodo nao suportado" } });
  }

  if (url.pathname === "/tools/terminal" && req.method === "POST") {
    const auth = req.headers.authorization ?? "";
    if (!TOKEN || auth !== "Bearer " + TOKEN) return json(res, 401, { ok: false, erro: "nao autorizado" });
    let corpo = "";
    for await (const c of req) corpo += c;
    let dados = {};
    try { dados = JSON.parse(corpo || "{}"); } catch { return json(res, 400, { ok: false, erro: "JSON invalido" }); }
    return json(res, 200, await executar(dados.cmd));
  }

  return json(res, 404, { ok: false, erro: "rota nao encontrada" });
};

export const server = createServer(handler);
if (process.env.SKYNET_AGENT_NO_LISTEN !== "1") {
  server.listen(PORT, () => console.log("skynet-agent v" + VERSION + " ouvindo na porta " + PORT));
}
