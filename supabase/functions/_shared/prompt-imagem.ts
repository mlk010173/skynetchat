// Núcleo PURO (sem rede, sem LLM) do prompt de imagem.
//
// Motivo: modelos de difusão não entendem bem pedidos em português e, principalmente,
// IGNORAM contagens específicas ("um lobo com três olhos" costuma virar dois olhos).
// Aqui o pedido original é preservado literalmente no começo do prompt final e cada
// atributo detectado vira um reforço explícito em inglês, repetido em termos que
// difusão entende ("exactly three eyes", "three distinct eyes clearly visible").
//
// Usado por supabase/functions/imagem/index.ts e testado em
// frontend/src/prompt-imagem.test.js.

export type TipoAtributo = "contagem" | "cor" | "negativo" | "fundo" | "estilo" | "formato";

export type Atributo = {
  tipo: TipoAtributo;
  /** rótulo curto em PT-BR para mostrar como chip na interface */
  rotulo: string;
  /** termo do sujeito em inglês (plural quando faz sentido) */
  sujeito?: string;
  quantidade?: number;
  /** frases de reforço em inglês, enviadas ao modelo */
  reforcos: string[];
  /** termos para prompt negativo (quando o provedor aceitar) */
  negativos?: string[];
};

export type OpcoesPrompt = {
  aspecto?: string;
  qualidade?: string;
  /** idioma da descrição visual; o prompt final continua em inglês */
  maxCaracteres?: number;
};

// ---------------------------------------------------------------- números

const NUMERAIS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7,
  oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14,
  quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20,
  trinta: 30, quarenta: 40, cinquenta: 50, cem: 100,
};

const EM_INGLES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
  "eighteen", "nineteen", "twenty",
];

/** "três" -> 3, "2" -> 2, "12" -> 12; devolve null quando não é número. */
export function numeroDe(token: string): number | null {
  const t = String(token ?? "").trim().toLowerCase();
  if (!t) return null;
  if (/^\d{1,3}$/.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) && n > 0 && n <= 999 ? n : null;
  }
  const semAcento = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (semAcento in NUMERAIS) return NUMERAIS[semAcento];
  return null;
}

/** 3 -> "three"; 21 -> "twenty-one"; acima de 20 usa dígitos. */
export function porExtensoIngles(n: number): string {
  const v = Math.trunc(n);
  if (v >= 0 && v < EM_INGLES.length) return EM_INGLES[v];
  if (v > 20 && v < 100) {
    const dezenas = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
    const d = Math.floor(v / 10);
    const u = v % 10;
    return u ? `${dezenas[d]}-${EM_INGLES[u]}` : dezenas[d];
  }
  return String(v);
}

/** "três" -> "3" para o chip da interface */
export function numeroLegivel(n: number): string {
  return String(Math.trunc(n));
}

