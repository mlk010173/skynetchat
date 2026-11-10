// SKYNET · gerenciador central de eventos de streaming.
//
// Um único lugar entende os eventos canônicos da Responses API da OpenAI e
// devolve o estado que a interface desenha: texto progressivo, resumo de
// raciocínio, etapas realmente executadas, fontes citáveis e falhas.
//
// Regra de ouro: este módulo nunca inventa etapa, fonte ou número. Se o evento
// não chegou, o estado não muda.
//
// Referência: developers.openai.com/api/docs/guides/streaming-responses

/** Eventos canônicos reconhecidos (nome → intenção interna). */
export const EVENTOS = {
  "response.created": "inicio",
  "response.in_progress": "inicio",
  "response.output_item.added": "item_abre",
  "response.output_item.done": "item_fecha",
  "response.content_part.added": "parte_abre",
  "response.content_part.done": "parte_fecha",
  "response.output_text.delta": "texto_delta",
  "response.output_text.done": "texto_fim",
  "response.reasoning_summary_text.delta": "resumo_delta",
  "response.reasoning_summary_text.done": "resumo_fim",
  "response.reasoning_summary_part.added": "resumo_parte",
  "response.function_call_arguments.delta": "args_delta",
  "response.function_call_arguments.done": "args_fim",
  "response.web_search_call.in_progress": "busca_inicio",
  "response.web_search_call.searching": "busca_ativa",
  "response.web_search_call.completed": "busca_fim",
  "response.file_search_call.in_progress": "arquivo_inicio",
  "response.file_search_call.searching": "arquivo_ativa",
  "response.file_search_call.completed": "arquivo_fim",
  "response.code_interpreter_call.in_progress": "codigo_inicio",
  "response.code_interpreter_call.code_delta": "codigo_delta",
  "response.code_interpreter_call.interpreting": "codigo_rodando",
  "response.code_interpreter_call.completed": "codigo_fim",
  "response.image_generation_call.in_progress": "imagem_inicio",
  "response.image_generation_call.completed": "imagem_fim",
  "response.completed": "completo",
  "response.failed": "falhou",
  "response.incomplete": "incompleto",
  error: "erro",
};

/** Nome humano de cada atividade (usado na linha do tempo). */
export const ATIVIDADES = {
  pensando: { rotulo: "Pensando", icone: "brain" },
  analisando: { rotulo: "Analisando solicitação", icone: "spark" },
  pesquisando: { rotulo: "Pesquisando na internet", icone: "search" },
  fontes: { rotulo: "Consultando fontes", icone: "book" },
  arquivos: { rotulo: "Lendo arquivos", icone: "folder" },
  imagens: { rotulo: "Analisando imagens", icone: "image" },
  codigo: { rotulo: "Executando código", icone: "code" },
  processo: { rotulo: "Processando informações", icone: "gear" },
  preparando: { rotulo: "Preparando resposta", icone: "pen" },
  concluido: { rotulo: "Resposta concluída", icone: "check" },
};

const agora = () => Date.now();
const copia = (v) => JSON.parse(JSON.stringify(v));

export function estadoInicial() {
  return {
    id: null,
    modelo: null,
    fase: "ocioso", // ocioso | iniciando | gerando | concluido | falhou | incompleto | erro
    texto: "",
    textoConfirmado: "",
    resumoRaciocinio: "",
    atividades: [], // { chave, rotulo, icone, estado, inicio, fim, detalhe, itens }
    fontes: [], // { indice, url, titulo, dominio, favicon }
    arquivos: [],
    codigo: [],
    erro: null,
    iniciadoEm: null,
    terminadoEm: null,
    respostaId: null,
  };
}

const domínio = (url = "") => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
};

/** Atividade de um item de saída da Responses API. */
function atividadeDoItem(item = {}) {
  const tipo = String(item.type || "");
  if (tipo.includes("web_search")) return "pesquisando";
  if (tipo.includes("file_search")) return "arquivos";
  if (tipo.includes("code_interpreter")) return "codigo";
  if (tipo.includes("image_generation")) return "imagens";
  if (tipo === "reasoning") return "pensando";
  if (tipo === "function_call" || tipo === "mcp_call") return "processo";
  if (tipo === "message") return "preparando";
  return "processo";
}

/**
 * Cria um gerenciador independente (uma geração = um gerenciador).
 * Devolve `aplicar(evento)` → estado novo, e `ler()` → estado atual.
 */
