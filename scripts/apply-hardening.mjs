#!/usr/bin/env node
/**
 * Aplica hardening por substituicoes exatas na versao conhecida do SKYNETchat.
 * Por seguranca, roda em dry-run por padrao. Passe --apply para gravar.
 * Uso: node scripts/apply-hardening.mjs /caminho/skynetchat --apply
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const rootArg = args.find((a) => !a.startsWith('--')) ?? '.';
const root = path.resolve(rootArg);
const apply = args.includes('--apply');
const backups = path.join(root, `.skynet-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const changes = [];

function replaceExactly(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count === 0 && source.includes(newText)) return { source, changed: false, label: `${label} (já aplicado)` };
  if (count !== 1) throw new Error(`${label}: esperado 1 trecho antigo, encontrado ${count}. Nenhum arquivo foi salvo; confira a versão do repositório.`);
  return { source: source.replace(oldText, newText), changed: true, label };
}

const ipvBlock = String.raw`const HOSTS_PROIBIDOS = /^(localhost$|127\.|0\.0\.0\.0$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[::1\]$|::1$)/i;

export function urlPermitida(valor) {
  let u;
  try { u = new URL(String(valor ?? "").trim()); } catch { return { ok: false, erro: "url invalida" }; }
  if (u.protocol !== "https:") return { ok: false, erro: "somente https" };
  if (HOSTS_PROIBIDOS.test(u.hostname)) return { ok: false, erro: "host nao permitido" };
  return { ok: true, url: u.toString() };
}`;

const ipvBlockNew = String.raw`function ipv4NaoPublico(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113);
}

function ipNaoPublico(ip) {
  const tipo = isIP(ip);
  if (tipo === 4) return ipv4NaoPublico(ip);
  if (tipo !== 6) return false;
  const h = ip.toLowerCase();
  // Bloqueia endereços IPv6 especiais, mapeados em IPv4, locais e documentação.
  if (h.startsWith("::ffff:") || h === "::" || h === "::1" || h.startsWith("fc") || h.startsWith("fd") ||
      /^fe[89ab]/.test(h) || h.startsWith("ff") || h.startsWith("2001:db8:")) return true;
  // Só permite unicast global 2000::/3.
  return !/^[23][0-9a-f]{0,3}:/i.test(h);
}

function hostnameLocal(host) {
  const h = String(host ?? "").replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") ||
    h.endsWith(".internal") || h.endsWith(".test") || h === "metadata.google.internal";
}

export function urlPermitida(valor) {
  let u;
  try { u = new URL(String(valor ?? "").trim()); } catch { return { ok: false, erro: "url invalida" }; }
  if (u.protocol !== "https:") return { ok: false, erro: "somente https" };
  if (u.username || u.password) return { ok: false, erro: "credenciais na URL nao permitidas" };
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostnameLocal(host) || (isIP(host) && ipNaoPublico(host))) return { ok: false, erro: "host nao publico" };
  return { ok: true, url: u.toString() };
}

async function urlRedePermitida(valor) {
  const validada = urlPermitida(valor);
  if (!validada.ok) return validada;
  const host = new URL(validada.url).hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return ipNaoPublico(host) ? { ok: false, erro: "IP nao publico bloqueado" } : validada;
  try {
    const enderecos = await lookup(host, { all: true, verbatim: true });
    if (!enderecos.length || enderecos.some((e) => ipNaoPublico(e.address))) {
      return { ok: false, erro: "host resolve para endereco nao publico" };
    }
    return validada;
  } catch {
    return { ok: false, erro: "nao foi possivel validar o host" };
  }
}`;

const oldOpen = String.raw`async function abrirPagina(alvo) {
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
}`;

const newOpen = String.raw`async function abrirPagina(alvo) {
  const primeira = urlPermitida(alvo);
  if (!primeira.ok) return { ok: false, erro: primeira.erro };
  let destino = primeira.url;
  // Cada salto de redirecionamento é validado ANTES de fazer a próxima requisição.
  for (let salto = 0; salto <= 5; salto++) {
    const segura = await urlRedePermitida(destino);
    if (!segura.ok) return { ok: false, erro: segura.erro };
    try {
      const res = await fetch(segura.url, {
        headers: { "user-agent": UA },
        signal: AbortSignal.timeout(15000),
        redirect: "manual",
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return { ok: false, erro: "redirecionamento sem destino" };
        if (salto === 5) return { ok: false, erro: "redirecionamentos demais" };
        let proximo;
        try { proximo = new URL(location, segura.url).toString(); }
        catch { return { ok: false, erro: "redirecionamento invalido" }; }
        const validacao = urlPermitida(proximo);
        if (!validacao.ok) return { ok: false, erro: "redirecionamento bloqueado" };
        destino = validacao.url;
        continue;
      }
      const tipo = res.headers.get("content-type") ?? "";
      if (!/text\/html|text\/plain|application\/json/i.test(tipo)) return { ok: false, erro: "conteudo nao textual: " + tipo };
      const bruto = await res.text();
      const texto = /json/i.test(tipo) ? bruto.slice(0, MAX_TEXTO) : htmlParaTexto(bruto).slice(0, MAX_TEXTO);
      const titulo = (bruto.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim().slice(0, 140);
      return { ok: true, url: segura.url, status: res.status, titulo, texto };
    } catch (e) {
      return { ok: false, erro: sanitizar(e?.message ?? "falha ao abrir") };
    }
  }
  return { ok: false, erro: "redirecionamentos demais" };
}`;

const oldNewcode = String.raw`  if (action === "newcode") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!/.+@.+\..+/.test(email)) return json(400, { ok: false, error: "email invalido" });
    const { data: row } = await admin.from("auth_codes").select("id, email").eq("recovery_email", email).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!row) return json(404, { ok: false, error: "conta nao encontrada" });
    const novo = genCode();
    const lookup = await hmacHex(novo);
    const { error: uerr } = await admin.from("auth_codes").update({
      code_hash: bcrypt.hashSync(novo, 10), code_lookup: lookup, code_enc: await aesEncrypt(novo),
    }).eq("id", row.id);
    if (uerr) return json(500, { ok: false, error: "code_update" });
    const mint = await mintSession(row.email);
    if (mint.error) return json(500, { ok: false, error: mint.error });
    return json(200, { ok: true, code: novo, session: mint.session });
  }

`;

const steps = [
  {
    file: 'server/agent.mjs',
    edits: [
      [
        `import { promisify } from "node:util";`,
        `import { promisify } from "node:util";\nimport { lookup } from "node:dns/promises";\nimport { isIP } from "node:net";\nimport { timingSafeEqual } from "node:crypto";`,
        'imports de DNS/IP/crypto',
      ],
      [
        `const SUPA_URL = process.env.SUPABASE_URL ?? "";\nconst SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";\nconst memoriaOk = () => Boolean(SUPA_URL && SUPA_KEY);`,
        `const SUPA_URL = process.env.SUPABASE_URL ?? "";\nconst SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";\nconst memoriaOk = () => Boolean(SUPA_URL && SUPA_KEY);\n\nfunction agenteAutorizado(req) {\n  const token = String(req.headers.authorization ?? "").replace(/^Bearer\\s+/i, "");\n  if (!TOKEN || !token) return false;\n  const a = Buffer.from(token);\n  const b = Buffer.from(TOKEN);\n  return a.length === b.length && timingSafeEqual(a, b);\n}`,
        'validador de token do agente',
      ],
      [ipvBlock, ipvBlockNew, 'validação de URL e DNS contra SSRF'],
      [oldOpen, newOpen, 'redirecionamentos SSRF validados antes de seguir'],
      [
        `if (url.pathname === "/tools") return json(res, 200, { ok: true, ferramentas: FERRAMENTAS });`,
        `if (url.pathname === "/tools") return json(res, 200, { ok: true, ferramentas: FERRAMENTAS.filter((f) => !f.protegida && !["memoria_salvar", "memoria_buscar", "perguntar"].includes(f.nome)) });`,
        'catálogo público sem ferramentas privilegiadas',
      ],
      [
        `  if (url.pathname === "/mcp" && req.method === "POST") {\n    const msg = await lerCorpo(req);`,
        `  if (url.pathname === "/mcp" && req.method === "POST") {\n    if (!agenteAutorizado(req)) return json(res, 401, { jsonrpc: "2.0", error: { code: -32001, message: "nao autorizado" } });\n    const msg = await lerCorpo(req);`,
        'MCP exige bearer token antes de tools/list/call',
      ],
      [
        `    const auth = req.headers.authorization ?? "";\n    if (!TOKEN || auth !== "Bearer " + TOKEN) return json(res, 401, { ok: false, erro: "nao autorizado" });`,
        `    if (!agenteAutorizado(req)) return json(res, 401, { ok: false, erro: "nao autorizado" });`,
        'unificação da autenticação do terminal',
      ],
      [
        `  if (url.pathname === "/tools/perguntar" && req.method === "POST") {\n    const b = await lerCorpo(req); return json(res, 200, await perguntar(b?.pergunta ?? b?.q ?? b?.prompt, b?.email));`,
        `  if (url.pathname === "/tools/perguntar" && req.method === "POST") {\n    if (!agenteAutorizado(req)) return json(res, 401, { ok: false, erro: "nao autorizado" });\n    const b = await lerCorpo(req); return json(res, 200, await perguntar(b?.pergunta ?? b?.q ?? b?.prompt, b?.email));`,
        'rota de IA privilegiada exige bearer token',
      ],
      [
        `  if (url.pathname === "/tools/memoria_salvar" && req.method === "POST") {\n    const b = await lerCorpo(req);\n    return json(res, 200, await memoriaSalvar(b.email, b.texto));`,
        `  if (url.pathname === "/tools/memoria_salvar" && req.method === "POST") {\n    if (!agenteAutorizado(req)) return json(res, 401, { ok: false, erro: "nao autorizado" });\n    const b = await lerCorpo(req);\n    return json(res, 200, await memoriaSalvar(b.email, b.texto));`,
        'gravação de memória não fica pública',
      ],
      [
        `  if (url.pathname === "/tools/memoria_buscar" && req.method === "POST") {\n    const b = await lerCorpo(req);\n    return json(res, 200, await memoriaBuscar(b.email, b.consulta));`,
        `  if (url.pathname === "/tools/memoria_buscar" && req.method === "POST") {\n    if (!agenteAutorizado(req)) return json(res, 401, { ok: false, erro: "nao autorizado" });\n    const b = await lerCorpo(req);\n    return json(res, 200, await memoriaBuscar(b.email, b.consulta));`,
        'consulta de memória não fica pública',
      ],
    ],
  },
  {
    file: 'supabase/functions/auth-code/index.ts',
    edits: [
      [
        `  const action = String(body.action || "");\n\n  if (action === "signup" || action === "newcode") {`,
        `  const action = String(body.action || "");\n\n  // Recuperação por código fica desativada até haver comprovação real do e-mail.\n  // Nunca devolva um código novo nem uma sessão apenas com o e-mail de recuperação.\n  if (action === "newcode") return json(410, { ok: false, error: "recovery_not_configured", message: "A recuperação segura ainda não está configurada. O código existente não foi alterado." });\n\n  if (action === "signup" || action === "recover") {`,
        'bloqueio de takeover via recuperação por e-mail',
      ],
      [
        `if (req.method === "GET") return json(200, { ok: true, turnstile_ativo: false, limite_por_hora: LIMITE_HORA, acoes: ["signup", "login", "recover", "newcode"] });`,
        `if (req.method === "GET") return json(200, { ok: true, turnstile_ativo: false, limite_por_hora: LIMITE_HORA, acoes: ["signup", "login", "recover"] });`,
        'catálogo de auth sem ação vulnerável',
      ],
      [oldNewcode, '', 'remoção da implementação vulnerável de newcode'],
      [
        `    const { count } = await admin.from("auth_codes").select("id", { count: "exact", head: true }).eq("recovery_email", email);\n    // envio por email depende de SMTP/API propria: estado honesto ate configurar\n    return json(200, { ok: true, pending: "smtp", matched: (count ?? 0) > 0 });`,
        `    // Resposta uniforme: não revelar se existe uma conta com esse e-mail.\n    // O envio precisa ser implementado e verificado antes de habilitar a recuperação.\n    return json(200, { ok: true, pending: "smtp" });`,
        'recuperação sem enumeração de contas',
      ],
    ],
  },
  {
    file: 'frontend/src/lib.js',
    edits: [
      [
        `    headers: {\n      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),\n      ...(session ? { Authorization: \`Bearer \${session.access_token}\` } : {}),\n    },`,
        `    headers: {\n      apikey: SUPA_ANON,\n      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),\n      ...(session ? { Authorization: \`Bearer \${session.access_token}\` } : {}),\n    },`,
        'apikey Supabase nas chamadas api()',
      ],
      [
        `        "Content-Type": "application/json",\n        ...(session ? { Authorization: \`Bearer \${session.access_token}\` } : {}),`,
        `        "Content-Type": "application/json",\n        apikey: SUPA_ANON,\n        ...(session ? { Authorization: \`Bearer \${session.access_token}\` } : {}),`,
        'apikey Supabase no streaming SSE',
      ],
      [
        `    headers: { "Content-Type": "application/json", ...(session ? { Authorization: \`Bearer \${session.access_token}\` } : {}) },`,
        `    headers: { "Content-Type": "application/json", apikey: SUPA_ANON, ...(session ? { Authorization: \`Bearer \${session.access_token}\` } : {}) },`,
        'apikey Supabase no askOnce',
      ],
    ],
  },
];

try {
  const preview = [];
  const pending = [];
  for (const step of steps) {
    const full = path.join(root, step.file);
    if (!fs.existsSync(full)) throw new Error(`Arquivo obrigatório não encontrado: ${step.file}`);
    let source = fs.readFileSync(full, 'utf8');
    let changed = false;
    for (const [oldText, newText, label] of step.edits) {
      const result = replaceExactly(source, oldText, newText, `${step.file}: ${label}`);
      source = result.source;
      changed ||= result.changed;
      preview.push(result.label);
    }
    if (changed) pending.push({ full, source });
  }
  console.log(`${apply ? 'APLICAÇÃO' : 'SIMULAÇÃO'} — ${preview.length} verificações de alteração`);
  for (const item of preview) console.log(`- ${item}`);
  if (!apply) {
    console.log('\nNenhum arquivo foi modificado. Rode com --apply depois de revisar o patch e criar commit/branch.');
  } else {
    fs.mkdirSync(backups, { recursive: true });
    for (const item of pending) {
      const relative = path.relative(root, item.full);
      const backup = path.join(backups, relative);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.copyFileSync(item.full, backup);
    }
    for (const item of pending) fs.writeFileSync(item.full, item.source, 'utf8');
    console.log(`\nArquivos alterados: ${pending.length}. Backups: ${backups}`);
    console.log('Ainda é obrigatório aplicar a migration e validar os serviços antes do deploy.');
  }
} catch (err) {
  console.error(`ERRO: ${err.message}`);
  console.error('O script valida todos os trechos antes de gravar qualquer arquivo. Nenhuma alteração foi salva.');
  process.exitCode = 1;
}
