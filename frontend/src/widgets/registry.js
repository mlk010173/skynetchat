// Registro de widgets do SKYNET: tipos, padrões e validação da spec vinda da IA.

export const TIPOS = {
  status: {
    nome: "Monitor de sistema",
    desc: "Site, agente, banco e integrações ao vivo",
    icone: "◉",
    critico: false,
    padrao: {},
    tamanho: { cols: 2, linhas: 3 },
    atualizarAgora: 60,
  },
  metricas: {
    nome: "Gráfico de métricas",
    desc: "Série temporal de um número qualquer",
    icone: "▤",
    critico: false,
    padrao: { metrica: "resposta_ms", rotulo: "latência da API" },
    tamanho: { cols: 2, linhas: 3 },
    atualizarAgora: 30,
  },
  noticias: {
    nome: "Notícias ao vivo",
    desc: "Pesquisa na web e lista manchetes com fonte",
    icone: "≣",
    critico: false,
    padrao: { consulta: "notícias de tecnologia hoje", limite: 5 },
    tamanho: { cols: 2, linhas: 4 },
    atualizarAgora: 300,
  },
  github: {
    nome: "GitHub",
    desc: "Repositório, arquivos e atividade",
    icone: "⌥",
    critico: false,
    padrao: { repo: "mlk010173/skynetchat", visao: "repo" },
    tamanho: { cols: 2, linhas: 4 },
    atualizarAgora: 120,
  },
  video: {
    nome: "Vídeo / transmissão",
    desc: "YouTube, Vimeo, MP4 ou link de live",
    icone: "▶",
    critico: false,
    padrao: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", titulo: "vídeo" },
    tamanho: { cols: 2, linhas: 4 },
    atualizarAgora: 0,
  },
  midia: {
    nome: "Player de mídia",
    desc: "YouTube, Spotify, SoundCloud, Vimeo, MP4 e MP3",
    icone: "♪",
    critico: false,
    padrao: { provedor: "youtube", url: "", titulo: "" },
    tamanho: { cols: 2, linhas: 4 },
    atualizarAgora: 0,
  },
  imagem: {
    nome: "Imagem por IA",
    desc: "Gera, guarda e atualiza imagens a partir de um texto",
    icone: "▣",
    critico: false,
    padrao: { prompt: "", estilo: "fotorrealista", url: "" },
    tamanho: { cols: 2, linhas: 4 },
    atualizarAgora: 0,
  },
  galeria: {
    nome: "Galeria multimídia",
    desc: "Vários vídeos, músicas e imagens na mesma grade",
    icone: "▦",
    critico: false,
    padrao: { itens: [] },
    tamanho: { cols: 4, linhas: 5 },
    atualizarAgora: 0,
  },
  terminal: {
    nome: "Terminal real",
    desc: "Comandos no servidor do agente (com aprovação)",
    icone: ">_",
    critico: true,
    padrao: { comando: "ls", sandbox: true },
    tamanho: { cols: 2, linhas: 4 },
    atualizarAgora: 0,
  },
  ia: {
    nome: "Widget de IA",
    desc: "Bloco gerado por descrição em linguagem natural",
    icone: "✦",
    critico: false,
    padrao: { pergunta: "resuma as notícias de tecnologia", atualizarAgora: 0 },
    tamanho: { cols: 2, linhas: 3 },
    atualizarAgora: 0,
  },
  texto: {
    nome: "Nota fixa",
    desc: "Texto seu, sempre à mão",
    icone: "✎",
    critico: false,
    padrao: { texto: "" },
    tamanho: { cols: 1, linhas: 2 },
    atualizarAgora: 0,
  },
};

export const listaTipos = () => Object.entries(TIPOS).map(([id, t]) => ({ id, ...t }));

let contador = 0;
export function novoId() {
  contador += 1;
  return `w${Date.now().toString(36)}${contador.toString(36)}`;
}

/** Cria um widget já com padrões do tipo. */
export function criarWidget(tipo, extra = {}) {
  const meta = TIPOS[tipo];
  if (!meta) return null;
  return {
    id: novoId(),
    tipo,
    titulo: extra.titulo ?? meta.nome,
    config: { ...meta.padrao, ...(extra.config ?? {}) },
    cols: clamp(Number(extra.cols) || meta.tamanho.cols, 1, 4),
    linhas: clamp(Number(extra.linhas) || meta.tamanho.linhas, 2, 8),
    atualizarAgora: intervaloValido(extra.atualizarAgora ?? meta.atualizarAgora),
    criadoEm: new Date().toISOString(),
  };
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
}

/** 0 = manual; acima disso, segundos entre atualizações (mínimo 10). */
export function intervaloValido(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return clamp(Math.round(n), 10, 3600);
}

