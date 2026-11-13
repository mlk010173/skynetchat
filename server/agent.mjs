// Backend do agente SKYNET (Render). Sem dependencias externas.
// Rotas: /health, /tools (catalogo), /mcp (JSON-RPC: tools/list, tools/call, ping),
//        /tools/web_pesquisar, /tools/abrir, /tools/memoria_salvar, /tools/memoria_buscar,
//        /tools/terminal (com whitelist e token).
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { timingSafeEqual } from "node:crypto";
import { criarComputador, ACOES_DISPONIVEIS as ACOES_COMPUTADOR } from "./computer.mjs";

const run = promisify(execFile);
const PORT = process.env.PORT ?? 10000;
const TOKEN = process.env.AGENT_TOKEN ?? "";
const SUPA_URL = process.env.SUPABASE_URL ?? "";
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
const memoriaOk = () => Boolean(SUPA_URL && SUPA_KEY);

// SKYNET COMPUTER montado no mesmo processo: /compute/<acao> exige o mesmo token
// do agente. O navegador (Chromium) só sobe quando alguém chama "iniciar".
const computador = criarComputador({ autorizado: agenteAutorizado, prefixo: "/compute", instalarSinais: true });

function agenteAutorizado(req) {
  const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!TOKEN || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function memoriaSalvar(email, texto) {
  if (!memoriaOk()) return memoriaIndisponivel();
  if (!texto || typeof texto !== "string") return { ok: false, erro: "texto obrigatorio" };
  const r = await fetch(SUPA_URL + "/rest/v1/agent_memory", {
    method: "POST",
    headers: { "content-type": "application/json", apikey: SUPA_KEY, authorization: "Bearer " + SUPA_KEY, prefer: "return=minimal" },
    body: JSON.stringify({ email: email || "anonimo", texto: texto.slice(0, 4000) }),
  });
  if (!r.ok) return { ok: false, erro: "falha ao gravar (" + r.status + ")" };
  return { ok: true, gravado: true };
}
async function memoriaBuscar(email, consulta) {
  if (!memoriaOk()) return memoriaIndisponivel();
  const limpo = String(consulta || "").replace(/[%_]/g, "").slice(0, 120);
  let url = SUPA_URL + "/rest/v1/agent_memory?select=texto,criado_em&order=criado_em.desc&limit=5&texto=ilike." + encodeURIComponent("*" + limpo + "*");
  if (email) url += "&email=eq." + encodeURIComponent(email);
  const r = await fetch(url, { headers: { apikey: SUPA_KEY, authorization: "Bearer " + SUPA_KEY } });
  if (!r.ok) return { ok: false, erro: "falha na busca (" + r.status + ")" };
  return { ok: true, resultados: await r.json() };
}
const VERSION = "1.3.2";
const MAX_TEXTO = 9000;
const UA = "Mozilla/5.0 (compatible; skynet-agent/" + VERSION + ")";

// Somente leitura e diagnostico do servidor. Execucao de codigo (node, python3, sh, git)
// fica FORA de proposito: um token comprometido nao pode rodar codigo arbitrario nem
// consultar variaveis de ambiente do processo.
const COMANDOS = {
  ls: "ls", pwd: "pwd", df: "df", free: "free", uptime: "uptime",
  cat: "cat", head: "head", tail: "tail", grep: "grep", wc: "wc",
  hostname: "hostname", uname: "uname", id: "id", whoami: "whoami",
  nproc: "nproc", date: "date", lsb_release: "lsb_release", tree: "tree",
};

// Nenhum argumento pode apontar para segredo, credencial ou area de processo.
const ARG_PROIBIDO = /(\.env|environ|process\.|\.ssh|id_rsa|id_ed25519|\.keystore|\.jks|\.pem|\.crt|\/proc|\/etc\/|\/root|passwd|shadow|credential|secret|token|api[_-]?key|\.git\/|\.temp\/)/i;
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
  const args = partes.slice(1, 9);
  if (args.some((arg) => ARG_PROIBIDO.test(arg))) {
    return { ok: false, erro: "argumento aponta para arquivo sensivel: " + bin };
  }
  return { ok: true, bin, args };
}