export function criarGerenciador(inicial = {}) {
  let estado = { ...estadoInicial(), ...inicial };

  const abre = (chave, detalhe = "") => {
    if (!ATIVIDADES[chave]) return null;
    const existente = estado.atividades.find((a) => a.chave === chave && a.estado === "ativo");
    if (existente) {
      if (detalhe) existente.detalhe = String(detalhe).slice(0, 200);
      return existente;
    }
    // só uma atividade ativa por vez: a anterior fecha
    for (const a of estado.atividades) if (a.estado === "ativo") { a.estado = "concluido"; a.fim = a.fim || agora(); }
    const nova = {
      chave,
      rotulo: ATIVIDADES[chave].rotulo,
      icone: ATIVIDADES[chave].icone,
      estado: "ativo",
      inicio: agora(),
      fim: null,
      detalhe: String(detalhe || "").slice(0, 200),
      itens: [],
    };
    estado.atividades.push(nova);
    return nova;
  };

  const fecha = (chave, estadoFinal = "concluido") => {
    for (const a of estado.atividades) {
      if (a.chave === chave && a.estado === "ativo") { a.estado = estadoFinal; a.fim = a.fim || agora(); }
    }
  };

  const registraFonte = (fonte = {}) => {
    const url = fonte.url || fonte.link || "";
    if (!url) return null;
    const existente = estado.fontes.find((f) => f.url === url);
    if (existente) return existente;
    const registro = {
      indice: estado.fontes.length + 1,
      url,
      titulo: fonte.titulo || fonte.title || domínio(url),
      dominio: domínio(url),
      favicon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domínio(url))}&sz=32`,
    };
    estado.fontes.push(registro);
    return registro;
  };

  const aplicar = (evento = {}) => {
    if (!evento) return estado;
    const tipo = evento.type || evento.tipo || "";
    const intencao = EVENTOS[tipo] || evento.intencao || "";

    if (intencao === "inicio") {
      estado.fase = estado.fase === "ocioso" ? "iniciando" : estado.fase;
      estado.iniciadoEm = estado.iniciadoEm || agora();
      estado.respostaId = evento.response?.id || evento.response_id || estado.respostaId;
      estado.modelo = evento.response?.model || evento.model || estado.modelo;
      abre("pensando", "recebendo o pedido");
      return estado;
    }

    if (intencao === "item_abre") {
      const item = evento.item || {};
      if (item.type === "message") abre("preparando", "montando a mensagem");
      else {
        const chave = atividadeDoItem(item);
        const a = abre(chave, item.name || item.type || "");
        if (a && tipo === "function_call") a.detalhe = item.name || "";
      }
      return estado;
    }

    if (intencao === "item_fecha") {
      const item = evento.item || {};
      const chave = atividadeDoItem(item);
      // fontes vindas da busca/web
      const achadas = [
        ...(item.action?.sources || []),
        ...(item.results || []),
        ...(item.citations || []),
      ];
      for (const f of achadas) {
        const reg = registraFonte(f);
        const a = estado.atividades.find((x) => x.chave === chave);
        if (a && reg && !a.itens.some((i) => i.url === reg.url)) a.itens.push({ url: reg.url, titulo: reg.titulo, indice: reg.indice });
      }
      fecha(chave, "concluido");
      return estado;
    }

    if (intencao === "texto_delta") {
      estado.fase = "gerando";
      fecha("preparando");
      abre("preparando", "escrevendo a resposta");
      estado.texto += String(evento.delta ?? evento.text ?? "");
      return estado;
    }

    if (intencao === "texto_fim") {
      estado.textoConfirmado = String(evento.text ?? estado.texto);
      estado.texto = estado.textoConfirmado;
      return estado;
    }

    if (intencao === "resumo_delta") {
      estado.resumoRaciocinio += String(evento.delta ?? "");
      abre("pensando", "avaliando o pedido");
      return estado;
    }

    if (intencao === "resumo_fim") {
      if (evento.text) estado.resumoRaciocinio = String(evento.text);
      fecha("pensando");
      return estado;
    }

    if (intencao === "busca_inicio" || intencao === "busca_ativa") {
      abre("pesquisando", intencao === "busca_ativa" ? "consultando a web" : "preparando a busca");
      return estado;
    }
    if (intencao === "busca_fim") {
      abre("fontes", "reunindo referências");
      fecha("pesquisando");
      return estado;
    }
    if (intencao === "arquivo_inicio" || intencao === "arquivo_ativa") { abre("arquivos", "lendo documentos"); return estado; }
    if (intencao === "arquivo_fim") { fecha("arquivos"); return estado; }
    if (intencao === "codigo_inicio" || intencao === "codigo_rodando") { abre("codigo", "executando no sandbox"); return estado; }
    if (intencao === "codigo_delta") {
      const a = abre("codigo", "escrevendo o programa");
      if (a) a.codigo = (a.codigo || "") + String(evento.delta ?? "");
      return estado;
    }
    if (intencao === "codigo_fim") {
      const a = estado.atividades.find((x) => x.chave === "codigo");
      if (a?.codigo && !estado.codigo.some((c) => c.codigo === a.codigo)) {
        estado.codigo.push({ linguagem: a.detalhe || "python", codigo: a.codigo, saida: a.saida || "" });
      }
      fecha("codigo");
      return estado;
    }
    if (intencao === "imagem_inicio") { abre("imagens", "gerando imagem"); return estado; }
    if (intencao === "imagem_fim") { fecha("imagens"); return estado; }

    if (intencao === "args_delta" || intencao === "args_fim") {
      const a = abre("processo", "preparando ferramenta");
      if (a) a.argumentos = (a.argumentos || "") + String(evento.delta ?? "");
      if (intencao === "args_fim") fecha("processo");
      return estado;
    }

    if (intencao === "completo") {
      estado.fase = "concluido";
      estado.terminadoEm = agora();
      for (const a of estado.atividades) if (a.estado === "ativo") { a.estado = "concluido"; a.fim = a.fim || estado.terminadoEm; }
      const resposta = evento.response || {};
      for (const item of resposta.output || []) {
        const chave = atividadeDoItem(item);
        if (!estado.atividades.some((a) => a.chave === chave)) continue;
      }
      return estado;
    }

    if (intencao === "incompleto") {
      estado.fase = "incompleto";
      estado.terminadoEm = agora();
      estado.erro = evento.response?.incomplete_details?.reason || "resposta incompleta";
      for (const a of estado.atividades) if (a.estado === "ativo") { a.estado = "concluido"; a.fim = a.fim || estado.terminadoEm; }
      return estado;
    }

    if (intencao === "falhou") {
      estado.fase = "falhou";
      estado.terminadoEm = agora();
      estado.erro = evento.response?.error?.message || evento.error?.message || "a geração falhou";
      for (const a of estado.atividades) if (a.estado === "ativo") { a.estado = "erro"; a.fim = a.fim || estado.terminadoEm; }
      return estado;
    }

    if (intencao === "erro") {
      estado.fase = "erro";
      estado.terminadoEm = agora();
      estado.erro = evento.message || evento.error?.message || "erro de conexão";
      return estado;
    }

    // eventos internos do backend do SKYNET continuam aceitos (compatibilidade)
    if (evento.tipo === "etapa" || evento.chave) {
      const chave = evento.chave || "processo";
      if (evento.estado === "concluido" || evento.tipo === "fechar") fecha(chave);
      else abre(chave, evento.detalhe || "");
      for (const f of evento.fontes || []) registraFonte(f);
      return estado;
    }

    return estado;
  };

  return {
    aplicar,
    ler: () => estado,
    estado: () => estado,
    copiaEstado: () => copia(estado),
  };
}

/** Atividades prontas para render (com duração em segundos). */
export function linhaDoTempo(estado) {
  const fim = estado?.terminadoEm || agora();
  return (estado?.atividades || []).map((a) => ({
    ...a,
    segundos: Math.max(0, Math.round(((a.fim || fim) - a.inicio) / 1000)),
  }));
}

/** Resumo seguro e curto do que aconteceu (sem raciocínio interno). */
export function resumoSeguro(estado) {
  const itens = estado?.atividades || [];
  if (!itens.length) return "";
  const partes = [];
  const buscou = itens.find((a) => a.chave === "pesquisando");
  if (buscou) partes.push(`pesquisou na web (${estado.fontes.length} fonte${estado.fontes.length === 1 ? "" : "s"})`);
  const leu = itens.find((a) => a.chave === "arquivos");
  if (leu) partes.push("leu arquivos enviados");
  const codigo = itens.find((a) => a.chave === "codigo");
  if (codigo) partes.push("executou código");
  if (!partes.length) partes.push(`${itens.length} etapa${itens.length === 1 ? "" : "s"} de preparação`);
  return partes.join(" · ");
}

/** Texto pronto para resposta com citações [n] ancoradas nas fontes. */
export function comCitacoes(texto = "") {
  return String(texto).replace(/\[(\d{1,2})\](?!\()/g, "[[$1]](cite:$1)");
}
