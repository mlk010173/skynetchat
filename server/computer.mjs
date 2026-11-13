// SKYNET COMPUTER / LIVE WORKSPACE — navegador de verdade controlado pelo agente.
// Um Chromium headless por sessão, com screenshot ao vivo, clique, digitação, abas,
// console, rede, DOM, acessibilidade, performance e teste de responsividade.
//
// Nada aqui é simulado: cada resposta vem do browser. Se o browser não sobe, a
// resposta é { ok:false, erro:"..." } e, no diagnóstico, motivo:"browser_indisponivel"
// com as tentativas reais — nunca uma tela inventada.
//
// Montado em server/agent.mjs nas rotas POST /compute/<acao>.
// Também pode subir sozinho (tests/computer.local.mjs usa isso):
//   import { criarServidorCompute } from "./computer.mjs";
//   const srv = criarServidorCompute({ token: "..." }); srv.listen(0);

import { createServer } from "node:http";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { timingSafeEqual } from "node:crypto";

export const VERSAO = "1.0.0";

// ---------------------------------------------------------------- constantes
export const LARGURA = 1280;
export const ALTURA = 800;
const QUALIDADE_JPEG = 60;
export const MAX_SESSOES = 2;
export const OCIOSO_MS = 10 * 60 * 1000; // 10 min sem uso -> encerra a sessão
const TIMEOUT_ACAO = 10_000; // 10s por ação
const TIMEOUT_NAV = 20_000; // 20s por navegação
const MAX_CONSOLE = 300;
const MAX_REDE = 400;
const MAX_LOGS = 200;
const MAX_HTML = 24_000;
const ARGS_CHROMIUM = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];

// ---------------------------------------------------------------- utilidades
const agora = () => Date.now();

export function sanitizarTexto(valor) {
  return String(valor ?? "")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[removido]")
    .replace(/eyJ[A-Za-z0-9_.-]{20,}/g, "[removido]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [removido]");
}

function erroDe(e) {
  const msg = String(e?.message ?? e ?? "erro desconhecido");
  return sanitizarTexto(msg.split("\n").slice(0, 3).join(" ")).slice(0, 300);
}

/** Extrai nomes de bibliotecas do sistema ausentes a partir do erro do linker. */
export function libsFaltando(texto) {
  const bruto = String(texto ?? "");
  const achados = new Set();
  const re = /error while loading shared libraries:\s*([\w.+-]+)[^\n]*/g;
  let m;
  while ((m = re.exec(bruto))) achados.add(m[1]);
  if (!achados.size) {
    const re2 = /lib[\w.+-]+\.so[.\d]*/g;
    let n;
    while ((n = re2.exec(bruto))) achados.add(n[0]);
  }
  return [...achados];
}