/** Aceita a spec devolvida pela IA e devolve um widget seguro. */
export function daSpec(spec) {
  if (!spec || typeof spec !== "object") return { ok: false, erro: "spec vazia" };
  const tipo = String(spec.tipo ?? "").toLowerCase();
  if (!TIPOS[tipo]) return { ok: false, erro: `tipo desconhecido: ${tipo || "vazio"}` };
  const w = criarWidget(tipo, {
    titulo: typeof spec.titulo === "string" ? spec.titulo.slice(0, 60) : undefined,
    config: spec.config && typeof spec.config === "object" ? spec.config : undefined,
    cols: spec.cols,
    linhas: spec.linhas,
    atualizarAgora: spec.atualizarAgora,
  });
  return { ok: true, widget: w };
}

/** Extrai JSON de uma resposta de modelo que pode vir com texto em volta. */
export function extrairJson(texto) {
  const s = String(texto ?? "");
  const bloco = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const alvo = bloco ? bloco[1] : s;
  const ini = alvo.indexOf("{");
  const fim = alvo.lastIndexOf("}");
  if (ini === -1 || fim <= ini) return null;
  try {
    return JSON.parse(alvo.slice(ini, fim + 1));
  } catch {
    return null;
  }
}

/** Prompt usado para o widget criado por IA. */
export function promptDoWidget(descricao) {
  const tipos = Object.entries(TIPOS).map(([id, t]) => `- ${id}: ${t.desc} (config padrão ${JSON.stringify(t.padrao)})`).join("\n");
  return [
    "Você cria widgets para o painel do SKYNET. Responda SOMENTE com JSON válido, sem comentários.",
    'Formato: {"tipo":"<um dos tipos>","titulo":"<curto>","config":{...},"cols":1-4,"linhas":2-8,"atualizarAgora":0-3600}',
    "Tipos disponíveis:",
    tipos,
    `Pedido do usuário: ${String(descricao).slice(0, 300)}`,
  ].join("\n");
}

/** Quando a IA não devolve JSON válido, o pedido é interpretado por palavras-chave. */
export function porPalavras(descricao) {
  const d = String(descricao || "").toLowerCase();
  const regras = [
    ["metricas", /(gr[aá]fico|lat[eê]ncia|m[eé]trica|s[eé]rie|tempo de resposta|desempenho)/],
    ["noticias", /(not[ií]cia|manchete|jornal|aconteceu|news)/],
    ["github", /(github|reposit[oó]rio|repo|commit|pull request|c[oó]digo-fonte)/],
    ["imagem", /(imagem por ia|gerar imagem|imagem ao vivo|foto gerada|arte por ia)/],
    ["galeria", /(galeria|v[aá]rios v[ií]deos|mural de m[ií]dia|cole[cç][aã]o de v[ií]deos)/],
    ["midia", /(m[uú]sica|spotify|soundcloud|playlist|tocar|player|podcast|lofi)/],
    ["video", /(v[ií]deo|youtube|vimeo|transmiss[aã]o|live)/],
    ["terminal", /(terminal|comando|shell|servidor|ssh|executar)/],
    ["ia", /(pergunt|resum|escrev|texto|resposta|an[aá]lise)/],
    ["texto", /(nota|anota[cç][aã]o|lembrete|rascunho)/],
    ["status", /(status|monitor|sa[uú]de|online|fora do ar|disponibilidade)/],
  ];
  const achado = regras.find(([, re]) => re.test(d));
  const tipo = achado ? achado[0] : "status";
  const config = { ...TIPOS[tipo].padrao };
  if (tipo === "noticias") config.consulta = String(descricao).slice(0, 120);
  if (tipo === "github" && /([\w.-]+\/[\w.-]+)/.test(descricao)) config.repo = descricao.match(/([\w.-]+\/[\w.-]+)/)[1];
  if (tipo === "video") {
    const url = String(descricao).match(/https?:\/\/\S+/);
    if (url) config.url = url[0];
  }
  if (tipo === "ia") config.pergunta = String(descricao).slice(0, 160);
  if (tipo === "metricas") {
    const seg = String(descricao).match(/(\d+)\s*(s|seg|segundos)/i);
    if (seg) config.atualizarAgora = Number(seg[1]);
  }
  const intervalo = String(descricao).match(/cada\s+(\d+)\s*(s|seg|segundos|min|minutos)?/i);
  const atualizarAgora = intervalo ? (/(min)/i.test(intervalo[2] || "") ? Number(intervalo[1]) * 60 : Number(intervalo[1])) : TIPOS[tipo].atualizarAgora;
  return criarWidget(tipo, { config, atualizarAgora });
}

export function chaveStorage(userId) {
  return `skynet-widgets:${userId || "convidado"}`;
}

export function carregarWidgets(chave) {
  try {
    const bruto = localStorage.getItem(chave);
    if (!bruto) return [];
    const lista = JSON.parse(bruto);
    if (!Array.isArray(lista)) return [];
    return lista.filter((w) => w && TIPOS[w.tipo]).map((w) => ({ ...w, atualizarAgora: intervaloValido(w.atualizarAgora) }));
  } catch {
    return [];
  }
}

export function salvarWidgets(chave, widgets) {
  try {
    localStorage.setItem(chave, JSON.stringify(widgets));
    return true;
  } catch {
    return false;
  }
}
