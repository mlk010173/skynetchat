// SKYNET · camada de agente: planeja a pesquisa, dispara em paralelo, lê a fonte
// primária de cada resultado e devolve um dossiê citável.
// Padrões adaptados de agentes open source:
//  - gpt-researcher: planner -> sub-perguntas -> execução paralela -> publisher com citações
//  - parallel-research-agent: threads independentes com orçamento e retry por ramo
//  - efficient-deep-research: reranking + filtro de citação válida
//  - deer-flow: orçamento de contexto, compactação e estado de progresso

import { noticias, resumo, social, videos, web } from "./pesquisa.js";

const normalizar = (t) =>
  String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const host = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** URL canônica: sem parâmetros de rastreio, sem barra final, sem amp. */
export function canonica(u) {
  try {
    const url = new URL(u);
    const limpar = [...url.searchParams.keys()].filter((k) =>
      /^(utm_|fbclid|gclid|ref|ref_src|source|si|igshid|mc_|_hs|spm)/i.test(k)
    );
    limpar.forEach((k) => url.searchParams.delete(k));
    url.hash = "";
    let out = url.origin + url.pathname.replace(/\/+$/, "");
    const q = url.searchParams.toString();
    if (q) out += "?" + q;
    return out;
  } catch {
    return String(u || "");
  }
}

/** Domínios que costumam entregar dado de primeira mão (documentação, órgão, jornal). */
const AUTORIDADE = [
  [/(\.gov(\.[a-z]{2})?|\.gov\.br|\.edu|\.edu\.br|\.org\.br)$/i, 30],
  [/(wikipedia\.org|arxiv\.org|doi\.org|nature\.com|sciencedirect|pubmed|who\.int|un\.org|ibge\.gov\.br|ipea\.gov\.br)/i, 26],
  [/(reuters|apnews|bbc\.|folha\.uol|estadao|oglobo|g1\.globo|poder360|nexojornal|intercept|agenciapublica)/i, 22],
  [/(github\.com|gitlab\.com|developer\.mozilla|docs\.|readthedocs|stackoverflow)/i, 18],
  [/(medium\.com|substack\.com|dev\.to|linkedin\.com|quora)/i, 6],
  [/(pinterest|facebook|tiktok|kwai|blogspot)/i, -8],
];

function autoridade(url) {
  const h = host(url);
  for (const [re, peso] of AUTORIDADE) if (re.test(h)) return peso;
  return 10;
}

/** Bônus por recência quando a URL ou o título deixam data aparente. */
function recencia(titulo) {
  const t = normalizar(titulo);
  const ano = new Date().getFullYear();
  if (t.includes(String(ano))) return 14;
  if (t.includes(String(ano - 1))) return 8;
  if (/(ontem|hoje|agora|ultima hora|breaking)/.test(t)) return 12;
  return 0;
}

/** Quantas palavras da consulta aparecem no título/trecho. */
function aderencia(consulta, texto) {
  const termos = normalizar(consulta).split(/\s+/).filter((w) => w.length > 3);
  if (!termos.length) return 0;
  const alvo = normalizar(texto);
  return termos.reduce((n, w) => (alvo.includes(w) ? n + 1 : n), 0) * 6;
}

export function pontuar(consulta, item) {
  return (
    autoridade(item.url) +
    recencia(item.titulo) +
    aderencia(consulta, `${item.titulo} ${item.resumo || item.snippet || ""}`) +
    (item.primeiraMao ? 18 : 0)
  );
}

/* ----------------------------- planejador ----------------------------- */

const INTENCOES = [
  { chave: "definicao", re: /o que (e|é)|quem (e|é)|defina|explica|como funciona|significa/i, pergunta: (q) => `o que é ${q}` },
  { chave: "noticia", re: /not[ií]cia|hoje|agora|ultima|recente|aconteceu/i, pergunta: (q) => `${q} notícias hoje` },
  { chave: "dados", re: /quanto|n[uú]mero|estat[ií]stica|dado|crescimento|taxa|pre[cç]o/i, pergunta: (q) => `${q} dados estatísticas números` },
  { chave: "comparacao", re: /melhor|compar|versus|\bvs\b|diferen[cç]a|alternativa/i, pergunta: (q) => `${q} comparação prós e contras` },
  { chave: "critica", re: /risco|problema|cr[ií]tica|falha|contra|desvantagem|pol[eê]mica/i, pergunta: (q) => `${q} críticas riscos problemas` },
  { chave: "pratica", re: /como fazer|tutorial|passo|instalar|configurar|exemplo|guia/i, pergunta: (q) => `${q} tutorial passo a passo` },
  { chave: "video", re: /v[ií]deo|youtube|assistir|aula|palestra/i, pergunta: (q) => `${q} vídeo` },
  { chave: "social", re: /instagram|perfil|reels|post|rede social/i, pergunta: (q) => `${q} instagram` },
];

