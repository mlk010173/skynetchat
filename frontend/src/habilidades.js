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