/** Caminhos candidatos de Chromium, do mais provável ao menos provável. */
export function candidatosChromium() {
  const lista = [];
  const push = (p) => {
    if (p && !lista.includes(p)) lista.push(p);
  };
  push(process.env.CHROME_PATH);
  push(process.env.PUPPETEER_EXECUTABLE_PATH);

  const raizs = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(homedir(), ".cache", "ms-playwright")].filter(Boolean);
  for (const raiz of raizs) {
    if (!existsSync(raiz)) continue;
    let dirs = [];
    try {
      dirs = readdirSync(raiz);
    } catch {
      continue;
    }
    for (const d of dirs.slice().sort().reverse()) {
      if (d.startsWith("chromium_headless_shell")) {
        push(join(raiz, d, "chrome-headless-shell-linux64", "chrome-headless-shell"));
        push(join(raiz, d, "chrome-linux", "chrome-headless-shell"));
      }
      if (d.startsWith("chromium-")) {
        push(join(raiz, d, "chrome-linux64", "chrome"));
        push(join(raiz, d, "chrome-linux", "chrome"));
      }
    }
  }

  for (const p of [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/opt/google/chrome/chrome",
    "/usr/lib/chromium/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ]) push(p);

  return lista.filter((p) => existsSync(p));
}

/** Versão de uma dependência instalada (null se não existir). Não usa require: ESM puro. */
export function versaoPacote(nome) {
  try {
    const base = join(process.cwd(), "node_modules", nome, "package.json");
    if (!existsSync(base)) return null;
    return JSON.parse(readFileSync(base, "utf8")).version ?? null;
  } catch {
    return null;
  }
}

async function importar(nome) {
  try {
    return await import(nome);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- driver
/**
 * Abre um Chromium de verdade. Ordem:
 *   1. BROWSER_WS_ENDPOINT (playwright connectOverCDP) — browser remoto já rodando
 *   2. playwright chromium.launch (headless shell do cache, chrome do sistema, padrão)
 *   3. puppeteer-core com CHROME_PATH
 * Devolve { ok, motor, navegador, versao, executavel, erro, tentativas, libs_faltando }.
 * Nunca lança: falha é dado, não exceção.
 */
export async function abrirNavegador() {
  const tentativas = [];
  const t0 = agora();

  // 1) endpoint CDP remoto
  const ws = (process.env.BROWSER_WS_ENDPOINT ?? "").trim();
  if (ws) {
    const pw = await importar("playwright");
    if (!pw) {
      tentativas.push({ motor: "playwright", alvo: "BROWSER_WS_ENDPOINT", ok: false, erro: "pacote playwright não instalado" });
    } else {
      try {
        const navegador = await pw.chromium.connectOverCDP(ws, { timeout: TIMEOUT_NAV });
        return {
          ok: true,
          motor: "playwright",
          conexao: "cdp",
          navegador,
          versao: navegador.version(),
          executavel: "BROWSER_WS_ENDPOINT",
          tentativas,
          ms: agora() - t0,
        };
      } catch (e) {
        tentativas.push({ motor: "playwright", alvo: "BROWSER_WS_ENDPOINT", ok: false, erro: erroDe(e) });
      }
    }
  }

  // 2) playwright local
  const pw = await importar("playwright");
  if (!pw) {
    tentativas.push({ motor: "playwright", alvo: "import", ok: false, erro: "módulo playwright não encontrado (npm i playwright)" });
  } else {
    const alvos = candidatosChromium();
    alvos.push(null); // null = deixa o playwright escolher o browser que ele baixou
    for (const executavel of alvos) {
      try {
        const navegador = await pw.chromium.launch({
          args: ARGS_CHROMIUM,
          ...(executavel ? { executablePath: executavel } : {}),
          timeout: TIMEOUT_NAV,
        });
        return {
          ok: true,
          motor: "playwright",
          conexao: "local",
          navegador,
          versao: navegador.version(),
          executavel: executavel ?? "(padrão do playwright)",
          tentativas,
          ms: agora() - t0,
        };
      } catch (e) {
        tentativas.push({
          motor: "playwright",
          alvo: executavel ?? "(padrão do playwright)",
          ok: false,
          erro: erroDe(e),
          libs_faltando: libsFaltando(e?.message),
        });
      }
    }
  }

  // 3) puppeteer-core
  const pptr = await importar("puppeteer-core");
  if (!pptr) {
    tentativas.push({ motor: "puppeteer", alvo: "import", ok: false, erro: "módulo puppeteer-core não encontrado" });
  } else {
    const alvos = candidatosChromium();
    if (!alvos.length) {
      tentativas.push({ motor: "puppeteer", alvo: "CHROME_PATH", ok: false, erro: "nenhum executável de Chromium encontrado (defina CHROME_PATH)" });
    }
    for (const executavel of alvos) {
      try {
        const pptrMod = pptr.default ?? pptr;
        const navegador = await pptrMod.launch({
          executablePath: executavel,
          headless: true,
          args: ARGS_CHROMIUM,
          timeout: TIMEOUT_NAV,
          protocolTimeout: 60_000,
        });
        return {
          ok: true,
          motor: "puppeteer",
          conexao: "local",
          navegador,
          versao: await navegador.version(),
          executavel,
          tentativas,
          ms: agora() - t0,
        };
      } catch (e) {
        tentativas.push({
          motor: "puppeteer",
          alvo: executavel,
          ok: false,
          erro: erroDe(e),
          libs_faltando: libsFaltando(e?.message),
        });
      }
    }
  }

  const libs = [...new Set(tentativas.flatMap((t) => t.libs_faltando ?? []))];
  return {
    ok: false,
    motor: null,
    conexao: null,
    navegador: null,
    versao: null,
    executavel: null,
    erro: tentativas.length ? tentativas[tentativas.length - 1].erro : "nenhum motor de browser disponível",
    libs_faltando: libs,
    tentativas,
    ms: agora() - t0,
  };
}

// ---------------------------------------------------------------- sessões
/**
 * Sessão: { id, tipo: 'playwright'|'puppeteer', navegador, contexto, abas:[{page}],
 *           atual, logs[], console[], rede[], criadoEm, ultimoUso }
 */
export const sessoes = new Map();

function registrar(sessao, acao, alvo, resultado, ms, extra) {
  sessao.logs.push({
    em: new Date().toISOString(),
    acao,
    alvo: alvo == null ? null : String(alvo).slice(0, 240),
    resultado: String(resultado ?? "").slice(0, 300),
    ms,
    ...(extra ? { detalhe: extra } : {}),
  });
  if (sessao.logs.length > MAX_LOGS) sessao.logs.splice(0, sessao.logs.length - MAX_LOGS);
}

function abaAtual(sessao) {
  return sessao.abas[sessao.atual]?.page ?? null;
}

function indiceDaPagina(sessao, page) {
  return sessao.abas.findIndex((a) => a.page === page);
}

const HEADERS_SENSIVEIS = /^(authorization|cookie|set-cookie|x-api-key|proxy-authorization)$/i;
function filtrarHeaders(headers) {
  const saida = {};
  for (const [k, v] of Object.entries(headers ?? {}).slice(0, 40)) {
    if (HEADERS_SENSIVEIS.test(k)) {
      saida[k] = "[removido]";
      continue;
    }
    saida[k] = String(v).slice(0, 200);
  }
  return saida;
}

/** Liga os coletores de console/rede em toda página da sessão. */
function instrumentar(sessao, page) {
  const empurrarConsole = (tipo, texto, extra = {}) => {
    sessao.console.push({
      em: new Date().toISOString(),
      tipo: String(tipo ?? "log").slice(0, 24),
      texto: sanitizarTexto(texto).slice(0, 500),
      url: extra.url ? String(extra.url).slice(0, 300) : undefined,
      linha: extra.linha,
      coluna: extra.coluna,
    });
    if (sessao.console.length > MAX_CONSOLE) sessao.console.splice(0, sessao.console.length - MAX_CONSOLE);
  };

  const empurrarRede = (item) => {
    sessao.rede.push(item);
    if (sessao.rede.length > MAX_REDE) sessao.rede.splice(0, sessao.rede.length - MAX_REDE);
  };

  try {
    page.on("console", (msg) => {
      const loc = typeof msg.location === "function" ? msg.location() : {};
      empurrarConsole(typeof msg.type === "function" ? msg.type() : "log", typeof msg.text === "function" ? msg.text() : "", {
        url: loc?.url,
        linha: loc?.lineNumber,
        coluna: loc?.columnNumber,
      });
    });
    page.on("pageerror", (err) => empurrarConsole("pageerror", err?.message ?? String(err)));
    page.on("dialog", async (d) => {
      const tipoD = typeof d.type === "function" ? d.type() : "dialog";
      const msgD = typeof d.message === "function" ? d.message() : "";
      empurrarConsole("dialog", tipoD + ": " + msgD);
      try {
        await d.dismiss();
      } catch {
        /* diálogo pode já ter sido fechado */
      }
    });

    const inicio = new Map();

    if (sessao.tipo === "playwright") {
      page.on("request", (req) => inicio.set(req, agora()));
      page.on("requestfinished", async (req) => {
        const t = inicio.get(req);
        inicio.delete(req);
        let resp = null;
        try {
          resp = await req.response();
        } catch {
          resp = null;
        }
        let cab = {};
        try {
          cab = resp ? await resp.allHeaders() : {};
        } catch {
          cab = {};
        }
        empurrarRede({
          em: new Date().toISOString(),
          metodo: req.method(),
          url: String(req.url()).slice(0, 400),
          tipo: req.resourceType(),
          status: resp ? resp.status() : null,
          ms: t ? agora() - t : null,
          headers: filtrarHeaders(cab),
          falha: null,
        });
      });
      page.on("requestfailed", (req) => {
        const t = inicio.get(req);
        inicio.delete(req);
        const falha = typeof req.failure === "function" ? req.failure() : null;
        empurrarRede({
          em: new Date().toISOString(),
          metodo: req.method(),
          url: String(req.url()).slice(0, 400),
          tipo: req.resourceType(),
          status: null,
          ms: t ? agora() - t : null,
          headers: {},
          falha: falha?.errorText ?? "falhou",
        });
      });
    } else {
      // puppeteer
      page.on("request", (req) => inicio.set(req, agora()));
      page.on("response", (resp) => {
        const req = typeof resp.request === "function" ? resp.request() : null;
        const t = req ? inicio.get(req) : null;
        if (req) inicio.delete(req);
        let cab = {};
        try {
          cab = typeof resp.headers === "function" ? resp.headers() : {};
        } catch {
          cab = {};
        }
        const cl = Number(cab["content-length"]);
        empurrarRede({
          em: new Date().toISOString(),
          metodo: req && typeof req.method === "function" ? req.method() : "GET",
          url: String(req && typeof req.url === "function" ? req.url() : "").slice(0, 400),
          tipo: req && typeof req.resourceType === "function" ? req.resourceType() : "document",
          status: typeof resp.status === "function" ? resp.status() : null,
          ms: t ? agora() - t : null,
          bytes: Number.isFinite(cl) ? cl : null,
          headers: filtrarHeaders(cab),
          falha: null,
        });
      });
      page.on("requestfailed", (req) => {
        const t = inicio.get(req);
        inicio.delete(req);
        const falha = typeof req.failure === "function" ? req.failure() : null;
        empurrarRede({
          em: new Date().toISOString(),
          metodo: req.method(),
          url: String(req.url()).slice(0, 400),
          tipo: req.resourceType(),
          status: null,
          ms: t ? agora() - t : null,
          bytes: null,
          headers: {},
          falha: falha?.errorText ?? "falhou",
        });
      });
    }
  } catch (e) {
    registrar(sessao, "instrumentar", null, "falha: " + erroDe(e), 0);
  }
}

function normalizarUrl(valor) {
  const bruto = String(valor ?? "").trim();
  if (!bruto) throw new Error("informe a url");
  const comEsquema = /^[a-z][a-z0-9+.-]*:\/\//i.test(bruto) ? bruto : "https://" + bruto;
  let u;
  try {
    u = new URL(comEsquema);
  } catch {
    throw new Error("url inválida: " + bruto.slice(0, 120));
  }
  if (!/^https?:$/.test(u.protocol) && u.protocol !== "about:") throw new Error("somente http(s)");
  return u.toString();
}

async function esperarEstabilizar(sessao, page) {
  try {
    if (sessao.tipo === "playwright") {
      await page.waitForLoadState("load", { timeout: 5000 });
    } else {
      await page.waitForNetworkIdle({ idleTime: 350, timeout: 4000 });
    }
  } catch {
    /* página que nunca "assenta" não deve derrubar a ação */
  }
}

async function navegarPagina(sessao, page, url) {
  const alvo = normalizarUrl(url);
  await page.goto(alvo, { waitUntil: "domcontentloaded", timeout: TIMEOUT_NAV });
  await esperarEstabilizar(sessao, page);
  return alvo;
}

async function tituloDe(page) {
  try {
    return String(await page.title()).slice(0, 200);
  } catch {
    return "";
  }
}

async function urlDe(page) {
  try {
    return page.url();
  } catch {
    return "";
  }
}

/** Screenshot JPEG em data URL, com bytes e dimensões reais. */
export async function capturar(page, tipo = "playwright") {
  let base64;
  if (tipo === "playwright") {
    const buf = await page.screenshot({ type: "jpeg", quality: QUALIDADE_JPEG, timeout: TIMEOUT_ACAO });
    base64 = Buffer.from(buf).toString("base64");
  } else {
    base64 = await page.screenshot({ type: "jpeg", quality: QUALIDADE_JPEG, encoding: "base64" });
  }
  const bytes = Math.floor((base64.length * 3) / 4);
  let largura = null;
  let altura = null;
  try {
    const vp = tipo === "playwright" ? page.viewportSize() : page.viewport();
    largura = vp?.width ?? null;
    altura = vp?.height ?? null;
  } catch {
    /* sem viewport informado */
  }
  return {
    data_url: "data:image/jpeg;base64," + base64,
    largura,
    altura,
    bytes,
    formato: "jpeg",
    qualidade: QUALIDADE_JPEG,
  };
}

async function listaAbas(sessao) {
  const saida = [];
  for (let i = 0; i < sessao.abas.length; i++) {
    const page = sessao.abas[i].page;
    saida.push({ indice: i, titulo: await tituloDe(page), url: await urlDe(page), atual: i === sessao.atual });
  }
  return saida;
}

async function estado(sessao, page, extra = {}) {
  const tela = await capturar(page, sessao.tipo);
  const url = await urlDe(page);
  const titulo = await tituloDe(page);
  const abas = await listaAbas(sessao);
  return { ok: true, url, titulo, abas, tela, ...extra };
}

async function novaAba(sessao, url) {
  // O evento 'page' do contexto também dispara para context.newPage(); marcamos a
  // página em construção para não instrumentar/duplicar a aba.
  let page;
  sessao._construindo = true;
  try {
    if (sessao.tipo === "playwright") {
      page = await sessao.contexto.newPage();
    } else {
      page = await sessao.navegador.newPage();
      await page.setViewport({ width: LARGURA, height: ALTURA });
    }
  } finally {
    sessao._construindo = false;
  }
  const existente = sessao.abas.find((a) => a.page === page);
  if (existente) {
    sessao.atual = sessao.abas.indexOf(existente);
  } else {
    instrumentar(sessao, page);
    sessao.abas.push({ page, criadaEm: new Date().toISOString() });
    sessao.atual = sessao.abas.length - 1;
  }
  if (url && String(url).trim() && String(url).trim() !== "about:blank") await navegarPagina(sessao, page, url);
  return page;
}

export async function encerrarSessao(id) {
  const s = sessoes.get(id);
  if (!s) return { ok: true, encerrada: false, motivo: "sessão inexistente" };
  sessoes.delete(id);
  try {
    if (s.tipo === "playwright") {
      if (s.contexto) await s.contexto.close().catch(() => null);
      if (s.navegador) await s.navegador.close().catch(() => null);
    } else if (s.navegador) {
      await s.navegador.close().catch(() => null);
    }
  } catch {
    /* browser já morto */
  }
  return { ok: true, encerrada: true, sessao: id };
}

export async function encerrarTudo(motivo = "encerramento") {
  const ids = [...sessoes.keys()];
  for (const id of ids) {
    const s = sessoes.get(id);
    if (s) registrar(s, "encerrar", motivo, "sessão fechada", 0);
    await encerrarSessao(id);
  }
  return { ok: true, encerradas: ids.length };
}

// limpeza de sessão ociosa
const faxineiro = setInterval(() => {
  const limite = agora() - OCIOSO_MS;
  for (const [id, s] of sessoes) {
    if ((s.ultimoUso ?? 0) < limite) {
      registrar(s, "limpeza_ociosa", Math.round((agora() - s.ultimoUso) / 1000) + "s ociosa", "sessão encerrada", 0);
      encerrarSessao(id).catch(() => null);
    }
  }
}, 60_000);
if (typeof faxineiro.unref === "function") faxineiro.unref();

// ---------------------------------------------------------------- inspeção
const PROPS_CSS = [
  "display", "position", "width", "height", "margin", "padding", "color",
  "background-color", "border", "border-radius", "font-family", "font-size",
  "font-weight", "line-height", "text-align", "flex-direction", "justify-content",
  "align-items", "gap", "grid-template-columns", "overflow", "opacity", "z-index",
  "visibility", "box-shadow", "transform", "max-width", "min-height",
];

async function inspecionarDom(page) {
  const dados = await page.evaluate((limiteNos) => {
    const resumo = [];
    const pular = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "PATH", "META", "LINK"]);
    const caminhada = (el, nivel) => {
      if (nivel > 6 || resumo.length >= limiteNos) return;
      for (const f of el.children) {
        if (pular.has(f.tagName)) continue;
        if (resumo.length >= limiteNos) return;
        const textoDireto = f.children.length === 0 ? (f.textContent || "").trim() : "";
        resumo.push({
          nivel,
          tag: f.tagName.toLowerCase(),
          id: f.id || undefined,
          classe: (typeof f.className === "string" ? f.className : "").slice(0, 90) || undefined,
          papel: f.getAttribute("role") || undefined,
          texto: textoDireto ? textoDireto.slice(0, 80) : undefined,
        });
        caminhada(f, nivel + 1);
      }
    };
    if (document.body) caminhada(document.body, 0);

    const coletar = (sel, limite) =>
      [...document.querySelectorAll(sel)].slice(0, limite).map((e) => ({
        tag: e.tagName.toLowerCase(),
        texto: (e.textContent || "").trim().slice(0, 110),
        href: e.getAttribute("href") || undefined,
        id: e.id || undefined,
        classe: (typeof e.className === "string" ? e.className : "").slice(0, 60) || undefined,
        nome: e.getAttribute("name") || undefined,
        tipo: e.getAttribute("type") || undefined,
        placeholder: e.getAttribute("placeholder") || undefined,
      }));

    return {
      titulo: document.title,
      url: location.href,
      idioma: document.documentElement && document.documentElement.lang ? document.documentElement.lang : null,
      nos_total: document.querySelectorAll("*").length,
      nos_estruturais: resumo.length,
      viewport: { largura: window.innerWidth, altura: window.innerHeight },
      documento: {
        largura: document.documentElement ? document.documentElement.scrollWidth : null,
        altura: document.documentElement ? document.documentElement.scrollHeight : null,
      },
      outline: resumo,
      links: coletar("a[href]", 40),
      botoes: coletar("button, input[type=submit], input[type=button], [role=button]", 30),
      campos: coletar("input:not([type=hidden]), textarea, select", 30),
      imagens: [...document.querySelectorAll("img")].slice(0, 25).map((i) => ({
        src: String(i.currentSrc || i.src || "").slice(0, 200),
        alt: i.getAttribute("alt") || null,
        largura: i.naturalWidth,
        altura: i.naturalHeight,
        carregou: Boolean(i.complete && i.naturalWidth > 0),
      })),
    };
  }, 300);

  let html = "";
  try {
    html = String(await page.content());
  } catch {
    html = "";
  }
  return {
    ...dados,
    html: html.slice(0, MAX_HTML),
    html_bytes: Buffer.byteLength(html, "utf8"),
    html_truncado: html.length > MAX_HTML,
  };
}

async function inspecionarCss(page, seletor) {
  const sel = String(seletor ?? "body").trim() || "body";
  return await page.evaluate(
    (args) => {
      const el = document.querySelector(args.sel);
      if (!el) return { encontrado: false, seletor: args.sel };
      const cs = getComputedStyle(el);
      const estilos = {};
      for (const p of args.props) estilos[p] = cs.getPropertyValue(p);
      const r = el.getBoundingClientRect();
      const pais = [];
      let p = el.parentElement;
      let nivel = 0;
      while (p && nivel < 4) {
        const c = getComputedStyle(p);
        pais.push({
          tag: p.tagName.toLowerCase(),
          id: p.id || undefined,
          classe: (typeof p.className === "string" ? p.className : "").slice(0, 60) || undefined,
          display: c.display,
          width: c.width,
          position: c.position,
        });
        p = p.parentElement;
        nivel++;
      }
      const regras = [];
      for (const folha of document.styleSheets) {
        let lista;
        try {
          lista = folha.cssRules;
        } catch {
          continue; // folha de outro domínio
        }
        for (const regra of lista || []) {
          if (regra.selectorText && el.matches(regra.selectorText)) {
            regras.push({ seletor: regra.selectorText.slice(0, 160), css: String((regra.style && regra.style.cssText) || "").slice(0, 400) });
          }
          if (regras.length >= 25) break;
        }
        if (regras.length >= 25) break;
      }
      return {
        encontrado: true,
        seletor: args.sel,
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        classe: typeof el.className === "string" ? el.className : null,
        caixa: { x: Math.round(r.x), y: Math.round(r.y), largura: Math.round(r.width), altura: Math.round(r.height) },
        estilos,
        pais,
        regras,
        texto_visivel: (el.innerText || "").trim().slice(0, 300),
      };
    },
    { sel, props: PROPS_CSS },
  );
}

function contarArvore(no) {
  if (!no) return 0;
  let n = 1;
  for (const f of no.children || []) n += contarArvore(f);
  return n;
}

function auditarA11y(arvore) {
  const problemas = [];
  const visitar = (no) => {
    if (!no) return;
    if (["button", "link", "textbox"].includes(no.role) && !String(no.name || "").trim()) {
      problemas.push({ papel: no.role, problema: "sem nome acessível" });
    }
    for (const f of no.children || []) visitar(f);
  };
  visitar(arvore);
  return problemas.slice(0, 30);
}

async function sessaoCdp(sessao, page) {
  if (sessao.tipo === "playwright") {
    const cdp = await sessao.contexto.newCDPSession(page);
    return { cdp, fechar: async () => cdp.detach() };
  }
  const alvo = page.target();
  const cdp = await alvo.createCDPSession();
  return { cdp, fechar: async () => cdp.detach() };
}

async function inspecionarA11y(sessao, page) {
  // Playwright 1.5x removeu page.accessibility -> CDP Accessibility.getFullAXTree.
  // Puppeteer ainda tem page.accessibility.snapshot().
  if (sessao.tipo === "puppeteer" && page.accessibility && typeof page.accessibility.snapshot === "function") {
    try {
      const arvore = await page.accessibility.snapshot({ interestingOnly: true });
      return { fonte: "puppeteer.page.accessibility", arvore, nos: contarArvore(arvore), problemas: auditarA11y(arvore) };
    } catch (e) {
      return { fonte: "puppeteer.page.accessibility", arvore: null, erro: erroDe(e) };
    }
  }
  try {
    const { cdp, fechar } = await sessaoCdp(sessao, page);
    try {
      await cdp.send("Accessibility.enable");
      const { nodes } = await cdp.send("Accessibility.getFullAXTree");
      const limpos = [];
      for (const n of nodes) {
        if (n.ignored) continue;
        const papel = (n.role && n.role.value) || "";
        const nome = (n.name && n.name.value) || "";
        if (!papel && !nome) continue;
        const props = n.properties || [];
        limpos.push({
          papel,
          nome: String(nome).slice(0, 120),
          valor: n.value && n.value.value !== undefined ? String(n.value.value).slice(0, 120) : undefined,
          foco: props.some((p) => p.name === "focused" && p.value && p.value.value === true) || undefined,
          desabilitado: props.some((p) => p.name === "disabled" && p.value && p.value.value === true) || undefined,
        });
        if (limpos.length >= 400) break;
      }
      const contagem = {};
      for (const n of limpos) {
        const k = n.papel || "(sem papel)";
        contagem[k] = (contagem[k] || 0) + 1;
      }
      const semNome = limpos.filter(
        (n) => ["button", "link", "textbox", "checkbox", "radio", "combobox"].includes(n.papel) && !n.nome,
      );
      return {
        fonte: "cdp.Accessibility.getFullAXTree",
        total_nos: nodes.length,
        nos_relevantes: limpos.length,
        por_papel: contagem,
        elementos_sem_nome: semNome.slice(0, 30),
        arvore: limpos,
      };
    } finally {
      await fechar().catch(() => null);
    }
  } catch (e) {
    return { fonte: "cdp.Accessibility.getFullAXTree", erro: erroDe(e) };
  }
}

async function inspecionarPerformance(sessao, page) {
  const navegacao = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const recursos = performance.getEntriesByType("resource");
    const porTipo = {};
    let bytes = 0;
    for (const r of recursos) {
      const tipo = r.initiatorType || "outro";
      porTipo[tipo] = (porTipo[tipo] || 0) + 1;
      // transferSize é 0 para cache e para recursos sem Timing-Allow-Origin;
      // encodedBodySize/decodedBodySize ainda dão o tamanho real do corpo.
      bytes += Number(r.transferSize || r.encodedBodySize || r.decodedBodySize || 0);
    }
    return {
      timing: nav
        ? {
            dns_ms: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
            conexao_ms: Math.round(nav.connectEnd - nav.connectStart),
            ttfb_ms: Math.round(nav.responseStart - nav.requestStart),
            download_ms: Math.round(nav.responseEnd - nav.responseStart),
            dom_pronto_ms: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
            carregada_ms: Math.round(nav.loadEventEnd - nav.startTime),
            duracao_ms: Math.round(nav.duration),
          }
        : null,
      recursos: {
        total: recursos.length,
        por_tipo: porTipo,
        bytes_transferidos: bytes,
        mais_pesados: recursos
          .slice()
          .sort((a, b) => (Number(b.transferSize || b.encodedBodySize || 0)) - (Number(a.transferSize || a.encodedBodySize || 0)))
          .slice(0, 8)
          .map((r) => ({
            nome: String(r.name).slice(0, 200),
            tipo: r.initiatorType || "outro",
            bytes: Number(r.transferSize || r.encodedBodySize || r.decodedBodySize || 0),
            ms: Math.round(r.duration),
          })),
      },
      pinturas: performance.getEntriesByType("paint").map((p) => ({ nome: p.name, ms: Math.round(p.startTime) })),
    };
  });

  // memória do JS só existe no Chromium e não é serializável de dentro do page.evaluate
  let memoria = null;
  try {
    memoria = await page.evaluate(() =>
      performance.memory
        ? {
            js_heap_usado: performance.memory.usedJSHeapSize,
            js_heap_total: performance.memory.totalJSHeapSize,
            js_heap_limite: performance.memory.jsHeapSizeLimit,
          }
        : null,
    );
  } catch {
    memoria = null;
  }

  let metricasCdp = null;
  let fonte = "performance.timing";
  try {
    const { cdp, fechar } = await sessaoCdp(sessao, page);
    try {
      await cdp.send("Performance.enable");
      const { metrics } = await cdp.send("Performance.getMetrics");
      metricasCdp = Object.fromEntries(metrics.map((m) => [m.name, m.value]));
      fonte = "cdp.Performance.getMetrics + performance.timing";
    } finally {
      await fechar().catch(() => null);
    }
  } catch {
    /* fica só com as métricas do JS */
  }
  return { fonte, ...navegacao, memoria, metricas_cdp: metricasCdp };
}

