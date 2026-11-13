// SKYNET · parser de Markdown em blocos e inline (puro, sem DOM e sem HTML).
// Devolve uma árvore de dados; quem renderiza monta nós React. Como nunca produz
// strings HTML, não existe caminho de XSS por aqui: o texto sempre vira texto.

const ESCAPE = /\\([\\`*_{}\[\]()#+\-.!|~>])/g;

// ---------------------------------------------------------------- inline
/** Cores permitidas em {cor:texto}; qualquer outra palavra vira texto literal. */
export const CORES = {
  vermelho: "#f87171",
  laranja: "#fb923c",
  amarelo: "#facc15",
  verde: "#4ade80",
  azul: "#60a5fa",
  roxo: "#a78bfa",
  rosa: "#f472b6",
  cinza: "#a3a3a3",
};

/** Só esquemas seguros: javascript:, data: e vbscript: nunca viram link. */
export function urlSegura(url) {
  const u = String(url ?? "").trim();
  if (!u) return null;
  if (/^(https?:\/\/|mailto:)/i.test(u)) return u;
  if (/^\/(?!\/)/.test(u) || u.startsWith("#")) return u; // relativo ao próprio site
  return null;
}

/**
 * Tokeniza inline. Ordem importa: código primeiro (nada dentro dele é interpretado),
 * depois links/menções/cores, depois ênfase.
 * Tipos: texto, codigo, negrito, italico, sublinhado, tachado, destaque, cor, link,
 * mencao, citacao, formula.
 */
export function parseInline(texto) {
  const src = String(texto ?? "");
  const saida = [];
  let i = 0;
  let buffer = "";
  const despejar = () => {
    if (buffer) saida.push({ tipo: "texto", valor: buffer.replace(ESCAPE, "$1") });
    buffer = "";
  };

  while (i < src.length) {
    const resto = src.slice(i);
    let m;

    if (src[i] === "\\" && i + 1 < src.length && /[\\`*_{}\[\]()#+\-.!|~>@$=]/.test(src[i + 1])) {
      buffer += src[i + 1];
      i += 2;
      continue;
    }

    // código inline
    if ((m = resto.match(/^`([^`\n]+)`/))) {
      despejar();
      saida.push({ tipo: "codigo", valor: m[1] });
      i += m[0].length;
      continue;
    }
    // fórmula inline $...$ (sem espaço colado ao cifrão para não pegar preços)
    if ((m = resto.match(/^\$(?!\s)([^$\n]{1,200}?)(?<!\s)\$(?!\d)/))) {
      despejar();
      saida.push({ tipo: "formula", valor: m[1] });
      i += m[0].length;
      continue;
    }
    // link [texto](url)
    if ((m = resto.match(/^\[([^\]\n]{1,300})\]\(([^)\s]{1,2000})\)/))) {
      const url = urlSegura(m[2]);
      if (url) {
        despejar();
        saida.push({ tipo: "link", url, filhos: parseInline(m[1]) });
        i += m[0].length;
        continue;
      }
    }
    // citação de fonte [1]
    if ((m = resto.match(/^\[(\d{1,2})\](?!\()/))) {
      despejar();
      saida.push({ tipo: "citacao", indice: Number(m[1]) });
      i += m[0].length;
      continue;
    }
    // menção @algo (só no começo ou depois de espaço/pontuação)
    if (src[i] === "@" && (i === 0 || /[\s(\[,;:]/.test(src[i - 1])) && (m = resto.match(/^@([A-Za-zÀ-ÿ][\wÀ-ÿ.-]{0,39})/))) {
      despejar();
      saida.push({ tipo: "mencao", nome: m[1].replace(/[.-]+$/, "") });
      i += m[0].replace(/[.-]+$/, "").length;
      continue;
    }
    // cor {cor:texto}
    if ((m = resto.match(/^\{([a-zà-ÿ]+):([^}\n]{1,300})\}/i)) && CORES[m[1].toLowerCase()]) {
      despejar();
      saida.push({ tipo: "cor", cor: m[1].toLowerCase(), filhos: parseInline(m[2]) });
      i += m[0].length;
      continue;
    }
    // destaque ==texto==
    if ((m = resto.match(/^==([^=\n]+)==/))) {
      despejar();
      saida.push({ tipo: "destaque", filhos: parseInline(m[1]) });
      i += m[0].length;
      continue;
    }
    // sublinhado ++texto++
    if ((m = resto.match(/^\+\+([^+\n]+)\+\+/))) {
      despejar();
      saida.push({ tipo: "sublinhado", filhos: parseInline(m[1]) });
      i += m[0].length;
      continue;
    }
    // tachado ~~texto~~
    if ((m = resto.match(/^~~([^~\n]+)~~/))) {
      despejar();
      saida.push({ tipo: "tachado", filhos: parseInline(m[1]) });
      i += m[0].length;
      continue;
    }
    // negrito **texto**
    if ((m = resto.match(/^\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*/))) {
      despejar();
      saida.push({ tipo: "negrito", filhos: parseInline(m[1]) });
      i += m[0].length;
      continue;
    }
    // itálico *texto* (não confunde com lista nem multiplicação com espaços)
    if ((m = resto.match(/^\*(?![\s*])([^*\n]+?)(?<![\s*])\*(?!\*)/))) {
      despejar();
      saida.push({ tipo: "italico", filhos: parseInline(m[1]) });
      i += m[0].length;
      continue;
    }

    buffer += src[i];
    i += 1;
  }
  despejar();
  return saida;
}

// ---------------------------------------------------------------- tabelas
const ehSeparadorTabela = (linha) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(linha) && linha.includes("-");

/** Divide uma linha de tabela respeitando `\|` escapado e barras dentro de código. */
export function dividirLinhaTabela(linha) {
  let l = String(linha).trim();
  if (l.startsWith("|")) l = l.slice(1);
  if (l.endsWith("|") && !l.endsWith("\\|")) l = l.slice(0, -1);
  const celulas = [];
  let atual = "";
  let emCodigo = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (c === "`") emCodigo = !emCodigo;
    if (c === "\\" && l[i + 1] === "|") {
      atual += "|";
      i += 1;
      continue;
    }
    if (c === "|" && !emCodigo) {
      celulas.push(atual.trim());
      atual = "";
      continue;
    }
    atual += c;
  }
  celulas.push(atual.trim());
  return celulas;
}

