// SKYNET · habilidades de lógica do agente.
// Funções puras ou quase puras usadas pelo dossiê e pelo painel; nada aqui
// depende de backend, todas rodam no navegador.

const normalizar = (t) =>
  String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const palavras = (t) =>
  normalizar(t)
    .split(" ")
    .filter((w) => w.length > 3 && !["para", "como", "mais", "esse", "essa", "pelo", "pela", "sobre", "entre", "quando", "onde", "porque", "tambem", "ainda", "depois"].includes(w));

/* ------------------------------------------------------- verificar links */
/**
 * Abre cada URL em modo opaco para saber se ela ainda existe.
 * `no-cors` resolve mesmo sem cabeçalho de CORS; o que importa é se a
 * conexão completa ou falha (DNS, 404 de rede, bloqueio).
 */
export async function verificarLinks(itens = [], aoAndar = () => {}) {
  const alvos = itens
    .map((f, i) => ({ i, url: f.url }))
    .filter((x) => /^https?:\/\//i.test(String(x.url || "")));

  const resultado = {};
  let feitos = 0;

  await Promise.all(
    alvos.map(async ({ i, url }) => {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 8000);
      const t0 = performance.now();
      try {
        await fetch(url, { method: "HEAD", mode: "no-cors", signal: ctl.signal, credentials: "omit" });
        resultado[i] = { ok: true, ms: Math.round(performance.now() - t0) };
      } catch {
        // alguns servidores recusam HEAD: tenta GET opaco antes de condenar
        try {
          await fetch(url, { method: "GET", mode: "no-cors", signal: ctl.signal, credentials: "omit" });
          resultado[i] = { ok: true, ms: Math.round(performance.now() - t0) };
        } catch {
          resultado[i] = { ok: false, ms: Math.round(performance.now() - t0) };
        }
      } finally {
        clearTimeout(to);
        feitos += 1;
        aoAndar({ feitos, total: alvos.length });
      }
    })
  );

  const vivos = Object.values(resultado).filter((r) => r.ok).length;
  return { porIndice: resultado, vivos, mortos: alvos.length - vivos, total: alvos.length };
}

/* --------------------------------------------------- resumo executivo */
/** TL;DR de 3 a 5 linhas montado a partir dos excertos e resumos coletados. */
export function resumoTldr(itens = [], tema = "") {
  const frases = [];
  for (const f of itens) {
    const base = String(f.excerto || f.resumo || "").replace(/\s+/g, " ").trim();
    if (base.length < 40) continue;
    const partes = base.split(/(?<=[.!?])\s+/).filter((p) => p.length > 40);
    if (partes.length) frases.push({ texto: partes[0], fonte: f.url, prioridade: f.primeiraMao ? 2 : 1 });
  }
  const vistos = new Set();
  const escolhidas = [];
  for (const f of frases.sort((a, b) => b.prioridade - a.prioridade)) {
    const chave = normalizar(f.texto).slice(0, 70);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    escolhidas.push(f);
    if (escolhidas.length >= 4) break;
  }
  if (!escolhidas.length) return null;
  const numeros = (itens.map((f) => f.excerto || f.resumo || "").join(" ").match(/\b\d[\d.,]*\s?%|\bR\$\s?[\d.,]+|\b\d{4}\b/g) || []).slice(0, 3);
  return {
    tema,
    linhas: escolhidas.map((e, i) => ({ texto: e.texto.slice(0, 220), fonte: i + 1 })),
    numeros,
  };
}