const BREAKPOINTS = [320, 375, 414, 768, 1024, 1280, 1440];

async function inspecionarResponsivo(sessao, page) {
  const resultados = [];
  for (const largura of BREAKPOINTS) {
    try {
      if (sessao.tipo === "playwright") await page.setViewportSize({ width: largura, height: ALTURA });
      else await page.setViewport({ width: largura, height: ALTURA });
      await new Promise((r) => setTimeout(r, 160));
      const medida = await page.evaluate(() => {
        const vw = window.innerWidth;
        const doc = document.documentElement;
        const overflow = doc.scrollWidth - vw;
        const cortados = [];
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right > vw + 1 || r.left < -1) {
            cortados.push({
              tag: el.tagName.toLowerCase(),
              id: el.id || undefined,
              classe: (typeof el.className === "string" ? el.className : "").slice(0, 50) || undefined,
              esquerda: Math.round(r.left),
              direita: Math.round(r.right),
              largura: Math.round(r.width),
            });
            if (cortados.length >= 12) break;
          }
        }
        return {
          largura_viewport: vw,
          largura_documento: doc.scrollWidth,
          overflow_px: overflow,
          tem_overflow: overflow > 1,
          elementos_cortados: cortados.length,
          exemplos_cortados: cortados,
        };
      });
      resultados.push({ breakpoint: largura, ...medida });
    } catch (e) {
      resultados.push({ breakpoint: largura, erro: erroDe(e) });
    }
  }
  try {
    if (sessao.tipo === "playwright") await page.setViewportSize({ width: LARGURA, height: ALTURA });
    else await page.setViewport({ width: LARGURA, height: ALTURA });
  } catch {
    /* segue */
  }
  const comProblema = resultados.filter((r) => r.tem_overflow);
  const ordenados = comProblema.slice().sort((a, b) => (b.overflow_px || 0) - (a.overflow_px || 0));
  return {
    breakpoints_testados: BREAKPOINTS,
    viewport_restaurado: LARGURA + "x" + ALTURA,
    resumo: { total: resultados.length, com_overflow: comProblema.length, pior: ordenados[0] || null },
    resultados,
  };
}