function semAcento(texto: string): string {
  return String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// ---------------------------------------------------------------- substantivos contáveis
// chave: forma singular sem acento | plural no idioma do pedido
type Substantivo = { singular: string; ingles: string; inglesUm: string };

const SUBSTANTIVOS: Record<string, Substantivo> = {
  olho: { singular: "olho", ingles: "eyes", inglesUm: "eye" },
  cabeca: { singular: "cabeça", ingles: "heads", inglesUm: "head" },
  pata: { singular: "pata", ingles: "legs", inglesUm: "leg" },
  perna: { singular: "perna", ingles: "legs", inglesUm: "leg" },
  braco: { singular: "braço", ingles: "arms", inglesUm: "arm" },
  dedo: { singular: "dedo", ingles: "fingers", inglesUm: "finger" },
  asa: { singular: "asa", ingles: "wings", inglesUm: "wing" },
  cauda: { singular: "cauda", ingles: "tails", inglesUm: "tail" },
  rabo: { singular: "rabo", ingles: "tails", inglesUm: "tail" },
  chifre: { singular: "chifre", ingles: "horns", inglesUm: "horn" },
  orelha: { singular: "orelha", ingles: "ears", inglesUm: "ear" },
  boca: { singular: "boca", ingles: "mouths", inglesUm: "mouth" },
  dente: { singular: "dente", ingles: "teeth", inglesUm: "tooth" },
  roda: { singular: "roda", ingles: "wheels", inglesUm: "wheel" },
  janela: { singular: "janela", ingles: "windows", inglesUm: "window" },
  porta: { singular: "porta", ingles: "doors", inglesUm: "door" },
  estrela: { singular: "estrela", ingles: "stars", inglesUm: "star" },
  lua: { singular: "lua", ingles: "moons", inglesUm: "moon" },
  sol: { singular: "sol", ingles: "suns", inglesUm: "sun" },
  coracao: { singular: "coração", ingles: "hearts", inglesUm: "heart" },
  espinho: { singular: "espinho", ingles: "spikes", inglesUm: "spike" },
  garras: { singular: "garras", ingles: "claws", inglesUm: "claw" },
  garra: { singular: "garra", ingles: "claws", inglesUm: "claw" },
  antena: { singular: "antena", ingles: "antennae", inglesUm: "antenna" },
  tentaculo: { singular: "tentáculo", ingles: "tentacles", inglesUm: "tentacle" },
  anel: { singular: "anel", ingles: "rings", inglesUm: "ring" },
  botao: { singular: "botão", ingles: "buttons", inglesUm: "button" },
  folha: { singular: "folha", ingles: "leaves", inglesUm: "leaf" },
  flor: { singular: "flor", ingles: "flowers", inglesUm: "flower" },
  pessoa: { singular: "pessoa", ingles: "people", inglesUm: "person" },
  crianca: { singular: "criança", ingles: "children", inglesUm: "child" },
};

/** Resolve "olhos" -> olho, "cabeças" -> cabeça, "patas" -> pata. */
function substantivoDe(token: string): Substantivo | null {
  const s = semAcento(token).toLowerCase();
  if (!s) return null;
  if (s in SUBSTANTIVOS) return SUBSTANTIVOS[s];
  const candidatos: string[] = [];
  if (s.endsWith("oes")) candidatos.push(s.slice(0, -3) + "ao");
  if (s.endsWith("aes")) candidatos.push(s.slice(0, -3) + "ao");
  if (s.endsWith("ais")) candidatos.push(s.slice(0, -3) + "al");
  if (s.endsWith("eis")) candidatos.push(s.slice(0, -3) + "el");
  if (s.endsWith("ns")) candidatos.push(s.slice(0, -2) + "m");
  if (s.endsWith("es")) candidatos.push(s.slice(0, -2));
  if (s.endsWith("s")) candidatos.push(s.slice(0, -1));
  for (const c of candidatos) if (c in SUBSTANTIVOS) return SUBSTANTIVOS[c];
  return null;
}

// ---------------------------------------------------------------- cores / fundo / estilo

const CORES: Array<{ chave: string; pt: string[]; en: string }> = [
  { chave: "red", pt: ["vermelho", "vermelha", "vermelhos", "vermelhas", "rubro", "rubra"], en: "red" },
  { chave: "blue", pt: ["azul", "azuis"], en: "blue" },
  { chave: "green", pt: ["verde", "verdes"], en: "green" },
  { chave: "yellow", pt: ["amarelo", "amarela", "amarelos", "amarelas"], en: "yellow" },
  { chave: "black", pt: ["preto", "preta", "pretos", "pretas", "negro", "negra"], en: "black" },
  { chave: "white", pt: ["branco", "branca", "brancos", "brancas"], en: "white" },
  { chave: "pink", pt: ["rosa", "rosado", "rosada"], en: "pink" },
  { chave: "purple", pt: ["roxo", "roxa", "roxos", "roxas", "violeta"], en: "purple" },
  { chave: "orange", pt: ["laranja", "laranjas"], en: "orange" },
  { chave: "gray", pt: ["cinza", "cinzas", "cinzento", "cinzenta"], en: "gray" },
  { chave: "gold", pt: ["dourado", "dourada", "ouro"], en: "gold" },
  { chave: "silver", pt: ["prateado", "prateada", "prata"], en: "silver" },
  { chave: "brown", pt: ["marrom", "marrons", "castanho", "castanha"], en: "brown" },
  { chave: "turquoise", pt: ["turquesa"], en: "turquoise" },
];

const ESTILOS: Array<{ chave: string; pt: string; en: string }> = [
  { chave: "fotorrealista", pt: "fotorrealista", en: "photorealistic, natural lighting, 50mm lens, sharp focus" },
  { chave: "realista", pt: "realista", en: "realistic, natural lighting, high detail" },
  { chave: "foto", pt: "fotografia", en: "professional photograph, natural lighting, shallow depth of field" },
  { chave: "anime", pt: "anime", en: "anime style illustration, clean line art, cel shading" },
  { chave: "cartoon", pt: "cartoon", en: "cartoon style, bold clean outlines, flat shading" },
  { chave: "desenho animado", pt: "desenho animado", en: "cartoon animation style, bold outlines" },
  { chave: "pixel", pt: "pixel art", en: "pixel art, crisp pixels, limited palette" },
  { chave: "aquarela", pt: "aquarela", en: "watercolor painting, soft washes, paper texture" },
  { chave: "oleo", pt: "pintura a óleo", en: "oil painting, visible brush strokes, canvas texture" },
  { chave: "3d", pt: "3d", en: "3D render, octane render, soft studio lighting" },
  { chave: "vetor", pt: "vetor", en: "flat vector illustration, clean shapes, solid colors" },
  { chave: "minimalista", pt: "minimalista", en: "minimalist design, lots of negative space" },
  { chave: "cyberpunk", pt: "cyberpunk", en: "cyberpunk aesthetic, neon lights, moody atmosphere" },
  { chave: "vintage", pt: "vintage", en: "vintage look, film grain, muted colors" },
  { chave: "logo", pt: "logo", en: "flat logo design, centered composition, simple shapes, scalable" },
  { chave: "icone", pt: "ícone", en: "app icon design, centered, simple geometry" },
  { chave: "banner", pt: "banner", en: "banner composition, clear focal point" },
  { chave: "aesthetic", pt: "estético", en: "aesthetic composition, soft colors" },
];

const FUNDOS: Array<{ chave: string; pt: RegExp; rotulo: string; reforco: string }> = [
  {
    chave: "transparente",
    pt: /fundo\s+(transparente|sem\s+fundo)|sem\s+fundo|png\s+transparente/i,
    rotulo: "fundo transparente",
    reforco: "The background is fully transparent (PNG alpha), no background scenery, no backdrop.",
  },
  {
    chave: "branco",
    pt: /fundo\s+(branco|claro\s+e\s+limpo)|em\s+fundo\s+branco/i,
    rotulo: "fundo branco",
    reforco: "Plain solid white background, no scenery, clean studio backdrop.",
  },
  {
    chave: "preto",
    pt: /fundo\s+preto|em\s+fundo\s+preto/i,
    rotulo: "fundo preto",
    reforco: "Plain solid black background, no scenery, studio backdrop.",
  },
  {
    chave: "desfocado",
    pt: /fundo\s+(desfocado|blur)|bokeh/i,
    rotulo: "fundo desfocado",
    reforco: "Background softly blurred with strong bokeh, subject in sharp focus.",
  },
];

// ---------------------------------------------------------------- API pública

/** Detecta contagens, cores, fundo, estilo e proibições ("sem texto") em PT-BR. */
export function extrairAtributos(prompt: string): Atributo[] {
  const texto = String(prompt ?? "");
  const atributos: Atributo[] = [];
  if (!texto.trim()) return atributos;
  const vistos = new Set<string>();
  const acrescentar = (a: Atributo) => {
    const chave = `${a.tipo}:${a.rotulo.toLowerCase()}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    atributos.push(a);
  };

  // 1. contagens: "três olhos", "2 cabeças", "seis patas", "um lobo" (quantidade 1 é implícita)
  const tokens = texto.split(/[^0-9A-Za-zÀ-ÖØ-öø-ÿ-]+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const n = numeroDe(tokens[i]);
    if (n === null) continue;
    if (n < 2) continue; // "um/uma" é o padrão do modelo, não precisa reforço
    let achou = false;
    for (let j = i + 1; j < Math.min(i + 4, tokens.length); j++) {
      const sub = substantivoDe(tokens[j]);
      if (!sub) continue;
      acrescentar({
        tipo: "contagem",
        rotulo: `${tokens[i]} ${tokens[j]}`.toLowerCase(),
        sujeito: sub.ingles,
        quantidade: n,
        reforcos: [
          `The subject has exactly ${porExtensoIngles(n)} ${sub.ingles}.`,
          `Exactly ${porExtensoIngles(n)} ${sub.ingles} — ${porExtensoIngles(n)} distinct ${sub.ingles} clearly visible, no more and no fewer.`,
          `Count check: ${porExtensoIngles(n)} ${sub.ingles} in total.`,
        ],
        negativos: n === 2
          ? [`three ${sub.ingles}`, `four ${sub.ingles}`]
          : [`wrong number of ${sub.ingles}`, `extra ${sub.ingles}`, `missing ${sub.ingles}`],
      });
      achou = true;
      break;
    }
    if (achou) continue;
  }

  // 2. cores: com ou sem sujeito (guardamos a palavra imediatamente depois quando existir)
  for (const cor of CORES) {
    const re = new RegExp(`\\b(${cor.pt.join("|")})\\b`, "i");
    const m = texto.match(re);
    if (!m) continue;
    const pos = (m.index ?? 0) + m[0].length;
    const resto = texto.slice(pos, pos + 40);
    const alvo = resto.match(/^\s+(de\s+|da\s+|do\s+)?([A-Za-zÀ-ÖØ-öø-ÿ]{3,})/)?.[2] ?? "";
    acrescentar({
      tipo: "cor",
      rotulo: `cor ${cor.pt[0]}${alvo ? ` (${alvo})` : ""}`,
      reforcos: [
        `Color specification: ${cor.en}${alvo ? ` (the ${alvo})` : ""} — keep this exact ${cor.en} color.`,
      ],
    });
  }

  // 3. fundo
  for (const f of FUNDOS) {
    if (!f.pt.test(texto)) continue;
    acrescentar({ tipo: "fundo", rotulo: f.rotulo, reforcos: [f.reforco] });
  }

  // 4. estilo
  for (const e of ESTILOS) {
    const re = new RegExp(`\\b${e.pt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (!re.test(semAcento(texto))) continue;
    if (e.chave === "realista" && /\bfotorrealista\b/i.test(semAcento(texto))) continue;
    acrescentar({ tipo: "estilo", rotulo: `estilo ${e.pt}`, reforcos: [`Style: ${e.en}.`] });
  }

  // 5. proibições explícitas
  const proibicoes: Array<{ re: RegExp; rotulo: string; negativos: string[] }> = [
    {
      re: /\b(sem|nada de|nenhum|nenhuma|não quero|nao quero)\b[^.;,]{0,12}\btexto\b|\btext[- ]?free\b|\bno text\b/i,
      rotulo: "sem texto",
      negativos: ["text", "words", "letters", "watermark", "signature", "caption", "typography", "logo overlay"],
    },
    {
      re: /\bsem\s+(marca\s+)?d['’]?\s*[áa]gua\b|\bsem\s+watermark\b/i,
      rotulo: "sem marca d'água",
      negativos: ["watermark", "logo overlay", "copyright mark"],
    },
    {
      re: /\bsem\s+pessoas\b|\bsem\s+ningu[ée]m\b/i,
      rotulo: "sem pessoas",
      negativos: ["people", "person", "human", "crowd"],
    },
    {
      re: /\bsem\s+(viol[êe]ncia|sangue)\b/i,
      rotulo: "sem violência",
      negativos: ["violence", "blood", "gore"],
    },
  ];
  for (const p of proibicoes) {
    if (!p.re.test(texto)) continue;
    acrescentar({ tipo: "negativo", rotulo: p.rotulo, reforcos: [`Strictly no ${p.negativos.slice(0, 3).join(", no ")}.`], negativos: p.negativos });
  }

  return atributos;
}

const ASPECTOS: Record<string, { en: string; largura: number; altura: number }> = {
  "1:1": { en: "square 1:1 aspect ratio", largura: 1024, altura: 1024 },
  "16:9": { en: "wide 16:9 landscape aspect ratio", largura: 1280, altura: 720 },
  "9:16": { en: "tall 9:16 portrait aspect ratio", largura: 720, altura: 1280 },
  "4:3": { en: "4:3 landscape aspect ratio", largura: 1024, altura: 768 },
  "3:4": { en: "3:4 portrait aspect ratio", largura: 768, altura: 1024 },
};

/** Dimensões de pixel para provedores que só aceitam largura/altura (Pollinations). */
export function dimensoes(aspecto?: string): { largura: number; altura: number } {
  const a = ASPECTOS[String(aspecto ?? "1:1")] ?? ASPECTOS["1:1"];
  return { largura: a.largura, altura: a.altura };
}

export function aspectoValido(aspecto?: string): string {
  const a = String(aspecto ?? "").trim();
  return a in ASPECTOS ? a : "1:1";
}

const QUALIDADES: Record<string, { en: string; passos: number }> = {
  rapida: { en: "clean, well composed, efficient render", passos: 4 },
  padrao: { en: "high detail, professional composition, sharp focus", passos: 20 },
  alta: { en: "ultra detailed, professional composition, crisp sharp focus, high resolution, rich lighting", passos: 30 },
};

export function qualidadeValida(q?: string): "rapida" | "padrao" | "alta" {
  const v = String(q ?? "").trim().toLowerCase();
  return v === "rapida" || v === "alta" ? v : "padrao";
}

/** Passos de difusão por qualidade (respeitando o mínimo dos modelos NVIDIA). */
export function passosPorQualidade(qualidade?: string): number {
  return QUALIDADES[qualidadeValida(qualidade)].passos;
}

/**
 * Prompt final em inglês: começa com "Subject: <pedido original, literal>" e depois
 * repete cada atributo de forma explícita. Determinístico, sem rede.
 */
export function montarPromptFinal(
  prompt: string,
  atributos: Atributo[] = [],
  opcoes: OpcoesPrompt = {},
): string {
  const original = String(prompt ?? "").trim();
  const aspecto = aspectoValido(opcoes.aspecto);
  const qualidade = qualidadeValida(opcoes.qualidade);
  const lista = Array.isArray(atributos) ? atributos : [];

  const linhas: string[] = [`Subject: ${original}`];

  const reforcos = lista.flatMap((a) => a.reforcos ?? []).filter(Boolean);
  if (reforcos.length) {
    linhas.push(...reforcos);
    linhas.push("All requirements above are mandatory and must appear exactly as described.");
  }

  const estilos = lista.filter((a) => a.tipo === "estilo").flatMap((a) => a.reforcos.map((r) => r.replace(/^Style:\s*/i, "").replace(/\.$/, "")));
  if (estilos.length) linhas.push(`Style: ${estilos.join(", ")}.`);

  linhas.push(`Composition: ${ASPECTOS[aspecto].en}, centered clear focal point.`);
  linhas.push(`Quality: ${QUALIDADES[qualidade].en}.`);

  return limiteSeguro(linhas.join("\n"), Number(opcoes.maxCaracteres) > 0 ? Number(opcoes.maxCaracteres) : 1800, lista);
}

/** Prompt negativo (usado só por provedores que aceitam). */
export function negativos(atributos: Atributo[] = [], opcoes: { qualidade?: string } = {}): string {
  const lista = new Set<string>(["low quality", "blurry", "jpeg artifacts", "deformed", "extra limbs", "duplicated subject"]);
  for (const a of Array.isArray(atributos) ? atributos : []) {
    for (const n of a.negativos ?? []) if (n) lista.add(String(n));
  }
  if (qualidadeValida(opcoes.qualidade) === "alta") {
    ["low resolution", "oversaturated", "flat lighting"].forEach((n) => lista.add(n));
  }
  return [...lista].join(", ").slice(0, 600);
}

/**
 * Trunca sem perder atributos: as linhas de reforço e de estilo ficam inteiras;
 * o "Subject:" (pedido original) é o primeiro a ser encurtado, sempre no limite de palavra,
 * e as linhas acessórias são as primeiras a sair.
 */
export function limiteSeguro(prompt: string, max = 1800, atributos: Atributo[] = []): string {
  const texto = String(prompt ?? "");
  const limite = Number.isFinite(max) && max > 80 ? Math.trunc(max) : 1800;
  if (texto.length <= limite) return texto;

  const linhas = texto.split("\n");
  const ehReforco = (linha: string) => {
    if (/^(Subject|Aspect|Composition|Quality):/i.test(linha)) return false;
    return (atributos ?? []).some((a) => (a.reforcos ?? []).some((r) => r && linha.includes(r)));
  };

  const subject = linhas.find((l) => /^Subject:/i.test(l)) ?? "";
  const obrigatorias = linhas.filter((l) => l !== subject && ehReforco(l));
  const opcionais = linhas.filter((l) => l !== subject && !ehReforco(l));

  const cabecalho = "Subject: ";
  const fixas = obrigatorias.join("\n");
  // espaço reservado para as obrigatórias + quebras de linha
  const sobraSubject = limite - fixas.length - (obrigatorias.length ? 1 : 0) - cabecalho.length - 1;

  let corpoSubject = subject.replace(/^Subject:\s*/i, "").trim();
  if (sobraSubject < 20) corpoSubject = "";
  else if (corpoSubject.length > sobraSubject) {
    corpoSubject = corpoSubject.slice(0, sobraSubject - 1);
    const corte = corpoSubject.lastIndexOf(" ");
    corpoSubject = `${(corte > 20 ? corpoSubject.slice(0, corte) : corpoSubject).trim()}…`;
  }

  const partes: string[] = [];
  if (corpoSubject) partes.push(`${cabecalho}${corpoSubject}`);
  if (fixas) partes.push(fixas);

  // completa com as linhas acessórias (Composition/Quality) se ainda couber
  for (const linha of opcionais) {
    const tentativa = [...partes, linha].join("\n");
    if (tentativa.length <= limite) partes.push(linha);
  }

  let saida = partes.join("\n");
  if (saida.length > limite) saida = `${saida.slice(0, limite - 1)}…`;
  return saida;
}

// ---------------------------------------------------------------- detecção de pedido

const VERBO_IMAGEM = /\b(gere|gera|gerar|gostaria de|quero|crie|cria|criar|desenhe|desenha|desenhar|ilustre|ilustra|ilustrar|pinte|pinta|fa[cç]a|produza|monte)\b/i;
const OBJETO_IMAGEM = /\b(imagem|imagens|foto|fotos|figura|desenho|ilustra[cç][aã]o|arte|logo|logotipo|banner|capa|avatar|[íi]cone|wallpaper|meme|quadro|render)\b/i;
const DIRETO = /\b(imagem|foto|desenho|figura|ilustra[cç][aã]o|logo|logotipo|avatar|banner)\s+(de|do|da|com|sobre)\b/i;

/**
 * Heurística PT-BR: parece pedido de geração de imagem?
 * Evita falso positivo em perguntas ("como gerar imagem no Photoshop?").
 */
export function ehPedidoDeImagem(texto: string): boolean {
  const t = String(texto ?? "").trim();
  if (!t || t.length < 4) return false;
  const interroga = /\?\s*$/.test(t) || /^(como|qual|quais|quando|onde|por que|porque|quem|o que)\b/i.test(t);
  if (interroga && !VERBO_IMAGEM.test(t)) return false;
  if (DIRETO.test(t)) return true;
  if (!VERBO_IMAGEM.test(t)) return false;
  // verbo + objeto aparecem perto um do outro
  const m = t.match(VERBO_IMAGEM);
  const pos = (m?.index ?? 0) + (m?.[0]?.length ?? 0);
  const janela = t.slice(pos, pos + 48);
  if (OBJETO_IMAGEM.test(janela)) return true;
  // "desenhe um lobo com três olhos" (verbo explícito de desenho dispensa o substantivo)
  if (/\b(desenhe|desenha|desenhar|ilustre|ilustra|ilustrar|pinte|pinta)\b/i.test(m?.[0] ?? "")) {
    return t.split(/\s+/).length >= 3;
  }
  return false;
}

/** Resumo curto dos atributos para a interface (chips). */
export function chipsDeAtributos(atributos: Atributo[] = []): string[] {
  return (Array.isArray(atributos) ? atributos : []).map((a) => a.rotulo).filter(Boolean);
}
