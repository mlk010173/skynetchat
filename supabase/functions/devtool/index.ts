// Ferramentas de engenharia do SKYNET (devtool).
// GET  /devtool            -> catálogo de ações
// POST /devtool?acao=...   -> executa
// Ações: json, base64, hash, uuid, regex, diff, jwt, epoch, url, stats, case, cron, cores, bytes
// Auth: sessão por código (x-session), JWT do Supabase Auth ou chamada interna
// (service role + x-conta-id) do próprio chat.
import { contaDaSessao, svc } from "../_shared/sessao.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-api-key, x-session, content-type, x-client-info, x-conta-id",
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "content-type": "application/json" } });

const ACOES: Record<string, string> = {
  json: "valida, formata (indent 2) ou minifica JSON",
  base64: "codifica/decodifica base64 (texto ou url-safe)",
  hash: "sha-256/sha-1/sha-512 e hmac de um texto",
  uuid: "gera N uuids v4",
  regex: "testa uma expressão regular e lista os matches/grupos",
  diff: "compara dois textos linha a linha",
  jwt: "lê o header e o payload de um JWT (sem validar assinatura)",
  epoch: "converte timestamp <-> ISO, com fuso de São Paulo",
  url: "codifica/decodifica URL e faz parse dos parâmetros",
  stats: "conta caracteres, palavras, linhas e bytes",
  case: "converte entre camelCase, snake_case, kebab-case, PascalCase, CONSTANT",
  cron: "explica um cron de 5 campos em português",
  cores: "converte hex <-> rgb <-> hsl",
  bytes: "converte tamanhos (1.5 GB em MB) e durações",
};

async function autorizado(req: Request): Promise<boolean> {
  const conta = await contaDaSessao(req).catch(() => null);
  if (conta?.id) return true;
  const auth = (req.headers.get("Authorization") ?? "").trim();
  if (!auth.startsWith("Bearer ") || auth.length < 30) return false;
  const db = svc();
  const { data } = await db.auth.getUser(auth.slice(7));
  if (data?.user?.id) return true;
  const interno = (req.headers.get("x-conta-id") ?? "").trim();
  if (!interno) return false;
  const { error } = await db.auth.admin.listUsers({ page: 1, perPage: 1 });
  return !error;
}

async function sha(algo: "SHA-1" | "SHA-256" | "SHA-512", texto: string): Promise<string> {
  const buf = await crypto.subtle.digest(algo, new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function paraCamel(s: string) {
  const partes = s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[\s_\-.]+/).filter(Boolean).map((p) => p.toLowerCase());
  return partes.map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1))).join("");
}
const paraPascal = (s: string) => { const c = paraCamel(s); return c ? c[0].toUpperCase() + c.slice(1) : c; };
const paraSnake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[\s_\-.]+/).filter(Boolean).map((p) => p.toLowerCase()).join("_");
const paraKebab = (s: string) => paraSnake(s).replace(/_/g, "-");

function diffLinhas(a: string, b: string) {
  const A = a.split("\n"), B = b.split("\n");
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const saida: string[] = [];
  let i = 0, j = 0, iguais = 0, mais = 0, menos = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { saida.push(`  ${A[i]}`); iguais++; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { saida.push(`- ${A[i]}`); menos++; i++; }
    else { saida.push(`+ ${B[j]}`); mais++; j++; }
  }
  while (i < n) { saida.push(`- ${A[i++]}`); menos++; }
  while (j < m) { saida.push(`+ ${B[j++]}`); mais++; }
  return { linhas: saida.join("\n"), resumo: { iguais, adicionadas: mais, removidas: menos } };
}

const CRON_CAMPOS = ["minuto", "hora", "dia do mês", "mês", "dia da semana"];
function explicarCron(expr: string) {
  const p = expr.trim().split(/\s+/);
  if (p.length !== 5) return { ok: false, erro: "use 5 campos: minuto hora dia mês dia-da-semana" };
  const nomes = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const partes = p.map((v, i) => {
    if (v === "*") return `todo ${CRON_CAMPOS[i]}`;
    if (/^\*\/\d+$/.test(v)) return `a cada ${v.split("/")[1]} ${CRON_CAMPOS[i]}${i === 0 ? "s" : ""}`;
    if (/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(v)) {
      if (i === 4) return `no ${v.split(",").map((d) => nomes[Number(d)] ?? d).join(", ")}`;
      return `${CRON_CAMPOS[i]} ${v}`;
    }
    return `${CRON_CAMPOS[i]} ${v}`;
  });
  return { ok: true, explicacao: partes.join(" · "), expressao: expr.trim() };
}

