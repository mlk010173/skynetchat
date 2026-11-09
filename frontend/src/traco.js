// SKYNET · traço de streaming.
// Modelo único que descreve "o que está acontecendo" enquanto a IA responde,
// no mesmo espírito dos eventos semânticos da Responses API da OpenAI
// (response.created, response.reasoning_summary_text.delta,
// response.web_search_call.searching, response.output_text.delta,
// response.code_interpreter_call.code_delta, response.output_text.annotation_added).
// Aqui os eventos são reduzidos a oito grupos que a interface sabe desenhar.

export const GRUPOS = [
  { chave: "pensando", icone: "🧠", rotulo: "Pensando", dica: "raciocinando sobre o pedido" },
  { chave: "pesquisando", icone: "🔍", rotulo: "Pesquisando", dica: "buscando informação" },
  { chave: "fontes", icone: "📖", rotulo: "Fontes", dica: "referências encontradas" },
  { chave: "analisando", icone: "⚙️", rotulo: "Analisando", dica: "cruzando o que foi lido" },
  { chave: "gerando", icone: "✍️", rotulo: "Gerando resposta", dica: "escrevendo a resposta" },
  { chave: "codigo", icone: "💻", rotulo: "Código", dica: "escrevendo código" },
  { chave: "arquivos", icone: "📂", rotulo: "Arquivos", dica: "lendo arquivos" },
  { chave: "links", icone: "🔗", rotulo: "Links e referências", dica: "endereços citados" },
];

const porChave = Object.fromEntries(GRUPOS.map((g) => [g.chave, g]));

export const grupo = (chave) => porChave[chave] || null;

/** Mapa direto dos eventos canônicos da Responses API para os grupos daqui. */
export const EVENTOS_OPENAI = {
  "response.created": "pensando",
  "response.in_progress": "pensando",
  "response.reasoning_summary_text.delta": "pensando",
  "response.reasoning_text.delta": "pensando",
  "response.web_search_call.in_progress": "pesquisando",
  "response.web_search_call.searching": "pesquisando",
  "response.web_search_call.completed": "fontes",
  "response.file_search_call.searching": "pesquisando",
  "response.file_search_call.completed": "arquivos",
  "response.code_interpreter_call.in_progress": "codigo",
  "response.code_interpreter_call.code_delta": "codigo",
  "response.code_interpreter_call.interpreting": "analisando",
  "response.output_text.delta": "gerando",
  "response.output_text.annotation_added": "links",
  "response.output_item.added": "gerando",
  "response.completed": "gerando",
};

export function tracoVazio() {
  return { inicio: Date.now(), fim: null, ordem: [], grupos: {}, resumo: { caracteres: 0, fontes: 0, links: 0, arquivos: 0 } };
}

const copiar = (traco) => ({
  ...traco,
  grupos: { ...traco.grupos },
  ordem: [...traco.ordem],
  resumo: { ...traco.resumo },
});

/**
 * Aplica um evento e devolve um traço novo.
 * evento = { tipo, chave, detalhe, item, texto, quando }
 * tipo: "abrir" (grupo começa) | "detalhe" | "item" | "fechar" | "texto" | "erro"
 */
export function aplicarEvento(traco = tracoVazio(), evento = {}) {
  const t = copiar(traco);
  const chave = evento.chave || EVENTOS_OPENAI[evento.tipo] || null;
  if (!chave || !porChave[chave]) return t;

  const g = t.grupos[chave] || {
    chave,
    inicio: Date.now(),
    fim: null,
    estado: "ativo",
    detalhe: "",
    itens: [],
    caracteres: 0,
  };

  if (evento.detalhe) g.detalhe = String(evento.detalhe).slice(0, 160);

  if (evento.item) {
    const item = typeof evento.item === "string" ? { titulo: evento.item } : evento.item;
    const chaveItem = item.url || item.titulo || "";
    if (chaveItem && !g.itens.some((i) => (i.url || i.titulo) === chaveItem)) {
      g.itens.push({ ...item, quando: Date.now() });
      if (chave === "fontes") t.resumo.fontes += 1;
      if (chave === "links") t.resumo.links += 1;
      if (chave === "arquivos") t.resumo.arquivos += 1;
    }
  }

  if (evento.texto) {
    g.caracteres += String(evento.texto).length;
    if (chave === "gerando") t.resumo.caracteres += String(evento.texto).length;
    if (chave === "pensando") g.detalhe = String(evento.texto).trim().slice(-140);
  }

  if (evento.tipo === "fechar" || evento.tipo === "concluido") {
    g.fim = Date.now();
    g.estado = "concluido";
  } else if (g.estado !== "concluido") {
    g.estado = "ativo";
  }
  if (evento.tipo === "erro") { g.estado = "erro"; g.fim = Date.now(); }

  // só um grupo ativo por vez: abrir um novo fecha o anterior
  if (g.estado === "ativo") {
    for (const outra of Object.values(t.grupos)) {
      if (outra.chave !== chave && outra.estado === "ativo") {
        outra.estado = "concluido";
        outra.fim = outra.fim || Date.now();
      }
    }
  }

  t.grupos[chave] = g;
  if (!t.ordem.includes(chave)) t.ordem.push(chave);
  return t;
}