// ---------- ferramentas de rede ----------
function ipv4NaoPublico(ip) {
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
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
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

export function extrairRSS(xml, fonte, limite = 5) {
  const out = [];
  for (const bruto of String(xml ?? "").split(/<item>/i).slice(1)) {
    if (out.length >= limite) break;
    const corpo = bruto.split(/<\/item>/i)[0];
    const semCdata = (t) => String(t ?? "").replace(/<!\[CDATA\[|\]\]>/g, "");
    const titulo = htmlParaTexto(semCdata(corpo.match(/<title>([\s\S]*?)<\/title>/i)?.[1])).slice(0, 180);
    const url = semCdata(corpo.match(/<link>([\s\S]*?)<\/link>/i)?.[1]).trim();
    const trecho = htmlParaTexto(semCdata(corpo.match(/<description>([\s\S]*?)<\/description>/i)?.[1])).slice(0, 260);
    const data = semCdata(corpo.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]).trim();
    if (titulo && /^https?:\/\//i.test(url)) {
      out.push({ titulo, url, trecho, fonte, ...(data ? { quando: data } : {}) });
    }
  }
  return out;
}

async function buscarRSS(url, fonte, limite) {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    return extrairRSS(await res.text(), fonte, limite);
  } catch { return []; }
}

async function buscarWikipedia(consulta) {
  try {
    const res = await fetch(`https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(consulta)}&format=json&utf8=1&srlimit=3`, {
      headers: { "user-agent": UA }, signal: AbortSignal.timeout(10000),
    });
    const d = await res.json();
    return (d?.query?.search ?? []).map((r) => ({
      titulo: r.title,
      url: "https://pt.wikipedia.org/wiki/" + encodeURIComponent(String(r.title).replace(/ /g, "_")),
      trecho: htmlParaTexto(r.snippet).slice(0, 260),
      fonte: "wikipedia",
    }));
  } catch { return []; }
}

async function buscarDuckDuckGo(consulta) {
  for (const alvo of ["https://html.duckduckgo.com/html/", "https://lite.duckduckgo.com/lite/"]) {
    try {
      const res = await fetch(alvo, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
        body: new URLSearchParams({ q: consulta }).toString(),
        signal: AbortSignal.timeout(12000),
      });
      const achados = extrairResultados(await res.text(), 4).map((r) => ({ ...r, fonte: "duckduckgo" }));
      if (achados.length) return achados;
    } catch { /* tenta o proximo */ }
  }
  return [];
}

// Feeds de notícia com URL REAL do publicador e data de publicação.
// O RSS de busca do Google News foi removido: ele devolve link opaco
// (news.google.com/rss/articles/CBMi...) que nao abre a materia e nao traz data util.
const FEEDS_NOTICIAS = [
  { url: "https://agenciabrasil.ebc.com.br/rss/politica/feed.xml", fonte: "Agencia Brasil (EBC)", oficial: true },
  { url: "https://agenciabrasil.ebc.com.br/rss/geral/feed.xml", fonte: "Agencia Brasil (EBC)", oficial: true },
  { url: "https://g1.globo.com/rss/g1/politica/", fonte: "G1 Politica", oficial: false },
  { url: "https://www.poder360.com.br/feed/", fonte: "Poder360", oficial: false },
  { url: "https://feeds.folha.uol.com.br/poder/rss091.xml", fonte: "Folha Poder", oficial: false },
];

const PARADAS = new Set(["para","com","sobre","hoje","agora","quais","qual","noticia","noticias","notícia","notícias","governo","ultimas","últimas","mais","recente","recentes","favor","diga","mostre","lista","sobre"]);

export function termosDaConsulta(q) {
  return String(q || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !PARADAS.has(t))
    .slice(0, 8);
}

// RFC 822 ("Thu, 12 Nov 2026 20:48:00 -0300") ou ISO -> Date
export function dataDePublicacao(bruta) {
  const t = String(bruta ?? "").trim();
  if (!t) return null;
  const d = new Date(t.replace(/\s+[A-Z]{2,4}$/, ""));
  if (Number.isNaN(d.getTime())) {
    const d2 = new Date(t);
    return Number.isNaN(d2.getTime()) ? null : d2;
  }
  return d;
}