/* ------------------------------------------------------------ duplicados */
/** Junta títulos quase iguais (mesmo assunto publicado em vários veículos). */
export function agruparDuplicados(itens = []) {
  const grupos = [];
  const usados = new Set();
  itens.forEach((item, i) => {
    if (usados.has(i)) return;
    const base = new Set(palavras(item.titulo));
    const grupo = [i];
    itens.forEach((outro, j) => {
      if (j <= i || usados.has(j)) return;
      const alvo = palavras(outro.titulo);
      if (!alvo.length) return;
      const comuns = alvo.filter((w) => base.has(w)).length;
      const semelhanca = comuns / Math.max(3, Math.min(base.size, alvo.length));
      if (semelhanca >= 0.75) {
        grupo.push(j);
        usados.add(j);
      }
    });
    usados.add(i);
    grupos.push(grupo);
  });
  return grupos;
}

/* ----------------------------------------------------------- convergência */
/** Termos que aparecem em fontes de domínios diferentes (consenso aparente). */
export function convergencia(itens = [], limite = 6) {
  const porTermo = new Map();
  for (const f of itens) {
    const dominio = (() => {
      try {
        return new URL(f.url).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })();
    const texto = palavras(`${f.titulo} ${f.excerto || f.resumo || ""}`);
    for (const termo of new Set(texto)) {
      if (!porTermo.has(termo)) porTermo.set(termo, new Set());
      porTermo.get(termo).add(dominio);
    }
  }
  return [...porTermo.entries()]
    .filter(([termo, dominios]) => dominios.size >= 3 && termo.length > 4)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, limite)
    .map(([termo, dominios]) => ({ termo, dominios: [...dominios].slice(0, 4) }));
}

/* ------------------------------------------------------------- utilidades */
export function contarPorDominio(itens = []) {
  const mapa = new Map();
  for (const f of itens) {
    let d = "";
    try {
      d = new URL(f.url).hostname.replace(/^www\./, "");
    } catch {
      d = "—";
    }
    mapa.set(d, (mapa.get(d) || 0) + 1);
  }
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
}

/** Markdown pronto para exportar (conversa ou dossiê). */
export function paraMarkdown(titulo, blocos = []) {
  const linhas = [`# ${titulo}`, ""];
  for (const b of blocos) {
    if (b.tipo === "par") linhas.push(b.texto, "");
    if (b.tipo === "lista") {
      (b.itens || []).forEach((i, n) => linhas.push(`${n + 1}. ${i}`));
      linhas.push("");
    }
    if (b.tipo === "citação") linhas.push(`> ${b.texto}`, "");
  }
  linhas.push(`_Exportado do SKYNETchat em ${new Date().toLocaleString("pt-BR")}._`);
  return linhas.join("\n");
}

