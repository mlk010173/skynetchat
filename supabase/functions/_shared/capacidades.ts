// SKYNET · registro central de capacidades dos modelos (núcleo puro, sem rede).
// O roteador já sabe saúde/cooldown/prioridade. Faltava saber o que cada modelo
// REALMENTE faz, para nunca mandar imagem a modelo sem visão nem ferramenta a modelo
// que não as suporta. Nada aqui é inventado: capacidade desconhecida fica `null`
// (= não sei), e só é tratada como suportada quando declarada.

export type Modalidade = "texto" | "visao" | "audio_entrada" | "audio_saida" | "imagem_saida" | "classificacao";

export interface Capacidades {
  modalidades: Modalidade[];
  ferramentas: boolean | null;
  raciocinio: boolean | null;
  contextoTokens: number | null;
  /** custo em USD por 1M de tokens (entrada, saída); null = desconhecido, não estimar custo */
  custoPorMilhao: { entrada: number; saida: number } | null;
}

const DESCONHECIDA: Capacidades = {
  modalidades: ["texto"],
  ferramentas: null,
  raciocinio: null,
  contextoTokens: null,
  custoPorMilhao: null,
};

/**
 * Declaração por padrão de id. Só entra aqui o que é conhecido pela documentação pública
 * dos provedores; o dono pode sobrescrever tudo com SKYNET_CAPACIDADES (JSON).
 */
const REGRAS: { teste: RegExp; cap: Partial<Capacidades> }[] = [
  { teste: /gpt-4o|gpt-4\.1|gpt-5/i, cap: { modalidades: ["texto", "visao"], ferramentas: true } },
  { teste: /(^|[-/])o[134](-|$)|reason|thinking|deepseek-r1/i, cap: { raciocinio: true } },
  { teste: /claude/i, cap: { modalidades: ["texto", "visao"], ferramentas: true } },
  { teste: /gemini/i, cap: { modalidades: ["texto", "visao", "audio_entrada"], ferramentas: true } },
  { teste: /llama-?3\.[123]|llama-?4/i, cap: { ferramentas: true } },
  { teste: /vision|-vl\b|llava|pixtral/i, cap: { modalidades: ["texto", "visao"] } },
  { teste: /whisper|stt|transcri/i, cap: { modalidades: ["audio_entrada"], ferramentas: false } },
  { teste: /tts|speech|voice/i, cap: { modalidades: ["audio_saida"], ferramentas: false } },
  { teste: /flux|stable-diffusion|sdxl|dall-?e|imagen/i, cap: { modalidades: ["imagem_saida"], ferramentas: false } },
  { teste: /embed/i, cap: { modalidades: ["texto"], ferramentas: false } },
  // classificadores de segurança e calibração não geram resposta de conversa
  { teste: /guard|moderation|calibration|classifier|reward/i, cap: { modalidades: ["classificacao" as Modalidade], ferramentas: false } },
];

export function lerSobrescritas(bruto: string | undefined | null): Record<string, Partial<Capacidades>> {
  if (!bruto) return {};
  try {
    const obj = JSON.parse(bruto);
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

export function capacidadesDe(
  modeloId: string,
  sobrescritas: Record<string, Partial<Capacidades>> = {},
): Capacidades {
  let cap: Capacidades = { ...DESCONHECIDA, modalidades: [] };
  let declarouModalidade = false;
  for (const r of REGRAS) {
    if (!r.teste.test(modeloId)) continue;
    if (r.cap.modalidades) declarouModalidade = true;
    cap = {
      ...cap,
      ...r.cap,
      modalidades: Array.from(new Set([...cap.modalidades, ...(r.cap.modalidades ?? [])])),
    };
  }
  // "texto" só é o padrão quando nenhuma regra declarou a modalidade do modelo;
  // um modelo de imagem ou de áudio puro NÃO conversa por texto.
  if (!declarouModalidade) cap.modalidades = ["texto"];
  // modelos multimodais de linguagem sempre entendem texto
  if (cap.modalidades.includes("visao") && !cap.modalidades.includes("texto")) cap.modalidades.unshift("texto");
  const o = sobrescritas[modeloId];
  if (o) cap = { ...cap, ...o, modalidades: o.modalidades ?? cap.modalidades };
  return cap;
}

export interface Requisitos {
  visao?: boolean;
  ferramentas?: boolean;
  audioEntrada?: boolean;
  raciocinio?: boolean;
  /** tokens de entrada estimados que precisam caber */
  tokensEntrada?: number;
}

/**
 * Compatível = declara o que o pedido exige. `null` (desconhecido) NÃO conta como suportado
 * para modalidade (visão/áudio), mas é tolerado para ferramentas e contexto, para não
 * esvaziar a lista quando o provedor não informa nada.
 */
export function atende(cap: Capacidades, req: Requisitos): boolean {
  if (req.visao && !cap.modalidades.includes("visao")) return false;
  if (req.audioEntrada && !cap.modalidades.includes("audio_entrada")) return false;
  if (cap.modalidades.length === 1 && cap.modalidades[0] !== "texto") return false; // só imagem/áudio puro não conversa
  if (req.ferramentas && cap.ferramentas === false) return false;
  if (req.raciocinio && cap.raciocinio === false) return false;
  if (req.tokensEntrada && cap.contextoTokens && req.tokensEntrada > cap.contextoTokens * 0.9) return false;
  return true;
}

/** Filtra candidatos mantendo a ordem. Se nada atende, devolve vazio (o chamador decide o aviso). */
export function filtrarCompativeis<T extends { id: string }>(
  candidatos: T[],
  req: Requisitos,
  sobrescritas: Record<string, Partial<Capacidades>> = {},
): T[] {
  return candidatos.filter((c) => atende(capacidadesDe(c.id, sobrescritas), req));
}

/** Custo estimado em USD; null quando o preço do modelo não é conhecido (nunca inventa). */
export function custoEstimado(cap: Capacidades, tokensEntrada: number, tokensSaida: number): number | null {
  if (!cap.custoPorMilhao) return null;
  return (tokensEntrada * cap.custoPorMilhao.entrada + tokensSaida * cap.custoPorMilhao.saida) / 1_000_000;
}
