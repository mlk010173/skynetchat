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
  terminal: {
    nome: "Terminal real",
    desc: "Comandos no servidor do agente (com aprovação)",
    icone: ">_",
    critico: true,
    padrao: { comando: "ls" },
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