export function baixarArquivo(nome, conteudo, tipo = "text/markdown") {
  const blob = new Blob([conteudo], { type: `${tipo};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* =====================================================================
   Segunda leva de habilidades. Todas rodam no navegador, sem chamada
   externa, e alimentam blocos reais do dossiê e do painel.
   ===================================================================*/

const PARADAS = new Set([
  "para", "como", "mais", "esse", "essa", "isso", "pelo", "pela", "sobre", "entre", "quando",
  "onde", "porque", "tambem", "ainda", "depois", "antes", "desde", "todos", "todas", "pode",
  "podem", "deve", "devem", "apos", "cada", "outro", "outra", "coisa", "aqui", "agora", "muito",
  "menos", "mesmo", "segundo", "first", "over", "with", "this", "that", "from", "have", "will",
]);

/** 11. Palavras-chave do conjunto de fontes, por frequência ponderada. */
export function extrairPalavrasChave(itens = [], limite = 8) {
  const freq = new Map();
  const grafia = new Map();
  const originais = (f) =>
    `${f.titulo || ""} ${f.excerto || f.resumo || ""}`
      .split(/\s+/)
      .map((w) => w.replace(/^[^\wÀ-ÿ]+|[^\wÀ-ÿ]+$/g, ""))
      .filter(Boolean);
  for (const f of itens) {
    for (const bruto of originais(f)) {
      const t = normalizar(bruto);
      if (t.length < 4 || PARADAS.has(t) || t.includes(" ")) continue;
      freq.set(t, (freq.get(t) || 0) + 1);
      if (!grafia.has(t)) grafia.set(t, bruto.toLowerCase());
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limite)
    .map(([termo, n]) => ({ termo: grafia.get(termo) || termo, chave: termo, n }));
}

/** 12. Datas que aparecem nos títulos e trechos, em ordem. */
export function linhaDoTempo(itens = []) {
  const dataRe = /\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b|\b(\d{1,2}) de (janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?: de (\d{4}))?/gi;
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const pontos = [];
  for (const f of itens) {
    const texto = `${f.titulo || ""} ${f.excerto || ""} ${f.resumo || ""}`;
    let m;
    dataRe.lastIndex = 0;
    while ((m = dataRe.exec(texto))) {
      let data = null;
      if (m[1]) data = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      else if (m[4]) data = new Date(Number(m[4]), Number(m[5]) - 1, Number(m[6]));
      else if (m[7]) data = new Date(Number(m[9] || new Date().getFullYear()), meses.indexOf(m[8].toLowerCase()), Number(m[7]));
      if (!data || Number.isNaN(data.getTime())) continue;
      pontos.push({ quando: data, rotulo: m[0], titulo: f.titulo, url: f.url });
    }
  }
  const vistos = new Set();
  return pontos
    .filter((p) => {
      const k = p.rotulo.toLowerCase();
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .sort((a, b) => b.quando - a.quando)
    .slice(0, 6);
}

/** 13. Quão recentes são as fontes (usa p.quando, quando existir). */
export function checarAtualidade(itens = []) {
  const agora = Date.now();
  const dias = itens
    .map((f) => (f.quando ? Math.round((agora - Number(f.quando)) / 86400000) : null))
    .filter((d) => d !== null && d >= 0 && d < 3650);
  if (!dias.length) return null;
  const recentes = dias.filter((d) => d <= 7).length;
  const antigas = dias.filter((d) => d > 120).length;
  const media = Math.round(dias.reduce((a, b) => a + b, 0) / dias.length);
  return { recentes, antigas, media, total: dias.length, frescor: Math.max(0, Math.min(100, 100 - Math.round(media / 3))) };
}

const PERFIS = [
  { chave: "oficial", rotulo: "oficial", teste: /\.(gov|gov\.br|jus\.br|leg\.br|europa\.eu|un\.org|who\.int)$/i },
  { chave: "academico", rotulo: "acadêmico", teste: /(arxiv|nature|science|scielo|springer|ieee|acm|pubmed|nih|edu)/i },
  { chave: "imprensa", rotulo: "imprensa", teste: /(g1|folha|estadao|uol|cnn|reuters|bloomberg|nytimes|bbc|guardian|apnews|valor|exame)/i },
  { chave: "tecnico", rotulo: "técnico", teste: /(github|gitlab|stackoverflow|dev\.to|medium|npmjs|docs\.|developer\.)/i },
];

/** 14. Distribuição das fontes por tipo de veículo. */
export function balancoFontes(itens = []) {
  const contagem = { oficial: 0, academico: 0, imprensa: 0, tecnico: 0, outros: 0 };
  for (const f of itens) {
    let host = "";
    try {
      host = new URL(f.url).hostname;
    } catch {
      host = "";
    }
    const perfil = PERFIS.find((p) => p.teste.test(host));
    contagem[perfil ? perfil.chave : "outros"] += 1;
  }
  const total = itens.length || 1;
  return Object.entries(contagem)
    .map(([chave, n]) => ({ chave, n, fatia: Math.round((n / total) * 100) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
}

/** 15. Tempo total de leitura das fontes com trecho. */
export function estimarLeitura(itens = []) {
  const palavrasTotais = itens.reduce((soma, f) => {
    const texto = `${f.excerto || ""} ${f.resumo || ""}`.trim();
    return soma + (texto ? texto.split(/\s+/).length : 0);
  }, 0);
  const porFonte = itens.map((f) => {
    const texto = `${f.excerto || ""} ${f.resumo || ""}`.trim();
    return Math.max(1, Math.round((texto ? texto.split(/\s+/).length : 120) / 200));
  });
  return {
    minutos: Math.max(1, Math.round(palavrasTotais / 200)),
    palavras: palavrasTotais,
    porFonte,
  };
}

/** 16. Perguntas de continuidade sugeridas a partir dos temas das fontes. */
export function gerarPerguntas(itens = [], tema = "") {
  const chaves = extrairPalavrasChave(itens, 5).map((k) => k.termo);
  const base = chaves[0] || tema || "o assunto";
  const segunda = chaves[1] || "os números";
  const terceira = chaves[2] || "as fontes";
  const modelo = [
    `quais são os números mais recentes sobre ${base}?`,
    `o que muda em ${segunda} nos próximos 12 meses?`,
    `quem discorda de ${base} e por quê?`,
    `compare ${base} com ${terceira} em uma tabela`,
    `resuma em 5 linhas o que encontraste sobre ${base}`,
  ];
  const vistos = new Set();
  return modelo.filter((p) => {
    const k = p.toLowerCase();
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

/** 17. Diferença palavra a palavra entre dois trechos (para comparar fontes). */
export function compararTextos(a = "", b = "") {
  const A = String(a).split(/\s+/).filter(Boolean);
  const B = String(b).split(/\s+/).filter(Boolean);
  const setB = new Set(B.map((w) => w.toLowerCase().replace(/[^\wÀ-ÿ]/g, "")));
  const setA = new Set(A.map((w) => w.toLowerCase().replace(/[^\wÀ-ÿ]/g, "")));
  const soA = [...setA].filter((w) => w && !setB.has(w)).slice(0, 12);
  const soB = [...setB].filter((w) => w && !setA.has(w)).slice(0, 12);
  const comuns = [...setA].filter((w) => w && setB.has(w)).length;
  const semelhanca = Math.round((comuns / Math.max(1, Math.max(setA.size, setB.size))) * 100);
  return { soA, soB, comuns, semelhanca, palavrasA: A.length, palavrasB: B.length };
}

/** 18. Fontes em CSV, prontas para planilha. */
export function paraCsv(itens = []) {
  const escapar = (v) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  const linhas = [["#", "titulo", "dominio", "url", "excerto", "resumo"]];
  itens.forEach((f, i) => {
    linhas.push([i + 1, f.titulo, f.domain, f.url, (f.excerto || "").slice(0, 400), (f.resumo || "").slice(0, 400)]);
  });
  return linhas.map((l) => l.map(escapar).join(";")).join("\n");
}

/** 19. Rascunhos do compositor guardados no navegador. */
const CHAVE_RASCUNHO = "skynet.agente.rascunho.v1";
export function lerRascunho() {
  try {
    const bruto = localStorage.getItem(CHAVE_RASCUNHO);
    if (!bruto) return null;
    const obj = JSON.parse(bruto);
    return obj && typeof obj.texto === "string" && obj.texto.trim() ? obj : null;
  } catch {
    return null;
  }
}
export function guardarRascunho(texto) {
  try {
    if (!texto || !texto.trim()) localStorage.removeItem(CHAVE_RASCUNHO);
    else localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({ texto, quando: new Date().toISOString() }));
  } catch {}
}
export function apagarRascunho() {
  try {
    localStorage.removeItem(CHAVE_RASCUNHO);
  } catch {}
}

/** 20. Densidade da conversa: compacta, confortável ou ampla. */
export function densidadeSalva() {
  try {
    const v = localStorage.getItem("skynet.agente.densidade.v1");
    return ["compacta", "confortavel", "ampla"].includes(v) ? v : "confortavel";
  } catch {
    return "confortavel";
  }
}
export function guardarDensidade(valor) {
  try {
    localStorage.setItem("skynet.agente.densidade.v1", valor);
  } catch {}
}