async function buscarNoticias(consulta, limite = 10) {
  const blocos = await Promise.all(FEEDS_NOTICIAS.map((f) => buscarRSS(f.url, f.fonte, 6)));
  const termos = termosDaConsulta(consulta);
  const todas = [];
  blocos.forEach((lista, i) => {
    for (const r of lista || []) {
      const data = dataDePublicacao(r.quando);
      todas.push({
        titulo: r.titulo,
        url: r.url,
        trecho: r.trecho,
        fonte: r.fonte,
        oficial: FEEDS_NOTICIAS[i].oficial,
        publicado_em: data ? data.toISOString() : null,
        quando: data ? data.toISOString() : r.quando || "",
        _ts: data ? data.getTime() : 0,
      });
    }
  });
  if (!todas.length) return [];
  // relevância: casa termos do pedido no título/trecho; sem casar nada, mantém as mais recentes
  const pontuada = todas.map((r) => {
    const alvo = `${r.titulo} ${r.trecho}`.toLowerCase();
    const acertos = termos.filter((t) => alvo.includes(t)).length;
    return { ...r, _acertos: acertos };
  });
  const relevantes = pontuada.filter((r) => r._acertos > 0);
  const base = relevantes.length >= 3 ? relevantes : pontuada;
  base.sort((a, b) => (b._acertos - a._acertos) || (b._ts - a._ts));
  return base.slice(0, limite).map(({ _ts, _acertos, ...r }) => r);
}

const PEDE_NOTICIA = /\b(not[ií]cia|not[ií]cias|manchete|manchetes|jornal|governo|planalto|congresso|stf|pol[ií]tica|economia|infla[cç][aã]o|d[oó]lar|hoje|agora|atuais|recentes)\b/i;

async function pesquisarWeb(consulta) {
  const q = String(consulta ?? "").trim().slice(0, 300);
  if (!q) return { ok: false, erro: "consulta vazia" };
  const enc = encodeURIComponent(q);
  const querNoticia = PEDE_NOTICIA.test(q);
  const [noticias, web, wiki] = await Promise.all([
    buscarNoticias(q, querNoticia ? 10 : 4),
    buscarRSS(`https://www.bing.com/search?q=${enc}&format=rss&setlang=pt-BR`, "web", 5),
    buscarWikipedia(q),
  ]);
  let resultados = [...noticias, ...web, ...wiki];
  if (!resultados.length) resultados = await buscarDuckDuckGo(q);
  const vistos = new Set();
  const unicos = [];
  for (const r of resultados) {
    if (vistos.has(r.url) || unicos.length >= 8) continue;
    vistos.add(r.url); unicos.push(r);
  }
  if (!unicos.length) return { ok: false, erro: "nenhuma fonte respondeu agora" };
  return {
    ok: true,
    consulta: q,
    quando: new Date().toISOString(),
    coletado_em: new Date().toISOString(),
    fontes: ["agencia-brasil", "g1", "poder360", "folha", "bing", "wikipedia"],
    noticias_com_data: unicos.filter((r) => r.publicado_em).length,
    resultados: unicos,
  };
}

const SUPA_FN = "https://rkgwhhtenfozdwzpvxjj.supabase.co/functions/v1";