function alinhamentos(linhaSeparadora) {
  return dividirLinhaTabela(linhaSeparadora).map((c) => {
    const e = c.startsWith(":");
    const d = c.endsWith(":");
    return e && d ? "centro" : d ? "direita" : e ? "esquerda" : null;
  });
}

/** "1.234,56", "R$ 10", "12%" → número, ou null quando a célula não é numérica. */
export function numeroDaCelula(texto) {
  const t = String(texto ?? "").trim().replace(/^(R\$|US\$|\$|€|£)\s*/i, "").replace(/\s*%$/, "");
  if (!t || !/^[-+]?[\d.,\s]+$/.test(t) || !/\d/.test(t)) return null;
  const limpo = t.replace(/\s/g, "");
  const temVirgula = limpo.includes(",");
  const temPonto = limpo.includes(".");
  let n;
  if (temVirgula && temPonto) {
    // o último separador é o decimal
    n = limpo.lastIndexOf(",") > limpo.lastIndexOf(".")
      ? limpo.replace(/\./g, "").replace(",", ".")
      : limpo.replace(/,/g, "");
  } else if (temVirgula) {
    n = /,\d{1,2}$/.test(limpo) ? limpo.replace(",", ".") : limpo.replace(/,/g, "");
  } else if (temPonto) {
    n = /\.\d{3}(\.|$)/.test(limpo) && (limpo.match(/\./g) || []).length >= 1 && !/\.\d{1,2}$/.test(limpo)
      ? limpo.replace(/\./g, "")
      : limpo;
  } else n = limpo;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

/** CSV seguro: aspas dobradas e proteção contra injeção de fórmula em planilhas. */
export function tabelaParaCsv(cabecalho, linhas, separador = ",") {
  const esc = (v) => {
    let s = String(v ?? "").replace(/\r?\n/g, " ").trim();
    if (/^[=+\-@\t\r]/.test(s) && numeroDaCelula(s) === null) s = `'${s}`; // evita =HYPERLINK(...) etc.
    return /[",\n;]/.test(s) || s.includes(separador) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cabecalho, ...linhas].map((l) => l.map(esc).join(separador)).join("\r\n");
}

export function tabelaParaTsv(cabecalho, linhas) {
  const lim = (v) => String(v ?? "").replace(/[\t\r\n]+/g, " ").trim();
  return [cabecalho, ...linhas].map((l) => l.map(lim).join("\t")).join("\n");
}

// ---------------------------------------------------------------- blocos
const RE_CERCA = /^```([\w+#.-]*)\s*$/;
const RE_TITULO = /^(#{1,4})\s+(.+?)\s*#*\s*$/;
const RE_LISTA = /^(\s*)([-*•+]|\d{1,3}[.)])\s+(.*)$/;
const RE_CHECK = /^\[( |x|X)\]\s+(.*)$/;
const RE_SEPARADOR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

/**
 * Converte markdown em blocos. Tipos: paragrafo, titulo, lista, citacao, codigo, tabela,
 * separador, formula, figura. Listas aceitam aninhamento por indentação e checklists.
 */
export function parseBlocos(texto) {
  const linhas = String(texto ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocos = [];
  let i = 0;

  const vazia = (l) => !l || !l.trim();

  while (i < linhas.length) {
    const linha = linhas[i];

    if (vazia(linha)) { i += 1; continue; }

    // bloco de código cercado
    let m = linha.match(RE_CERCA);
    if (m) {
      const buffer = [];
      i += 1;
      while (i < linhas.length && !/^```\s*$/.test(linhas[i])) { buffer.push(linhas[i]); i += 1; }
      const fechou = i < linhas.length;
      if (fechou) i += 1;
      blocos.push({ tipo: "codigo", linguagem: m[1] || "", codigo: buffer.join("\n"), aberto: !fechou });
      continue;
    }

    // fórmula em bloco $$ ... $$
    if (/^\s*\$\$\s*$/.test(linha) || /^\s*\$\$[^$]+\$\$\s*$/.test(linha)) {
      const unica = linha.match(/^\s*\$\$([^$]+)\$\$\s*$/);
      if (unica) { blocos.push({ tipo: "formula", valor: unica[1].trim() }); i += 1; continue; }
      const buffer = [];
      i += 1;
      while (i < linhas.length && !/^\s*\$\$\s*$/.test(linhas[i])) { buffer.push(linhas[i]); i += 1; }
      i += 1;
      blocos.push({ tipo: "formula", valor: buffer.join("\n").trim() });
      continue;
    }

    // título
    if ((m = linha.match(RE_TITULO))) {
      blocos.push({ tipo: "titulo", nivel: m[1].length, filhos: parseInline(m[2]) });
      i += 1;
      continue;
    }

    // separador
    if (RE_SEPARADOR.test(linha) && !RE_LISTA.test(linha)) {
      blocos.push({ tipo: "separador" });
      i += 1;
      continue;
    }

    // tabela: cabeçalho + linha separadora
    if (linha.includes("|") && i + 1 < linhas.length && ehSeparadorTabela(linhas[i + 1])) {
      const cabecalho = dividirLinhaTabela(linha);
      const alinhar = alinhamentos(linhas[i + 1]);
      i += 2;
      const corpo = [];
      while (i < linhas.length && !vazia(linhas[i]) && linhas[i].includes("|")) {
        const cels = dividirLinhaTabela(linhas[i]);
        // normaliza a largura: célula faltando vira vazia, sobrando é cortada
        while (cels.length < cabecalho.length) cels.push("");
        corpo.push(cels.slice(0, cabecalho.length));
        i += 1;
      }
      blocos.push({
        tipo: "tabela",
        cabecalho,
        alinhar: cabecalho.map((_, k) => alinhar[k] ?? null),
        linhas: corpo,
      });
      continue;
    }

    // citação
    if (/^\s{0,3}>\s?/.test(linha)) {
      const buffer = [];
      while (i < linhas.length && /^\s{0,3}>\s?/.test(linhas[i])) {
        buffer.push(linhas[i].replace(/^\s{0,3}>\s?/, ""));
        i += 1;
      }
      blocos.push({ tipo: "citacao", filhos: parseBlocos(buffer.join("\n")) });
      continue;
    }

    // lista (com aninhamento e checklist)
    if (RE_LISTA.test(linha)) {
      const itens = [];
      while (i < linhas.length && (RE_LISTA.test(linhas[i]) || (/^\s{2,}\S/.test(linhas[i]) && itens.length))) {
        const lm = linhas[i].match(RE_LISTA);
        if (!lm) {
          // continuação de item (linha indentada sem marcador)
          itens[itens.length - 1].texto += " " + linhas[i].trim();
          i += 1;
          continue;
        }
        const nivel = Math.min(3, Math.floor(lm[1].replace(/\t/g, "  ").length / 2));
        let conteudo = lm[3];
        let marcado = null;
        const cm = conteudo.match(RE_CHECK);
        if (cm) { marcado = cm[1].toLowerCase() === "x"; conteudo = cm[2]; }
        itens.push({ nivel, ordenada: /^\d/.test(lm[2]), texto: conteudo, marcado });
        i += 1;
      }
      blocos.push({ tipo: "lista", itens: itens.map((it) => ({ ...it, filhos: parseInline(it.texto) })) });
      continue;
    }

    // imagem solta ![alt](url)
    if ((m = linha.match(/^\s*!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)\s*$/))) {
      blocos.push({ tipo: "figura", alt: m[1], url: m[2] });
      i += 1;
      continue;
    }

    // parágrafo: junta linhas até uma linha vazia ou o início de outro bloco
    const buffer = [linha];
    i += 1;
    while (
      i < linhas.length
      && !vazia(linhas[i])
      && !RE_CERCA.test(linhas[i])
      && !RE_TITULO.test(linhas[i])
      && !RE_LISTA.test(linhas[i])
      && !/^\s{0,3}>\s?/.test(linhas[i])
      && !RE_SEPARADOR.test(linhas[i])
      && !(linhas[i].includes("|") && i + 1 < linhas.length && ehSeparadorTabela(linhas[i + 1]))
    ) {
      buffer.push(linhas[i]);
      i += 1;
    }
    blocos.push({ tipo: "paragrafo", filhos: parseInline(buffer.join("\n")) });
  }
  return blocos;
}

/** Texto puro de uma árvore inline (para copiar, buscar e acessibilidade). */
export function textoPuro(nos) {
  return (nos ?? []).map((n) => {
    if (n.tipo === "texto" || n.tipo === "codigo" || n.tipo === "formula") return n.valor;
    if (n.tipo === "mencao") return `@${n.nome}`;
    if (n.tipo === "citacao") return `[${n.indice}]`;
    return textoPuro(n.filhos);
  }).join("");
}