function converterBytes(entrada: string) {
  const m = entrada.replace(",", ".").match(/([\d.]+)\s*([a-zA-Zç]{1,3})/g);
  if (!m) return null;
  const unidades: Record<string, number> = { b: 1, byte: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 };
  const norm = (u: string) => (u.toLowerCase().replace("ç", "c").replace("bytes", "b").replace("byte", "b"));
  let total = 0, achou = false;
  for (const pedaco of m) {
    const [, valor, uni] = pedaco.match(/([\d.]+)\s*([a-zA-Zç]+)/) ?? [];
    if (!valor || !uni) continue;
    const fator = unidades[norm(uni)] ?? unidades[norm(uni).slice(0, 2)];
    if (!fator) continue;
    total += Number(valor) * fator; achou = true;
  }
  if (!achou) return null;
  const formatar = (n: number, u: string) => (n / (unidades[u] ?? 1)).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return {
    bytes: Math.round(total),
    kb: formatar(total, "kb"), mb: formatar(total, "mb"), gb: formatar(total, "gb"), tb: formatar(total, "tb"),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  if (req.method === "GET" && !url.searchParams.get("acao")) {
    return json({ ok: true, acoes: ACOES });
  }
  if (!(await autorizado(req))) return json({ ok: false, error: "Entre na sua conta para usar as ferramentas." }, 401);
  if (req.method !== "POST" && req.method !== "GET") return json({ ok: false, error: "Método não suportado." }, 405);

  const corpo = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const acao = (url.searchParams.get("acao") ?? String((corpo as Record<string, unknown>)?.acao ?? "")).toLowerCase();
  const texto = String((corpo as Record<string, unknown>)?.texto ?? url.searchParams.get("texto") ?? "");
  const extra = String((corpo as Record<string, unknown>)?.extra ?? url.searchParams.get("extra") ?? "");

  try {
    switch (acao) {
      case "json": {
        const d = JSON.parse(texto);
        const modo = extra || "formatar";
        const saida = modo === "minificar" ? JSON.stringify(d) : JSON.stringify(d, null, 2);
        return json({ ok: true, acao, valido: true, saida, tipo: Array.isArray(d) ? `array(${d.length})` : typeof d, chaves: !Array.isArray(d) && d && typeof d === "object" ? Object.keys(d) : undefined });
      }
      case "base64": {
        const modo = extra || "codificar";
        if (modo === "decodificar") {
          const limpo = texto.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
          const bin = atob(limpo + "=".repeat((4 - (limpo.length % 4)) % 4));
          const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
          return json({ ok: true, acao, saida: new TextDecoder().decode(bytes) });
        }
        const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(texto)));
        return json({ ok: true, acao, saida: modo === "urlsafe" ? b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : b64 });
      }
      case "hash": {
        const algo = (extra || "sha256").toUpperCase().replace("-", "");
        const nome = (algo === "SHA1" ? "SHA-1" : algo === "SHA512" ? "SHA-512" : "SHA-256") as "SHA-1" | "SHA-256" | "SHA-512";
        return json({ ok: true, acao, algoritmo: nome, saida: await sha(nome, texto), bytes: new TextEncoder().encode(texto).length });
      }
      case "uuid": {
        const n = Math.max(1, Math.min(20, Number(extra) || 1));
        return json({ ok: true, acao, uuids: Array.from({ length: n }, () => crypto.randomUUID()) });
      }
      case "regex": {
        const re = new RegExp(texto, extra.includes("g") ? extra : extra + "g");
        const alvo = String((corpo as Record<string, unknown>)?.alvo ?? "");
        const achados = [...alvo.matchAll(re)].slice(0, 50).map((m) => ({ match: m[0], index: m.index, grupos: m.slice(1) }));
        return json({ ok: true, acao, total: achados.length, achados });
      }
      case "diff": {
        const b = String((corpo as Record<string, unknown>)?.alvo ?? "");
        return json({ ok: true, acao, ...diffLinhas(texto, b) });
      }
      case "jwt": {
        const partes = texto.trim().split(".");
        if (partes.length < 2) return json({ ok: false, error: "isso não parece um JWT" });
        const dec = (p: string) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(p.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));
        const header = dec(partes[0]);
        const payload = dec(partes[1]);
        const agora = Math.floor(Date.now() / 1000);
        return json({
          ok: true, acao, header, payload,
          assinatura: partes[2] ? `${partes[2].slice(0, 12)}…` : null,
          expira_em: payload?.exp ? new Date(payload.exp * 1000).toISOString() : null,
          expirado: payload?.exp ? payload.exp < agora : null,
        });
      }
      case "epoch": {
        const modo = extra || "para_iso";
        if (modo === "agora") return json({ ok: true, acao, epoch: Math.floor(Date.now() / 1000), iso: new Date().toISOString(), sao_paulo: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) });
        if (modo === "para_epoch") {
          const d = new Date(texto);
          if (Number.isNaN(d.getTime())) return json({ ok: false, error: "data inválida" });
          return json({ ok: true, acao, epoch: Math.floor(d.getTime() / 1000), ms: d.getTime(), iso: d.toISOString(), sao_paulo: d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) });
        }
        const n = Number(texto);
        if (!Number.isFinite(n)) return json({ ok: false, error: "manda um número (epoch em segundos ou ms)" });
        const ms = String(Math.round(n)).length >= 13 ? n : n * 1000;
        const d = new Date(ms);
        return json({ ok: true, acao, epoch: Math.floor(ms / 1000), iso: d.toISOString(), sao_paulo: d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), utc: d.toUTCString() });
      }
      case "url": {
        const modo = extra || "decodificar";
        if (modo === "codificar") return json({ ok: true, acao, saida: encodeURIComponent(texto), componente: encodeURIComponent(texto), uri: encodeURI(texto) });
        if (modo === "parse") {
          const u = new URL(texto);
          return json({ ok: true, acao, protocolo: u.protocol, host: u.host, caminho: u.pathname, parametros: Object.fromEntries(u.searchParams) });
        }
        return json({ ok: true, acao, saida: decodeURIComponent(texto.replace(/\+/g, " ")) });
      }
      case "stats": {
        const linhas = texto ? texto.split("\n") : [];
        return json({
          ok: true, acao,
          caracteres: texto.length,
          sem_espacos: texto.replace(/\s/g, "").length,
          palavras: (texto.match(/[\p{L}\p{N}'-]+/gu) ?? []).length,
          linhas: linhas.length,
          bytes: new TextEncoder().encode(texto).length,
          tempo_leitura_min: Math.max(1, Math.round((texto.match(/[\p{L}\p{N}'-]+/gu) ?? []).length / 200)),
        });
      }
      case "case": {
        return json({ ok: true, acao, camelCase: paraCamel(texto), PascalCase: paraPascal(texto), snake_case: paraSnake(texto), "kebab-case": paraKebab(texto), CONSTANT_CASE: paraSnake(texto).toUpperCase() });
      }
      case "cron": return json({ ok: true, acao, ...explicarCron(texto) });
      case "cores": {
        const h = texto.trim().replace("#", "");
        if (/^[0-9a-f]{6}$/i.test(h)) {
          const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
          const [hh, ss, ll] = (() => {
            const rn = r / 255, gn = g / 255, bn = b / 255;
            const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), l = (max + min) / 2;
            const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
            let hue = 0;
            if (max !== min) {
              if (max === rn) hue = ((gn - bn) / (max - min)) % 6;
              else if (max === gn) hue = (bn - rn) / (max - min) + 2;
              else hue = (rn - gn) / (max - min) + 4;
            }
            return [Math.round(hue * 60 + 360) % 360, Math.round(s * 100), Math.round(l * 100)];
          })();
          return json({ ok: true, acao, hex: `#${h.toLowerCase()}`, rgb: `rgb(${r}, ${g}, ${b})`, hsl: `hsl(${hh}, ${ss}%, ${ll}%)`, luminancia: Number((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255).toFixed(3) });
        }
        const mm = texto.match(/(\d{1,3})\D+(\d{1,3})\D+(\d{1,3})/);
        if (!mm) return json({ ok: false, error: "manda um hex (#rrggbb) ou rgb(r, g, b)" });
        const hx = [mm[1], mm[2], mm[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("");
        return json({ ok: true, acao, hex: `#${hx}`, rgb: `rgb(${mm[1]}, ${mm[2]}, ${mm[3]})` });
      }
      case "bytes": {
        const r = converterBytes(texto);
        return r ? json({ ok: true, acao, ...r }) : json({ ok: false, error: "não achei uma medida (ex: 1.5 GB, 800 MB, 512 kb)" });
      }
      default:
        return json({ ok: false, error: `ação desconhecida: ${acao || "(vazia)"}`, acoes: ACOES }, 400);
    }
  } catch (e) {
    return json({ ok: false, acao, error: e instanceof Error ? e.message : "falhou ao executar" }, 400);
  }
});