/**
 * Decomposição heurística (sem LLM): transforma o pedido em 3-5 consultas
 * independentes, cada uma cobrindo um ângulo diferente do tema.
 */
export function planejar(pedido) {
  const bruto = String(pedido || "").replace(/\s+/g, " ").trim();
  const nucleo = bruto
    .replace(/^(por favor,?\s*|me\s+)?(pesquis[ea]r?|busque|procure|investigue|descubra|me\s+diga|quero saber|explique|fale)\s*/i, "")
    .replace(/^(sobre|a respeito de|acerca de)\s+/i, "")
    .replace(/[?¿!]+$/g, "")
    .trim() || bruto;

  const ramos = [];
  const visto = new Set();
  const add = (chave, pergunta, peso) => {
    const k = normalizar(pergunta);
    if (!pergunta || visto.has(k) || ramos.length >= 5) return;
    visto.add(k);
    ramos.push({ chave, pergunta, peso });
  };

  add("nucleo", nucleo, 100);
  for (const i of INTENCOES) if (i.re.test(bruto)) add(i.chave, i.pergunta(nucleo), 80);
  // ângulos universais de um bom dossiê
  add("contexto", `${nucleo} contexto histórico`, 55);
  add("primario", `${nucleo} documento oficial dados`, 60);
  add("contra", `${nucleo} críticas`, 45);

  return { nucleo, ramos: ramos.slice(0, 5) };
}

/* --------------------------- leitura primária -------------------------- */

/** Lê o corpo da página (via leitor com CORS) e devolve o trecho mais útil. */
export async function lerPrimeiraMao(url, consulta, limite = 320) {
  const alvo = /^https?:\/\//i.test(url) ? url : "";
  if (!alvo) return null;
  const chave = "ler:" + canonica(alvo);
  const cache = new Map();
  const guardado = cache.get(chave);
  if (guardado) return guardado;
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 7500);
    const res = await fetch("https://r.jina.ai/" + alvo, { signal: ctl.signal, credentials: "omit" });
    clearTimeout(to);
    if (!res.ok) return null;
    const texto = (await res.text())
      .replace(/^Title:.*$/gm, "")
      .replace(/^URL Source:.*$/gm, "")
      .replace(/^Markdown Content:.*$/gm, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[#>*_`|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (texto.length < 120) return null;

    // escolhe a janela com mais palavras da consulta
    const termos = normalizar(consulta).split(/\s+/).filter((w) => w.length > 3);
    const frases = texto.split(/(?<=[.!?])\s+/).filter((f) => f.length > 40);
    let melhor = { score: -1, trecho: "" };
    for (let i = 0; i < frases.length; i++) {
      const janela = frases.slice(i, i + 3).join(" ");
      const alvoN = normalizar(janela);
      const score = termos.reduce((n, w) => (alvoN.includes(w) ? n + 1 : n), 0);
      if (score > melhor.score) melhor = { score, trecho: janela };
      if (melhor.score >= termos.length) break;
    }
    const trecho = (melhor.trecho || texto.slice(0, limite)).slice(0, limite).trim();
    const out = { trecho, tamanho: texto.length };
    cache.set(chave, out);
    return out;
  } catch {
    return null;
  }
}

/* --------------------------- pesquisa profunda ------------------------- */

const comLimite = async (tarefas, limite = 4) => {
  const resultados = [];
  let i = 0;
  const operarios = Array.from({ length: Math.min(limite, tarefas.length) }, async () => {
    while (i < tarefas.length) {
      const idx = i++;
      try {
        resultados[idx] = await tarefas[idx]();
      } catch {
        resultados[idx] = null;
      }
    }
  });
  await Promise.all(operarios);
  return resultados;
};

/**
 * Executa o dossiê: planeja, busca em paralelo, junta, deduplica, pontua,
 * lê a fonte primária das melhores e devolve tudo citável.
 * `aoPasso` recebe atualizações de progresso em tempo real.
 */