/** Encerra tudo o que ficou aberto (fim do streaming ou erro). */
export function encerrarTraco(traco) {
  const t = copiar(traco);
  t.fim = Date.now();
  for (const g of Object.values(t.grupos)) {
    if (g.estado === "ativo") { g.estado = "concluido"; g.fim = g.fim || t.fim; }
  }
  return t;
}

/** Detecta blocos de código aparecendo no texto gerado. */
export function codigoNoDelta(traco, delta = "") {
  if (!delta.includes("```")) return traco;
  return aplicarEvento(traco, { tipo: "abrir", chave: "codigo", detalhe: "bloco de código na resposta" });
}

/** Detecta links no texto gerado para alimentar o grupo de referências. */
export function linksNoTexto(traco, texto = "") {
  const achados = String(texto).match(/https?:\/\/[^\s)\]]+/g) || [];
  if (!achados.length) return traco;
  let t = traco;
  for (const url of achados.slice(-3)) {
    t = aplicarEvento(t, { tipo: "item", chave: "links", item: { url, titulo: url } });
  }
  return t;
}

/** Segundos de um grupo (ou do traço inteiro). */
export function duracao(traco, chave = null) {
  if (!traco) return 0;
  const fim = traco.fim || Date.now();
  if (!chave) return Math.max(0, Math.round((fim - traco.inicio) / 1000));
  const g = traco.grupos[chave];
  if (!g) return 0;
  return Math.max(0, Math.round(((g.fim || fim) - g.inicio) / 1000));
}

/** Texto curto do cabeçalho: "pensou 3s · 12 fontes · gerando". */
export function resumoTraco(traco) {
  if (!traco || !traco.ordem.length) return "preparando";
  const partes = [];
  const ativo = traco.ordem.map((k) => traco.grupos[k]).find((g) => g && g.estado === "ativo");
  if (ativo) partes.push(porChave[ativo.chave].rotulo.toLowerCase());
  const seg = duracao(traco);
  if (seg >= 2) partes.push(`${seg}s`);
  if (traco.resumo.fontes) partes.push(`${traco.resumo.fontes} fontes`);
  if (traco.resumo.arquivos) partes.push(`${traco.resumo.arquivos} arquivos`);
  return partes.join(" · ") || "preparando";
}

/** Lista de grupos pronta para render, com rótulo e ícone. */
export function listaTraco(traco) {
  if (!traco) return [];
  return traco.ordem
    .map((k) => traco.grupos[k])
    .filter(Boolean)
    .map((g) => ({ ...porChave[g.chave], ...g, segundos: duracao(traco, g.chave) }));
}

/** Traduz o nome da ferramenta do agente para um grupo do traço. */
export function grupoDoTool(nome = "") {
  const n = String(nome).toLowerCase();
  if (/web|search|pesquis|google|serper|brave|noticia|news/.test(n)) return "pesquisando";
  if (/imag|foto|vision|ocr/.test(n)) return "analisando";
  if (/abrir|naveg|render|browser|leitura|fetch|page|extract/.test(n)) return "analisando";
  if (/arquivo|file|pdf|doc|sheet|csv/.test(n)) return "arquivos";
  if (/codigo|code|shell|exec|python|terminal/.test(n)) return "codigo";
  return "analisando";
}