function contarPor(lista, campo) {
  const saida = {};
  for (const item of lista) {
    const k = String((item && item[campo]) ?? "?");
    saida[k] = (saida[k] || 0) + 1;
  }
  return saida;
}

async function inspecionar(sessao, alvo, body) {
  const page = abaAtual(sessao);
  if (!page) throw new Error("sessão sem aba ativa");
  const a = String(alvo ?? "").toLowerCase();
  switch (a) {
    case "dom":
      return { alvo: a, dados: await inspecionarDom(page) };
    case "css":
      return { alvo: a, seletor: body.seletor ?? "body", dados: await inspecionarCss(page, body.seletor) };
    case "console": {
      const limite = Math.min(Math.max(Number(body.limite ?? 120) || 120, 1), MAX_CONSOLE);
      return {
        alvo: a,
        dados: { total: sessao.console.length, por_tipo: contarPor(sessao.console, "tipo"), itens: sessao.console.slice(-limite) },
      };
    }
    case "rede":
    case "network": {
      const limite = Math.min(Math.max(Number(body.limite ?? 150) || 150, 1), MAX_REDE);
      const status = {};
      for (const r of sessao.rede) {
        const k = r.status == null ? (r.falha ? "falhou" : "sem status") : String(r.status);
        status[k] = (status[k] || 0) + 1;
      }
      return {
        alvo: "rede",
        dados: {
          total: sessao.rede.length,
          por_status: status,
          erros: sessao.rede.filter((r) => r.falha || (r.status ?? 200) >= 400).slice(-40),
          itens: sessao.rede.slice(-limite),
        },
      };
    }
    case "a11y":
    case "acessibilidade":
      return { alvo: "a11y", dados: await inspecionarA11y(sessao, page) };
    case "performance":
      return { alvo: a, dados: await inspecionarPerformance(sessao, page) };
    case "responsivo":
      return { alvo: a, dados: await inspecionarResponsivo(sessao, page) };
    default:
      throw new Error("alvo inválido: " + alvo + " (use dom|css|console|rede|a11y|performance|responsivo)");
  }
}