async function gerarImagem(prompt, aspect) {
  const p = String(prompt ?? "").trim().slice(0, 1200);
  if (!p) return { ok: false, erro: "prompt vazio" };
  try {
    const r = await fetch(`${SUPA_FN}/imagem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: p, aspect_ratio: aspect || "1:1" }),
      signal: AbortSignal.timeout(90000),
    });
    const d = await r.json();
    if (!d?.ok) return { ok: false, erro: String(d?.error ?? d?.detalhe ?? "falha na geracao").slice(0, 200) };
    return { ok: true, modelo: d.modelo, formato: d.formato, seed: d.seed, data_url: d.data_url, tamanho_base64: String(d.imagem_base64 ?? "").length };
  } catch (e) {
    return { ok: false, erro: sanitizar(e?.message ?? "falha ao gerar imagem") };
  }
}

async function abrirPagina(alvo) {
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


// ---------- ferramentas de dia a dia ----------
export function calcular(expr) {
  const s = String(expr ?? "").replace(/\s+/g, "");
  if (!s || s.length > 200) return { ok: false, erro: "expressao vazia" };
  let i = 0;
  const peek = () => s[i];
  function numero() {
    const j = i;
    while (i < s.length && /[0-9.]/.test(s[i])) i++;
    if (j === i) throw new Error("numero esperado");
    return parseFloat(s.slice(j, i));
  }
  function fator() {
    if (peek() === "(") { i++; const v = raiz(); if (peek() !== ")") throw new Error("falta )"); i++; return v; }
    if (peek() === "-") { i++; return -fator(); }
    if (peek() === "+") { i++; return fator(); }
    let b = numero();
    if (peek() === "^") { i++; b = Math.pow(b, fator()); }
    else if (peek() === "%") { i++; b = b % fator(); }
    return b;
  }
  function termo() {
    let v = fator();
    while (peek() === "*" || peek() === "/") { const op = s[i++]; const r = fator(); v = op === "*" ? v * r : v / r; }
    return v;
  }
  function raiz() {
    let v = termo();
    while (peek() === "+" || peek() === "-") { const op = s[i++]; const r = termo(); v = op === "+" ? v + r : v - r; }
    return v;
  }
  try {
    const v = raiz();
    if (i !== s.length || !Number.isFinite(v)) return { ok: false, erro: "expressao invalida" };
    return { ok: true, expressao: String(expr), resultado: v };
  } catch { return { ok: false, erro: "expressao invalida" }; }
}

async function converterMoeda(de, para, valor) {
  const base = String(de || "USD").toUpperCase(), alvo = String(para || "BRL").toUpperCase();
  const qtd = Number(valor ?? 1) || 1;
  if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(alvo)) return { ok: false, erro: "use codigos de 3 letras (USD, BRL, EUR)" };
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/" + base, { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    const taxa = d?.rates?.[alvo];
    if (!taxa) return { ok: false, erro: "moeda nao encontrada" };
    return { ok: true, de: base, para: alvo, valor: qtd, taxa, resultado: +(qtd * taxa).toFixed(4), atualizado: d.time_last_update_utc };
  } catch { return { ok: false, erro: "falha ao consultar a cotacao" }; }
}

async function clima(cidade) {
  const c = String(cidade || "").trim();
  if (!c) return { ok: false, erro: "informe a cidade" };
  try {
    const r = await fetch("https://wttr.in/" + encodeURIComponent(c) + "?format=j1", { signal: AbortSignal.timeout(9000), headers: { "user-agent": "curl/8.0" } });
    const d = await r.json();
    const cur = d?.current_condition?.[0];
    if (!cur) return { ok: false, erro: "sem dados de clima" };
    return { ok: true, cidade: c, temperatura_c: cur.temp_C, sensacao_c: cur.FeelsLikeC, umidade: cur.humidity, vento_kmh: cur.windspeedKmph, descricao: cur.weatherDesc?.[0]?.value };
  } catch { return { ok: false, erro: "falha ao consultar o clima" }; }
}

export function agora() {
  const d = new Date();
  return { ok: true, iso_utc: d.toISOString(), sao_paulo: d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" }), timestamp: d.getTime() };
}

// ---------- inteligencia: o agente pensa usando o backend de IA ----------
async function perguntar(pergunta, email) {
  const p = String(pergunta || "").trim();
  if (!p) return { ok: false, erro: "informe a pergunta" };
  if (!SUPA_URL) return { ok: false, erro: "backend de IA nao configurado" };
  try {
    const r = await fetch(SUPA_URL + "/functions/v1/chat", {
      method: "POST",
      headers: { "content-type": "application/json", apikey: SUPA_KEY },
      body: JSON.stringify({ content: p, email }),
      signal: AbortSignal.timeout(60000),
    });
    const txt = await r.text();
    const deltas = [...txt.matchAll(/"delta":"((?:[^"\\]|\\.)*)"/g)].map((m) => { try { return JSON.parse('"' + m[1] + '"'); } catch { return ""; } });
    const resposta = deltas.join("");
    return resposta ? { ok: true, pergunta: p, resposta } : { ok: false, erro: "sem resposta da IA" };
  } catch { return { ok: false, erro: "falha ao consultar a IA" }; }
}

const FERRAMENTAS = [
  { nome: "web_pesquisar", desc: "Pesquisa na web agora (Google News + Bing + Wikipedia) e devolve titulo, link e trecho", entrada: "consulta", endpoint: "POST /tools/web_pesquisar" },
  { nome: "abrir", desc: "Abre uma pagina https e devolve o texto principal", entrada: "url", endpoint: "POST /tools/abrir" },
  { nome: "imagem", desc: "Gera imagem (flux-3) e devolve a imagem em data URL", entrada: "prompt", endpoint: "POST /tools/imagem" },
  { nome: "terminal", desc: "Executa um binario da whitelist (ls, cat, grep, node, python3, git, df...)", entrada: "cmd", endpoint: "POST /tools/terminal", protegida: true },
  { nome: "memoria_salvar", desc: "Grava um fato na memoria de longo prazo do agente (Supabase)", entrada: "texto", endpoint: "POST /tools/memoria_salvar" },
  { nome: "memoria_buscar", desc: "Busca fatos na memoria de longo prazo do agente (Supabase)", entrada: "consulta", endpoint: "POST /tools/memoria_buscar" },
  { nome: "calcular", desc: "Faz contas com seguranca (+ - * / ( ) % ^)", entrada: "expressao", endpoint: "POST /tools/calcular" },
  { nome: "moeda", desc: "Cotacao de moedas ao vivo (ex: de USD para BRL)", entrada: "de", endpoint: "POST /tools/moeda" },
  { nome: "clima", desc: "Clima agora de uma cidade", entrada: "cidade", endpoint: "POST /tools/clima" },
  { nome: "hora", desc: "Data e hora atuais (Sao Paulo e UTC)", entrada: "nada", endpoint: "GET /tools/hora" },
  { nome: "perguntar", desc: "Pede ao cerebro de IA do SKYNET uma resposta em linguagem natural (raciocinio, resumo, traducao, texto)", entrada: "pergunta", endpoint: "POST /tools/perguntar" },
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
    case "imagem": return gerarImagem(args.prompt ?? args.p, args.aspect_ratio);
    case "memoria_salvar": return memoriaSalvar(args.email, args.texto);
    case "memoria_buscar": return memoriaBuscar(args.email, args.consulta);
    case "terminal": return executar(args.cmd);
    case "calcular": return calcular(args.expressao ?? args.expr ?? args.q);
    case "moeda": return converterMoeda(args.de, args.para, args.valor);
    case "clima": return clima(args.cidade ?? args.q);
    case "hora": return agora();
    case "perguntar": return perguntar(args.pergunta ?? args.q ?? args.prompt, args.email);
    default: return { ok: false, erro: "ferramenta desconhecida: " + nome };
  }
}

export const handler = async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "OPTIONS") return json(res, 204, {});

  if (url.pathname === "/health") return json(res, 200, { ok: true, servico: "skynet-agent", versao: VERSION, ferramentas: FERRAMENTAS.length, computador: ACOES_COMPUTADOR.length });

  // ---- SKYNET COMPUTER / LIVE WORKSPACE (/compute/iniciar, /compute/tela, ...) ----
  if (url.pathname === "/compute" || url.pathname.startsWith("/compute/")) {
    if (!agenteAutorizado(req)) return json(res, 401, { ok: false, erro: "nao autorizado" });
    if (url.pathname === "/compute" && req.method !== "POST") {
      return json(res, 200, { ok: true, acoes: ACOES_COMPUTADOR });
    }
    await computador.atender(req, res, url);
    return;
  }
  if (url.pathname === "/tools") return json(res, 200, { ok: true, ferramentas: FERRAMENTAS.filter((f) => !f.protegida && !["memoria_salvar", "memoria_buscar", "perguntar"].includes(f.nome)) });

  if (url.pathname === "/mcp" && req.method === "POST") {
    if (!agenteAutorizado(req)) return json(res, 401, { jsonrpc: "2.0", error: { code: -32001, message: "nao autorizado" } });
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
    if (!agenteAutorizado(req)) return json(res, 401, { ok: false, erro: "nao autorizado" });
    const dados = await lerCorpo(req);
    if (!dados) return json(res, 400, { ok: false, erro: "JSON invalido" });
    return json(res, 200, await executar(dados.cmd));
  }

  if (url.pathname === "/tools/web_pesquisar" && req.method === "POST") {
    if (!agenteAutorizado(req)) return json(res, 401, { ok: false, erro: "nao autorizado" });
    const dados = await lerCorpo(req);
    if (!dados) return json(res, 400, { ok: false, erro: "JSON invalido" });
    return json(res, 200, await pesquisarWeb(dados.consulta ?? dados.q));
  }

  if (url.pathname === "/tools/imagem" && req.method === "POST") {
    if (!agenteAutorizado(req)) return json(res, 401, { ok: false, erro: "nao autorizado" });
    const dados = await lerCorpo(req);
    if (!dados) return json(res, 400, { ok: false, erro: "JSON invalido" });
    return json(res, 200, await gerarImagem(dados.prompt ?? dados.p, dados.aspect_ratio));
  }

  if (url.pathname === "/tools/abrir" && req.method === "POST") {
    if (!agenteAutorizado(req)) return json(res, 401, { ok: false, erro: "nao autorizado" });
    const dados = await lerCorpo(req);
    if (!dados) return json(res, 400, { ok: false, erro: "JSON invalido" });
    return json(res, 200, await abrirPagina(dados.url));
  }

  if (url.pathname === "/tools/calcular" && req.method === "POST") {
    if (!agenteAutorizado(req)) return json(res, 401, { ok: false, erro: "nao autorizado" });
    const b = await lerCorpo(req); return json(res, 200, calcular(b?.expressao ?? b?.expr ?? b?.q));
  }
  if (url.pathname === "/tools/moeda" && req.method === "POST") {
    if (!agenteAutorizado(req)) return json(res, 401, { ok: false, erro: "nao autorizado" });
    const b = await lerCorpo(req); return json(res, 200, await converterMoeda(b?.de, b?.para, b?.valor));
  }
  if (url.pathname === "/tools/clima" && req.method === "POST") {
    if (!agenteAutorizado(req)) return json(res, 401, { ok: false, erro: "nao autorizado" });
    const b = await lerCorpo(req); return json(res, 200, await clima(b?.cidade ?? b?.q));
  }
  if (url.pathname === "/tools/hora") {
    if (!agenteAutorizado(req)) return json(res, 401, { ok: false, erro: "nao autorizado" });
    return json(res, 200, agora());
  }
  if (url.pathname === "/tools/perguntar" && req.method === "POST") {
    if (!agenteAutorizado(req)) return json(res, 401, { ok: false, erro: "nao autorizado" });
    const b = await lerCorpo(req); return json(res, 200, await perguntar(b?.pergunta ?? b?.q ?? b?.prompt, b?.email));
  }
  if (url.pathname === "/tools/memoria_salvar" && req.method === "POST") {
    if (!agenteAutorizado(req)) return json(res, 401, { ok: false, erro: "nao autorizado" });
    const b = await lerCorpo(req);
    return json(res, 200, await memoriaSalvar(b.email, b.texto));
  }
  if (url.pathname === "/tools/memoria_buscar" && req.method === "POST") {
    if (!agenteAutorizado(req)) return json(res, 401, { ok: false, erro: "nao autorizado" });
    const b = await lerCorpo(req);
    return json(res, 200, await memoriaBuscar(b.email, b.consulta));
  }

  return json(res, 404, { ok: false, erro: "rota nao encontrada" });
};

export const server = createServer(handler);
if (process.env.SKYNET_AGENT_NO_LISTEN !== "1") {
  server.listen(PORT, () => console.log("skynet-agent v" + VERSION + " ouvindo na porta " + PORT));
}