export async function pesquisarProfundo(pedido, { aoPasso = () => {}, querVideos = false, querSocial = false } = {}) {
  const plano = planejar(pedido);
  aoPasso({ etapa: "plano", titulo: "Planejando a pesquisa", detalhe: plano.ramos.map((r) => r.pergunta).join(" · ").slice(0, 180) });

  const tarefas = plano.ramos.map((ramo) => async () => {
    const lista = await web(ramo.pergunta).catch(() => []);
    return lista.slice(0, 6).map((f) => ({
      titulo: f.title || f.titulo || "",
      resumo: f.snippet || f.resumo || "",
      url: f.url,
      domain: f.domain || host(f.url),
      ramo: ramo.chave,
      peso: ramo.peso,
    }));
  });

  const extras = [];
  if (querVideos) extras.push(async () => ({ tipo: "videos", itens: await videos(plano.nucleo).catch(() => []) }));
  if (querSocial) extras.push(async () => ({ tipo: "social", itens: await social(plano.nucleo).catch(() => []) }));

  const brutos = await comLimite(tarefas, 2);
  aoPasso({ etapa: "coleta", titulo: "Coletando resultados", detalhe: `${brutos.flat().filter(Boolean).length} páginas em ${plano.ramos.length} frentes` });

  const [extrasOk, resumoWiki] = await Promise.all([
    extras.length ? comLimite(extras, 2) : Promise.resolve([]),
    resumo(plano.nucleo).catch(() => null),
  ]);

  // dedupe + pontuação
  const mapa = new Map();
  for (const item of brutos.flat().filter(Boolean)) {
    const chave = canonica(item.url);
    if (!chave) continue;
    const atual = mapa.get(chave);
    const pontos = pontuar(plano.nucleo, item) + (item.peso || 0) / 10;
    if (!atual || pontos > atual.pontos) {
      mapa.set(chave, { ...item, url: chave, pontos, ramos: [...new Set([...(atual?.ramos || []), item.ramo])] });
    } else {
      atual.ramos = [...new Set([...atual.ramos, item.ramo])];
    }
  }

  if (mapa.size < 4) {
    const base = await web(plano.nucleo).catch(() => []);
    for (const item of base) {
      const chave = canonica(item.url);
      if (!chave || mapa.has(chave)) continue;
      const normal = {
        titulo: item.title || item.titulo || "",
        resumo: item.snippet || item.resumo || "",
        url: chave,
        domain: item.domain || host(chave),
        ramos: ["base"],
      };
      mapa.set(chave, { ...normal, pontos: pontuar(plano.nucleo, normal) });
    }
  }

  let fontes = [...mapa.values()].sort((a, b) => b.pontos - a.pontos).slice(0, 12);
  // citação válida: só fica o que tem URL http e título
  fontes = fontes.filter((f) => /^https?:\/\//i.test(f.url) && (f.titulo || "").length > 3);

  aoPasso({ etapa: "rank", titulo: "Filtrando e ordenando", detalhe: `${fontes.length} fontes mantidas de ${mapa.size} obtidas` });

  // leitura de primeira mão nas 3 melhores
  const topo = fontes.slice(0, 2);
  await comLimite(
    topo.map((f) => async () => {
      const leitura = await lerPrimeiraMao(f.url, plano.nucleo);
      if (leitura) {
        f.excerto = leitura.trecho;
        f.primeiraMao = true;
      }
    }),
    2
  );
  fontes = fontes
    .map((f) => ({ ...f, pontos: pontuar(plano.nucleo, f) + (f.primeiraMao ? 18 : 0) }))
    .sort((a, b) => b.pontos - a.pontos);

  const comExcerto = fontes.filter((f) => f.excerto).length;
  aoPasso({
    etapa: "leitura",
    titulo: "Lendo as fontes primárias",
    detalhe: comExcerto ? `${comExcerto} páginas lidas na íntegra` : "sem acesso direto ao corpo das páginas",
  });

  const videosOk = (extrasOk.find((e) => e?.tipo === "videos") || {}).itens || [];
  const socialOk = (extrasOk.find((e) => e?.tipo === "social") || {}).itens || [];

  aoPasso({ etapa: "fim", titulo: "Dossiê pronto", detalhe: `${fontes.length} fontes · ${videosOk.length} vídeos · ${socialOk.length} perfis` });

  return { plano, resumo: resumoWiki, fontes, videos: videosOk, social: socialOk, quando: Date.now() };
}

/** Citações [1] [2] … a partir da lista de fontes. */
export function citar(indice) {
  return `[${indice}]`;
}

/** Texto corrido do dossiê, com citações numeradas e trechos de primeira mão. */
export function relatorio(dossie) {
  if (!dossie) return "";
  const linhas = [];
  if (dossie.resumo) linhas.push(`**${dossie.resumo.titulo}** — ${dossie.resumo.texto}`);
  const comExcerto = dossie.fontes.filter((f) => f.excerto).slice(0, 2);
  if (comExcerto.length) {
    linhas.push(
      "**O que as fontes dizem**\n" +
        comExcerto.map((f, i) => `> ${f.excerto}${f.excerto.endsWith(".") ? "" : "…"} — [${i + 1}] ${host(f.url)}`).join("\n>\n")
    );
  }
  linhas.push(
    `**Dossiê** — ${dossie.fontes.length} fontes reunidas agora, ${dossie.fontes.filter((f) => f.primeiraMao).length} lidas na íntegra.` +
      (dossie.videos.length ? ` ${dossie.videos.length} vídeos no YouTube.` : "") +
      (dossie.social.length ? ` ${dossie.social.length} perfis no Instagram.` : "")
  );
  return linhas.join("\n\n");
}