// ---------------------------------------------------------------- ações
async function obterSessao(body) {
  const id = String(body?.sessao ?? "").trim();
  if (!id) throw new Error("informe a sessão");
  if (id.length > 80 || !/^[\w.:-]+$/.test(id)) throw new Error("id de sessão inválido");
  const s = sessoes.get(id);
  if (!s) throw new Error("sessão não existe neste worker (" + id + ") — chame iniciar");
  s.ultimoUso = agora();
  return s;
}

async function acaoIniciar(body) {
  const id = String(body?.sessao ?? "").trim();
  if (!id) throw new Error("informe a sessão");
  if (id.length > 80 || !/^[\w.:-]+$/.test(id)) throw new Error("id de sessão inválido");

  const existente = sessoes.get(id);
  if (existente) {
    existente.ultimoUso = agora();
    const page = abaAtual(existente);
    if (page) return await estado(existente, page, { sessao: id, reutilizada: true, motor: existente.tipo });
    await encerrarSessao(id);
  }

  if (sessoes.size >= MAX_SESSOES) {
    throw new Error("limite de " + MAX_SESSOES + " sessões simultâneas neste worker");
  }

  const aberto = await abrirNavegador();
  if (!aberto.ok) {
    return {
      ok: false,
      erro: aberto.erro,
      motivo: "browser_indisponivel",
      libs_faltando: aberto.libs_faltando,
      tentativas: aberto.tentativas,
    };
  }

  const sessao = {
    id,
    tipo: aberto.motor === "puppeteer" ? "puppeteer" : "playwright",
    navegador: aberto.navegador,
    contexto: null,
    abas: [],
    atual: 0,
    logs: [],
    console: [],
    rede: [],
    criadoEm: new Date().toISOString(),
    ultimoUso: agora(),
    executavel: aberto.executavel,
    versaoNavegador: aberto.versao,
  };

  if (sessao.tipo === "playwright") {
    sessao.contexto = await sessao.navegador.newContext({
      viewport: { width: LARGURA, height: ALTURA },
      deviceScaleFactor: 1,
    });
    sessao.contexto.on("page", (p) => {
      // Página aberta pela própria página (window.open / target=_blank).
      // Durante context.newPage() o evento também dispara: novaAba trata essa página.
      if (sessao._construindo) return;
      if (indiceDaPagina(sessao, p) === -1) {
        instrumentar(sessao, p);
        sessao.abas.push({ page: p, criadaEm: new Date().toISOString(), abertaPelaPagina: true });
      }
    });
  }

  sessoes.set(id, sessao);
  registrar(sessao, "iniciar", aberto.executavel, "navegador " + aberto.versao + " em " + aberto.ms + "ms", aberto.ms);

  await novaAba(sessao, body?.url ?? null);
  const page = abaAtual(sessao);
  return await estado(sessao, page, { sessao: id, motor: sessao.tipo, versao: sessao.versaoNavegador });
}

async function acaoNavegar(body) {
  const sessao = await obterSessao(body);
  const page = abaAtual(sessao);
  if (!page) throw new Error("sessão sem aba ativa");
  const alvo = await navegarPagina(sessao, page, body.url);
  return await estado(sessao, page, { destino: alvo });
}

async function acaoClique(body) {
  const sessao = await obterSessao(body);
  const page = abaAtual(sessao);
  if (!page) throw new Error("sessão sem aba ativa");
  if (body.seletor) {
    await page.click(String(body.seletor), { timeout: TIMEOUT_ACAO });
  } else {
    const x = Number(body.x);
    const y = Number(body.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > 5000 || y > 5000) {
      throw new Error("informe x e y (ou seletor) para clicar");
    }
    await page.mouse.click(x, y);
  }
  await esperarEstabilizar(sessao, page);
  return await estado(sessao, page, { clicado: body.seletor ? "seletor:" + body.seletor : "x:" + body.x + " y:" + body.y });
}

async function acaoDigitar(body) {
  const sessao = await obterSessao(body);
  const page = abaAtual(sessao);
  if (!page) throw new Error("sessão sem aba ativa");
  const texto = String(body.texto ?? "");
  if (!texto) throw new Error("informe o texto");
  if (texto.length > 4000) throw new Error("texto longo demais (máx 4000)");
  if (body.seletor) {
    await page.click(String(body.seletor), { timeout: TIMEOUT_ACAO });
    if (body.limpar !== false) {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el && "value" in el) el.value = "";
      }, String(body.seletor));
    }
  }
  await page.keyboard.type(texto, { delay: 12 });
  if (body.enter) await page.keyboard.press("Enter");
  await esperarEstabilizar(sessao, page);
  let valor = null;
  if (body.seletor) {
    valor = await page
      .evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? String(el.value ?? "") : null;
      }, String(body.seletor))
      .catch(() => null);
  }
  return await estado(sessao, page, { digitado: texto.slice(0, 80), valor_no_campo: valor });
}

const TECLAS_PERMITIDAS = /^(Enter|Tab|Escape|Backspace|Delete|Home|End|PageUp|PageDown|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Control\+[A-Za-z]|Shift\+Tab|Space|F5)$/i;

async function acaoTecla(body) {
  const sessao = await obterSessao(body);
  const page = abaAtual(sessao);
  if (!page) throw new Error("sessão sem aba ativa");
  const tecla = String(body.tecla ?? "Enter");
  if (!TECLAS_PERMITIDAS.test(tecla)) throw new Error("tecla não permitida: " + tecla);
  await page.keyboard.press(tecla);
  await esperarEstabilizar(sessao, page);
  return await estado(sessao, page, { tecla });
}

async function acaoRolar(body) {
  const sessao = await obterSessao(body);
  const page = abaAtual(sessao);
  if (!page) throw new Error("sessão sem aba ativa");
  const dy = Number(body.dy ?? 0) || 0;
  const dx = Number(body.dx ?? 0) || 0;
  if (Math.abs(dy) > 20000 || Math.abs(dx) > 20000) throw new Error("rolagem grande demais");
  if (sessao.tipo === "playwright") await page.mouse.wheel(dx, dy);
  else await page.mouse.wheel({ deltaX: dx, deltaY: dy });
  await new Promise((r) => setTimeout(r, 180));
  const posicao = await page.evaluate(() => ({ y: Math.round(window.scrollY), x: Math.round(window.scrollX) }));
  return await estado(sessao, page, { rolagem: posicao });
}

async function acaoHistorico(body, sentido) {
  const sessao = await obterSessao(body);
  const page = abaAtual(sessao);
  if (!page) throw new Error("sessão sem aba ativa");
  const card = { timeout: TIMEOUT_NAV, waitUntil: "domcontentloaded" };
  const resposta = sentido === "voltar" ? await page.goBack(card) : await page.goForward(card);
  if (!resposta) throw new Error("não foi possível " + sentido + ": sem histórico");
  await esperarEstabilizar(sessao, page);
  return await estado(sessao, page);
}

async function acaoRecarregar(body) {
  const sessao = await obterSessao(body);
  const page = abaAtual(sessao);
  if (!page) throw new Error("sessão sem aba ativa");
  await page.reload({ timeout: TIMEOUT_NAV, waitUntil: "domcontentloaded" });
  await esperarEstabilizar(sessao, page);
  return await estado(sessao, page);
}

async function acaoTela(body) {
  const sessao = await obterSessao(body);
  const page = abaAtual(sessao);
  if (!page) throw new Error("sessão sem aba ativa");
  const t0 = agora();
  const tela = await capturar(page, sessao.tipo);
  return { ok: true, tela, url: await urlDe(page), titulo: await tituloDe(page), ms: agora() - t0 };
}

async function acaoNovaAba(body) {
  const sessao = await obterSessao(body);
  const page = await novaAba(sessao, body.url ?? null);
  return await estado(sessao, page, { aba: sessao.atual });
}

async function acaoTrocarAba(body) {
  const sessao = await obterSessao(body);
  const indice = Number(body.indice);
  if (!Number.isInteger(indice) || indice < 0 || indice >= sessao.abas.length) {
    throw new Error("índice inválido (0.." + (sessao.abas.length - 1) + ")");
  }
  sessao.atual = indice;
  const page = abaAtual(sessao);
  try {
    await page.bringToFront();
  } catch {
    /* alguns browsers não precisam */
  }
  return await estado(sessao, page, { aba: indice });
}

async function acaoFecharAba(body) {
  const sessao = await obterSessao(body);
  const indice = body.indice == null ? sessao.atual : Number(body.indice);
  if (!Number.isInteger(indice) || indice < 0 || indice >= sessao.abas.length) {
    throw new Error("índice inválido (0.." + (sessao.abas.length - 1) + ")");
  }
  if (sessao.abas.length === 1) throw new Error("não dá para fechar a última aba");
  const removida = sessao.abas.splice(indice, 1)[0];
  await removida.page.close().catch(() => null);
  sessao.atual = Math.min(sessao.atual, sessao.abas.length - 1);
  const page = abaAtual(sessao);
  return await estado(sessao, page, { fechada: indice });
}

async function acaoAbas(body) {
  const sessao = await obterSessao(body);
  return { ok: true, abas: await listaAbas(sessao), atual: sessao.atual };
}

async function acaoLogs(body) {
  const sessao = await obterSessao(body);
  const limite = Math.min(Math.max(Number(body.limite ?? 50) || 50, 1), MAX_LOGS);
  return {
    ok: true,
    sessao: sessao.id,
    total: sessao.logs.length,
    criada_em: sessao.criadoEm,
    ultimo_uso: new Date(sessao.ultimoUso).toISOString(),
    logs: sessao.logs.slice(-limite),
  };
}

async function acaoReiniciar(body) {
  const id = String(body?.sessao ?? "").trim();
  if (!id) throw new Error("informe a sessão");
  if (sessoes.has(id)) await encerrarSessao(id);
  return await acaoIniciar({ ...body, sessao: id, url: body?.url ?? null });
}

async function acaoEncerrar(body) {
  const id = String(body?.sessao ?? "").trim();
  if (!id) throw new Error("informe a sessão");
  const r = await encerrarSessao(id);
  return { ok: true, ...r };
}

export async function acaoDiagnostico() {
  const t0 = agora();
  const aberto = await abrirNavegador();
  const base = {
    versao_worker: VERSAO,
    node: process.version,
    plataforma: process.platform + "/" + process.arch,
    memoria_rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    pacotes: { playwright: versaoPacote("playwright"), "puppeteer-core": versaoPacote("puppeteer-core") },
    chromium_encontrados: candidatosChromium(),
    browser_ws_endpoint_definido: Boolean(process.env.BROWSER_WS_ENDPOINT),
    sessoes_ativas: sessoes.size,
    limite_sessoes: MAX_SESSOES,
    ms: agora() - t0,
  };

  if (!aberto.ok) {
    return {
      ok: false,
      motor: null,
      versao: null,
      executavel: null,
      erro: aberto.erro,
      motivo: "browser_indisponivel",
      libs_faltando: aberto.libs_faltando,
      tentativas: aberto.tentativas,
      ...base,
    };
  }

  // prova real: abre uma página e captura uma tela, depois fecha
  let prova = null;
  try {
    let page;
    if (aberto.motor === "playwright") {
      const ctx = await aberto.navegador.newContext({ viewport: { width: LARGURA, height: ALTURA } });
      page = await ctx.newPage();
    } else {
      page = await aberto.navegador.newPage();
      await page.setViewport({ width: LARGURA, height: ALTURA });
    }
    await page.goto("about:blank", { timeout: TIMEOUT_ACAO });
    const base64 =
      aberto.motor === "playwright"
        ? Buffer.from(await page.screenshot({ type: "jpeg", quality: QUALIDADE_JPEG })).toString("base64")
        : await page.screenshot({ type: "jpeg", quality: QUALIDADE_JPEG, encoding: "base64" });
    prova = { screenshot_bytes: Math.floor((base64.length * 3) / 4), viewport: LARGURA + "x" + ALTURA };
  } catch (e) {
    prova = { erro: erroDe(e) };
  } finally {
    try {
      await aberto.navegador.close();
    } catch {
      /* já fechado */
    }
  }

  return {
    ok: true,
    motor: aberto.motor,
    conexao: aberto.conexao,
    versao: aberto.versao,
    executavel: aberto.executavel,
    erro: null,
    libs_faltando: [],
    tentativas: aberto.tentativas,
    prova,
    ...base,
    ms: agora() - t0,
  };
}

const ACOES = {
  iniciar: acaoIniciar,
  navegar: acaoNavegar,
  clique: acaoClique,
  digitar: acaoDigitar,
  tecla: acaoTecla,
  rolar: acaoRolar,
  voltar: (b) => acaoHistorico(b, "voltar"),
  avancar: (b) => acaoHistorico(b, "avancar"),
  recarregar: acaoRecarregar,
  tela: acaoTela,
  nova_aba: acaoNovaAba,
  trocar_aba: acaoTrocarAba,
  fechar_aba: acaoFecharAba,
  abas: acaoAbas,
  inspecionar: acaoInspecionar,
  logs: acaoLogs,
  reiniciar: acaoReiniciar,
  encerrar: acaoEncerrar,
  diagnostico: () => acaoDiagnostico(),
};

export const ACOES_DISPONIVEIS = Object.keys(ACOES);

async function acaoInspecionar(body) {
  const sessao = await obterSessao(body);
  const r = await inspecionar(sessao, body?.alvo, body ?? {});
  return { ok: true, ...r };
}

function resumoAlvo(body) {
  if (!body || typeof body !== "object") return null;
  if (body.url) return "url:" + body.url;
  if (body.alvo) return "alvo:" + body.alvo + (body.seletor ? " sel:" + body.seletor : "");
  if (body.seletor) return "sel:" + body.seletor;
  if (body.x != null) return "x:" + body.x + " y:" + body.y;
  if (body.texto) return "texto:" + String(body.texto).slice(0, 40);
  if (body.tecla) return "tecla:" + body.tecla;
  if (body.indice != null) return "aba:" + body.indice;
  if (body.dy != null) return "dy:" + body.dy;
  return null;
}

/** Despacha uma ação. Nunca lança: erro vira { ok:false, erro }. */
export async function executarAcao(nome, body = {}) {
  const acao = String(nome ?? "").trim().toLowerCase();
  const fn = ACOES[acao];
  if (!fn) return { ok: false, erro: "ação desconhecida: " + (acao || "(vazia)"), acoes: ACOES_DISPONIVEIS };
  const t0 = agora();
  const sessao = body && body.sessao ? sessoes.get(String(body.sessao)) : null;
  try {
    const resposta = await fn(body ?? {});
    if (sessao) {
      registrar(sessao, acao, resumoAlvo(body), resposta && resposta.ok === false ? "falhou: " + (resposta.erro ?? "") : "ok", agora() - t0);
    }
    return { ...resposta, ms: resposta && resposta.ms != null ? resposta.ms : agora() - t0 };
  } catch (e) {
    const erro = erroDe(e);
    if (sessao) registrar(sessao, acao, resumoAlvo(body), "falhou: " + erro, agora() - t0);
    return { ok: false, erro, acao, ms: agora() - t0 };
  }
}

// ---------------------------------------------------------------- HTTP
const CABECALHOS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "cache-control": "no-store",
};

function responder(res, codigo, corpo) {
  res.writeHead(codigo, CABECALHOS);
  res.end(JSON.stringify(corpo));
}

async function lerCorpo(req) {
  let bruto = "";
  for await (const c of req) {
    bruto += c;
    if (bruto.length > 1_000_000) throw new Error("corpo grande demais");
  }
  try {
    return JSON.parse(bruto || "{}");
  } catch {
    return {};
  }
}

/**
 * Roteador do computador, montado dentro do agent.mjs existente.
 * @param {{ autorizado: (req: import("node:http").IncomingMessage) => boolean,
 *           prefixo?: string, instalarSinais?: boolean }} opcoes
 */
export function criarComputador(opcoes = {}) {
  const prefixo = opcoes.prefixo ?? "/compute";
  const autorizado = typeof opcoes.autorizado === "function" ? opcoes.autorizado : () => false;

  if (opcoes.instalarSinais && !criarComputador._sinais) {
    criarComputador._sinais = true;
    const fechar = (sinal) => {
      encerrarTudo(sinal)
        .catch(() => null)
        .finally(() => process.exit(0));
    };
    process.on("SIGTERM", () => fechar("SIGTERM"));
    process.on("SIGINT", () => fechar("SIGINT"));
  }

  /** @returns {Promise<boolean>} true se a rota era do computador */
  async function atender(req, res, url) {
    const caminho = url.pathname;
    if (caminho !== prefixo && !caminho.startsWith(prefixo + "/")) return false;

    if (req.method === "OPTIONS") {
      res.writeHead(204, CABECALHOS);
      res.end();
      return true;
    }

    if (!autorizado(req)) {
      responder(res, 401, { ok: false, erro: "nao autorizado" });
      return true;
    }

    const acao = caminho === prefixo ? "" : caminho.slice(prefixo.length + 1);

    if (!acao) {
      responder(res, 200, {
        ok: true,
        servico: "skynet-computer",
        versao: VERSAO,
        acoes: ACOES_DISPONIVEIS,
        sessoes_ativas: sessoes.size,
        limite_sessoes: MAX_SESSOES,
        ocioso_min: OCIOSO_MS / 60000,
        viewport: LARGURA + "x" + ALTURA,
      });
      return true;
    }

    if (req.method === "GET") {
      if (acao === "diagnostico") {
        responder(res, 200, await acaoDiagnostico());
        return true;
      }
      if (acao === "sessoes") {
        responder(res, 200, {
          ok: true,
          total: sessoes.size,
          limite: MAX_SESSOES,
          sessoes: [...sessoes.values()].map((s) => ({
            sessao: s.id,
            motor: s.tipo,
            versao_navegador: s.versaoNavegador,
            abas: s.abas.length,
            criado_em: s.criadoEm,
            ultimo_uso: new Date(s.ultimoUso).toISOString(),
          })),
        });
        return true;
      }
      responder(res, 405, { ok: false, erro: "use POST /compute/<acao>" });
      return true;
    }

    if (req.method !== "POST") {
      responder(res, 405, { ok: false, erro: "método não suportado" });
      return true;
    }

    let corpo = {};
    try {
      corpo = await lerCorpo(req);
    } catch (e) {
      responder(res, 400, { ok: false, erro: erroDe(e) });
      return true;
    }
    responder(res, 200, await executarAcao(acao, corpo));
    return true;
  }

  return { atender, executarAcao, sessoes, encerrarTudo, encerrarSessao, acaoDiagnostico, ACOES };
}

/** Servidor HTTP standalone (testes locais e quem quiser só o módulo). */
export function criarServidorCompute({ token = process.env.AGENT_TOKEN, prefixo = "/compute" } = {}) {
  const computador = criarComputador({
    prefixo,
    instalarSinais: false,
    autorizado: (req) => {
      const recebido = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
      if (!token || !recebido) return false;
      const a = Buffer.from(recebido);
      const b = Buffer.from(token);
      return a.length === b.length && timingSafeEqual(a, b);
    },
  });
  const servidor = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    computador.atender(req, res, url).catch((e) => responder(res, 500, { ok: false, erro: erroDe(e) }));
  });
  servidor.on("close", () => {
    computador.encerrarTudo("servidor fechado").catch(() => null);
  });
  servidor.computador = computador;
  return servidor;
}

export const _interno = { sessoes, LARGURA, ALTURA, MAX_SESSOES, OCIOSO_MS, TIMEOUT_ACAO, TIMEOUT_NAV, BREAKPOINTS };
