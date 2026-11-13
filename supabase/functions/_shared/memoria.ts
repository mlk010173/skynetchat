// ============================================================================
// SKYNET · memória inteligente — NÚCLEO PURO
// ----------------------------------------------------------------------------
// Regras deste arquivo (importantes para o teste rodar nos dois mundos):
//   • nenhum import externo;
//   • nenhuma chamada de rede;
//   • nada de `Deno.*` nem de `npm:` aqui dentro — só APIs padrão (Web Crypto).
// Assim o mesmo módulo roda na edge function (Deno) e no vitest do frontend
// (Node), via `frontend/src/memoria-core.test.js`.
//
// O que NÃO mora aqui: banco, embedding, JWT, HTTP. Isso é papel de
// supabase/functions/memorias/index.ts.
// ============================================================================

export const TIPOS = [
  "preferencia",
  "projeto",
  "objetivo",
  "decisao",
  "configuracao",
  "instrucao",
  "fato",
  "tarefa",
] as const;

export type TipoMemoria = (typeof TIPOS)[number];

/** Dimensão do pgvector usada em memoria_itens.embedding (text-embedding-3-small). */
export const DIMENSOES_EMBEDDING = 1536;

/** Teto de caracteres de um item (o mesmo do banco/edge). */
export const LIMITE_CONTEUDO = 1000;

/** Tipos em que um item novo costuma SUBSTITUIR o anterior do mesmo assunto. */
const TIPOS_SUBSTITUIVEIS: TipoMemoria[] = [
  "preferencia",
  "decisao",
  "instrucao",
  "configuracao",
  "objetivo",
];

/** Palavras vazias do português: saem do Jaccard e da extração de tópicos. */
const VAZIAS = new Set([
  "a", "à", "as", "às", "o", "os", "um", "uma", "uns", "umas",
  "de", "do", "da", "dos", "das", "dum", "duma", "em", "no", "na", "nos", "nas",
  "por", "pelo", "pela", "pelos", "pelas", "para", "pra", "pro", "com", "sem",
  "que", "quem", "qual", "quais", "se", "e", "ou", "mas", "porem", "porém",
  "como", "quando", "onde", "porque", "pois", "entao", "então", "tambem", "também",
  "mais", "menos", "muito", "muita", "muitos", "muitas", "pouco", "pouca",
  "eu", "tu", "ele", "ela", "nos", "nós", "vos", "eles", "elas", "voce", "você",
  "me", "te", "lhe", "lhes", "meu", "minha", "meus", "minhas", "seu", "sua",
  "seus", "suas", "nosso", "nossa", "isso", "isto", "aquilo", "esse", "essa",
  "este", "esta", "aquele", "aquela", "aqueles", "aquelas", "ja", "já",
  "nao", "não", "sim", "ser", "sou", "e", "é", "eh", "foi", "era", "sao", "são",
  "estou", "esta", "está", "estar", "estava", "tenho", "tem", "tinha", "ter",
  "vai", "vou", "ir", "ai", "aí", "la", "lá", "aqui", "hoje", "ontem", "amanha",
  "amanhã", "agora", "depois", "antes", "sobre", "entre", "ate", "até",
  "favor", "ajuda", "ajudar", "obrigado", "obrigada", "oi", "ola", "olá",
  "bem", "bom", "boa", "coisa", "coisas", "fazer", "feito", "vez", "vezes",
  "tipo", "assim", "tudo", "todo", "toda", "todos", "todas", "cada",
]);

/** Junta os motivos sem repetir. */
const unicos = (lista: string[]): string[] => [...new Set(lista.filter(Boolean))];

/* ------------------------------------------------------------------ texto */

/** Normaliza para comparação/deduplicação: NFC, sem acento não é opção (guarda
 *  o português legível), mas caixa, espaços, pontas e pontuação final saem. */
export function normalizar(texto: unknown): string {
  return String(texto ?? "")
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[“”„«»]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s"'([]+/, "")
    .replace(/[\s"').,;:!?\]]+$/, "")
    .toLowerCase();
}

/** Texto pronto para exibir/gravar: mantém a caixa do usuário, só limpa espaços. */
export function limpar(texto: unknown, limite = LIMITE_CONTEUDO): string {
  return String(texto ?? "")
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, limite);
}

/** Estimativa grosseira de tokens (~4 caracteres por token). */
export function estimarTokens(texto: unknown): number {
  const s = String(texto ?? "");
  if (!s.trim()) return 0;
  return Math.ceil(s.length / 4);
}

/** Palavras significativas de um texto (sem vazias, sem pontuação, minúsculas). */
export function palavras(texto: unknown): string[] {
  return normalizar(texto)
    .replace(/[^a-z0-9à-ÿ\s-]/gi, " ")
    .split(/[\s-]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 3 && !VAZIAS.has(p));
}

/** Conjunto de tokens (para Jaccard). */
export function tokens(texto: unknown): Set<string> {
  return new Set(palavras(texto));
}

/** Similaridade de Jaccard entre dois textos (0..1). */
export function jaccard(a: unknown, b: unknown): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size && !tb.size) return 1;
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const uniao = ta.size + tb.size - inter;
  return uniao === 0 ? 0 : inter / uniao;
}

/** Hash estável do conteúdo normalizado (SHA-256 em hex). */
export async function hashConteudo(texto: unknown): Promise<string> {
  const base = normalizar(texto);
  const dados = new TextEncoder().encode(base);
  const cryptoApi = (globalThis as { crypto?: Crypto }).crypto;
  if (!cryptoApi?.subtle) {
    // ambiente sem Web Crypto: hash determinístico de emergência (NÃO é
    // criptográfico, mas mantém a deduplicação funcionando em runtime antigo).
    let h1 = 0x811c9dc5;
    let h2 = 0xc2b2ae35;
    for (let i = 0; i < base.length; i++) {
      const c = base.charCodeAt(i);
      h1 = (h1 ^ c) * 16777619 >>> 0;
      h2 = (h2 ^ (c + i)) * 2246822519 >>> 0;
    }
    return `fnv${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
  }
  const digest = await cryptoApi.subtle.digest("SHA-256", dados);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* --------------------------------------------------------------- sensível */

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/i;

/** Dígitos de CPF com os dois verificadores corretos (evita falso positivo em
 *  qualquer número de 11 dígitos, tipo telefone com DDD). */
export function cpfValido(digitos: string): boolean {
  const d = String(digitos ?? "").replace(/\D/g, "");
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/** Algoritmo de Luhn: confirma que um número de cartão tem o dígito verificador
 *  coerente (não prova que o cartão existe, mas corta número inventado). */
export function luhnValido(digitos: string): boolean {
  const d = String(digitos ?? "").replace(/\D/g, "");
  if (d.length < 13 || d.length > 19) return false;
  if (/^(\d)\1+$/.test(d)) return false;
  let soma = 0;
  let dobro = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (dobro) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    soma += n;
    dobro = !dobro;
  }
  return soma % 10 === 0;
}

export type Sensivel = { sensivel: boolean; motivos: string[] };

/**
 * Diz se um texto contém credencial ou dado sensível que NUNCA deve virar
 * memória. É deliberadamente conservador: falso positivo aqui só custa uma
 * memória a menos; falso negativo custa um segredo vazado no prompt.
 */
export function detectarSensivel(texto: unknown): Sensivel {
  const t = String(texto ?? "");
  const motivos: string[] = [];
  if (!t.trim()) return { sensivel: false, motivos: [] };

  // 1) credenciais com formato reconhecível
  if (/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}/.test(t)) motivos.push("jwt");
  if (/\bsk-[A-Za-z0-9_-]{10,}/.test(t)) motivos.push("chave_openai");
  if (/\bsk_(live|test)_[A-Za-z0-9]{10,}/.test(t)) motivos.push("chave_stripe");
  if (/\b[rs]k_(live|test)_[A-Za-z0-9]{10,}/.test(t)) motivos.push("chave_stripe");
  if (/\bgh[pousr]_[A-Za-z0-9]{16,}/.test(t)) motivos.push("token_github");
  if (/\bgithub_pat_[A-Za-z0-9_]{20,}/.test(t)) motivos.push("token_github");
  if (/\bsbp_[A-Za-z0-9]{16,}/.test(t)) motivos.push("token_supabase");
  if (/\bsb_(secret|publishable)_[A-Za-z0-9_-]{10,}/.test(t)) motivos.push("chave_supabase");
  if (/\bAKIA[0-9A-Z]{16}\b/.test(t)) motivos.push("chave_aws");
  if (/\bAIza[0-9A-Za-z_-]{20,}/.test(t)) motivos.push("chave_google");
  if (/\bxox[baprs]-[A-Za-z0-9-]{10,}/.test(t)) motivos.push("token_slack");
  if (/\bhttps:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/.test(t)) motivos.push("webhook_slack");
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t)) motivos.push("chave_privada");
  if (/\bbearer\s+[A-Za-z0-9._-]{20,}/i.test(t)) motivos.push("bearer_token");
  if (/\b(postgres|postgresql|mysql|mongodb(\+srv)?|redis):\/\/[^\s]+:[^\s]+@/i.test(t)) motivos.push("url_com_senha");

  // 2) senha explícita ("minha senha é X", "password: X", "pwd = X")
  const senhaExplicita =
    /(?:^|[^\w])(senha|password|passwd|pwd|passphrase|credencial)\b[^.\n]{0,24}?(?::|=|é|eh|\be\b)\s*["']?([^\s"',;]{3,})/i.exec(t);
  if (senhaExplicita) motivos.push("senha");
  if (/(?:^|[^\w])pin\b\s*(?::|=|é|eh)\s*\d{4,8}\b/i.test(t)) motivos.push("pin");

  // 3) par "chave/token + valor comprido" (cobre "api key abc123..." sem prefixo)
  if (/\b(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|refresh[_-]?token|client[_-]?secret|secret[_-]?key|chave\s+de\s+api|token\s+de\s+acesso)\b\s*(?::|=|é|eh)?\s*["']?([A-Za-z0-9_\-.]{12,})/i.test(t)) {
    motivos.push("token_generico");
  }

  // 4) e-mail junto com senha na mesma frase
  if (EMAIL_RE.test(t) && /(senha|password|passwd|login|entrar com|credenciai)/i.test(t)) {
    motivos.push("email_com_senha");
  }

  // 5) CPF válido
  const cpfs = t.match(/\b\d{3}[ .-]?\d{3}[ .-]?\d{3}[ .-]?\d{2}\b/g) ?? [];
  for (const bruto of cpfs) {
    if (cpfValido(bruto)) {
      motivos.push("cpf");
      break;
    }
  }

  // 6) cartão de crédito com Luhn válido
  const numeros = t.match(/\d(?:[ -]?\d){12,18}/g) ?? [];
  for (const bruto of numeros) {
    const d = bruto.replace(/\D/g, "");
    if (luhnValido(d)) {
      motivos.push("cartao");
      break;
    }
  }

  const lista = unicos(motivos);
  return { sensivel: lista.length > 0, motivos: lista };
}

/** Troca os trechos sensíveis por pontos, para poder registrar log sem vazar. */
export function mascarar(texto: unknown): string {
  let t = String(texto ?? "");
  t = t.replace(/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}/g, "eyJ...•");
  t = t.replace(/\b(sk-|gh[pousr]_|github_pat_|sbp_|sb_secret_|AKIA|AIza|xox[baprs]-)[A-Za-z0-9_-]{6,}/g, "$1•••");
  t = t.replace(/\d(?:[ -]?\d){12,18}/g, (m) => (luhnValido(m) ? "••••" : m));
  t = t.replace(/\b\d{3}[ .-]?\d{3}[ .-]?\d{3}[ .-]?\d{2}\b/g, (m) => (cpfValido(m) ? "•••.•••.•••-••" : m));
  t = t.replace(
    /((?:senha|password|passwd|pwd|passphrase|credencial)\b[^.\n]{0,24}?(?::|=|é|eh|\be\b)\s*["']?)([^\s"',;]{3,})/gi,
    "$1•••",
  );
  t = t.replace(EMAIL_RE, "•••@•••");
  return t.slice(0, 400);
}

/* ---------------------------------------------------------- classificação */

export type Classificacao = {
  tipo: TipoMemoria;
  projeto: string | null;
  importancia: number;
  resumo: string;
};

const naoPalavraProjeto = new Set([
  "é", "e", "eh", "do", "da", "de", "no", "na", "que", "um", "uma", "o", "a", "os", "as",
  "sera", "será", "chama", "chamado", "se", "meu", "minha",
]);

/** Nome de projeto citado depois da palavra "projeto". */
function acharProjeto(t: string): string | null {
  const sujo = t.match(/\bprojeto\s*(?::|"|')?\s*([^,.;:!?\n]{2,60})/i);
  if (!sujo) return null;
  const partes = sujo[1]
    .replace(/["']/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((p) => !naoPalavraProjeto.has(p.toLowerCase()));
  if (!partes.length) return null;
  // até 3 palavras é nome de projeto; mais que isso já é a frase inteira
  const nome = partes.slice(0, 3).join(" ").replace(/[^\wÀ-ÿ .-]/g, "").trim();
  if (nome.length < 2) return null;
  return nome.slice(0, 40);
}

/** Regra de tipo, da mais específica para a mais genérica. */
function acharTipo(t: string): TipoMemoria {
  const s = ` ${normalizar(t)} `;
  if (/\b(prefiro|preferiria|preferencia|preferência|gosto mais|nao gosto|não gosto|odeio|favorit[oa])\b/.test(s)) return "preferencia";
  if (/\b(decidimos|decidi|decidido|escolhemos|escolhi|ficou definido|aprovado|vamos usar|optamos)\b/.test(s)) return "decisao";
  if (/\b(objetivo|meta|pretendo|pretensao|pretensão|quero atingir|quero chegar)\b/.test(s)) return "objetivo";
  if (/\b(configur\w*|configuraç\w*|ajust\w*|defin\w*|parametr\w*)/.test(s)) return "configuracao";
  if (/\b(sempre|nunca|a partir de agora|de agora em diante|regra|nao faca|não faça|sempre use|use sempre)\b/.test(s)) return "instrucao";
  if (/\b(projeto|repositorio|repositório|repo|app|aplicativo|sistema|produto|stack)\b/.test(s)) return "projeto";
  if (/\b(tarefa|preciso|pendente|to-?do|lembrar de|nao esquecer|não esquecer|prazo)\b/.test(s)) return "tarefa";
  return "fato";
}

/** Classifica um texto: tipo, projeto candidato, importância (1..5) e resumo. */
export function classificar(texto: unknown): Classificacao {
  const original = limpar(texto);
  const t = normalizar(original);
  const tipo = acharTipo(original);
  const projeto = acharProjeto(original) ?? acharProjeto(original.toLowerCase());

  let importancia = 3;
  if (tipo === "decisao" || tipo === "instrucao" || tipo === "configuracao" || tipo === "objetivo") importancia += 1;
  if (/\b(sempre|nunca|importante|obrigatorio|obrigatório|regra|critico|crítico)\b/.test(t)) importancia += 1;
  if (tipo === "fato" && t.length < 25) importancia -= 1;
  if (projeto) importancia += 1;
  importancia = Math.max(1, Math.min(5, importancia));

  const primeiraFrase = original.split(/(?<=[.!?])\s+/)[0] || original;
  const resumo = primeiraFrase.length > 140 ? `${primeiraFrase.slice(0, 137).trim()}...` : primeiraFrase;

  return { tipo, projeto: projeto ?? null, importancia, resumo };
}

/* ------------------------------------------------------ extração do chat */

export type Candidato = {
  conteudo: string;
  tipo: TipoMemoria;
  projeto: string | null;
  importancia: number;
  resumo: string;
  gatilho: string;
};

const GATILHOS: { chave: string; re: RegExp }[] = [
  { chave: "lembre", re: /^(?:por favor,?\s*)?(?:lembre(?:-se)?|lembra|memorize|guarde|anote|registre|nao esqueca|não esqueça|nao esquecer|não esquecer)\b(?:\s+que)?\s*/i },
  { chave: "projeto", re: /\b(?:meu|nosso|do|no|para o)\s+projeto\b/i },
  { chave: "preferencia", re: /\b(?:prefiro|preferiria|gosto mais|nao gosto|não gosto|odeio)\b/i },
  { chave: "decisao", re: /\b(?:decidimos|decidi|escolhemos|ficou definido|vamos usar|optamos)\b/i },
  { chave: "regra", re: /\b(?:sempre|nunca|a partir de agora|de agora em diante)\b/i },
  { chave: "identidade", re: /\b(?:meu nome|eu sou|eu trabalho|eu moro|moro em|trabalho (?:na|no|em)|me chamo)\b/i },
  { chave: "objetivo", re: /\b(?:meu objetivo|minha meta|pretendo|quero atingir)\b/i },
  { chave: "tarefa", re: /\b(?:preciso|tarefa|pendente|to-?do|prazo)\b/i },
];

/** Quebra em frases sem destruir "3.5" nem "Sr." (corte só em fim de frase). */
function frases(texto: string): string[] {
  return String(texto ?? "")
    .split(/\n+/)
    .flatMap((linha) => linha.split(/(?<=[.!?;])\s+(?=[A-ZÀ-Ý0-9"'])/))
    .map((f) => f.trim())
    .filter(Boolean);
}

/**
 * Extrai da mensagem do usuário as frases que valem virar memória.
 * Frases com conteúdo sensível NÃO voltam em `candidatos` — vêm em `sensiveis`,
 * só para a função registrar no log que recusou.
 */
export function extrairCandidatos(mensagemUsuario: unknown): {
  candidatos: Candidato[];
  sensiveis: { conteudo: string; motivos: string[] }[];
} {
  const candidatos: Candidato[] = [];
  const sensiveis: { conteudo: string; motivos: string[] }[] = [];
  const vistos = new Set<string>();
  const MAX = 6;

  for (const frase of frases(String(mensagemUsuario ?? "")).slice(0, 40)) {
    if (candidatos.length >= MAX) break;
    if (frase.length < 8 || frase.length > 400) continue;

    const gatilho = GATILHOS.find((g) => g.re.test(frase));
    if (!gatilho) continue;
    // pergunta não vira memória ("você lembra que eu prefiro...?")
    if (/\?\s*$/.test(frase) && gatilho.chave !== "lembre") continue;

    let conteudo = frase;
    const limpador = GATILHOS[0].re;
    if (limpador.test(conteudo)) {
      conteudo = conteudo.replace(limpador, "").trim();
      conteudo = conteudo.charAt(0).toUpperCase() + conteudo.slice(1);
    }
    conteudo = limpar(conteudo.replace(/^[,;:\s-]+/, "").replace(/[\s.;,]+$/, ""));
    if (conteudo.length < 6) continue;

    const chave = normalizar(conteudo);
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    const sens = detectarSensivel(frase);
    if (sens.sensivel) {
      sensiveis.push({ conteudo: mascarar(conteudo), motivos: sens.motivos });
      continue;
    }

    const c = classificar(conteudo);
    candidatos.push({
      conteudo: conteudo.slice(0, LIMITE_CONTEUDO),
      tipo: c.tipo,
      projeto: c.projeto,
      importancia: c.importancia,
      resumo: c.resumo,
      gatilho: gatilho.chave,
    });
  }

  return { candidatos, sensiveis };
}

/* -------------------------------------------------------------- contexto */

export type ItemContexto = {
  id?: string;
  tipo?: string;
  conteudo: string;
  projeto?: string | null;
  score?: number | null;
  importancia?: number | null;
};

const ROTULO_TIPO: Record<string, string> = {
  preferencia: "preferência",
  projeto: "projeto",
  objetivo: "objetivo",
  decisao: "decisão",
  configuracao: "configuração",
  instrucao: "instrução",
  fato: "fato",
  tarefa: "tarefa",
};

const CABECALHO = "MEMÓRIA RELEVANTE (o que você já sabe sobre este usuário; use só se ajudar):";

/**
 * Monta o bloco de memória que entra no prompt, cortando pelo orçamento de
 * tokens (~4 caracteres por token) e mantendo a ordem de relevância.
 * Devolve "" quando nada cabe — nunca estoura o orçamento.
 */
export function montarContexto(itens: ItemContexto[] = [], orcamentoTokens = 600): string {
  const orcamento = Number.isFinite(orcamentoTokens) ? Math.max(0, Math.floor(orcamentoTokens)) : 600;
  if (!itens.length || orcamento <= estimarTokens(CABECALHO)) return "";

  const ordenados = [...itens]
    .filter((i) => i && typeof i.conteudo === "string" && i.conteudo.trim())
    .sort((a, b) => {
      const sa = Number.isFinite(a.score as number) ? Number(a.score) : (Number(a.importancia ?? 3) / 5);
      const sb = Number.isFinite(b.score as number) ? Number(b.score) : (Number(b.importancia ?? 3) / 5);
      if (sb !== sa) return sb - sa;
      return 0;
    })
    .slice(0, 20);

  const linhas: string[] = [];
  for (const item of ordenados) {
    const rotulo = ROTULO_TIPO[String(item.tipo ?? "fato")] ?? "fato";
    const projeto = item.projeto ? ` [${String(item.projeto).slice(0, 32)}]` : "";
    const texto = limpar(item.conteudo, 220).replace(/\n+/g, " ");
    const linha = `- ${rotulo}${projeto}: ${texto}`;
    const tentativa = [CABECALHO, ...linhas, linha].join("\n");
    if (estimarTokens(tentativa) > orcamento) break;
    linhas.push(linha);
  }

  if (!linhas.length) return "";
  return [CABECALHO, ...linhas].join("\n");
}

/* ------------------------------------------------------------ deduplicação */

export type EntradaDedupe = {
  id?: string;
  conteudo: string;
  tipo?: string | null;
  projeto?: string | null;
  hash_conteudo?: string | null;
};

export type ResultadoDedupe = {
  acao: "criar" | "atualizar";
  motivo: "hash" | "jaccard" | "substituicao" | null;
  similaridade: number;
  alvo: EntradaDedupe | null;
  substitui: string | null;
};

const MARCAS_MUDANCA = /\b(agora|na verdade|mudou|mudei|troquei|em vez de|a partir de agora|de agora em diante|nao mais|não mais|corrigindo|atualizando|revogando|em vez)\b/i;

/**
 * Decide se o item novo é o MESMO que um existente (atualiza), se SUBSTITUI um
 * antigo do mesmo tipo/projeto (cria novo apontando `substitui`) ou se é novo.
 * Critérios: hash igual, Jaccard >= 0.85, ou marca explícita de mudança.
 */
export function deduplicar(
  novo: EntradaDedupe,
  existentes: EntradaDedupe[] = [],
): ResultadoDedupe {
  const lista = (existentes ?? []).filter((e) => e && typeof e.conteudo === "string");
  const conteudoNovo = limpar(novo?.conteudo);

  // 1) mesmo conteúdo (hash estável do texto normalizado)
  for (const e of lista) {
    const mesmoHash = novo?.hash_conteudo && e.hash_conteudo && novo.hash_conteudo === e.hash_conteudo;
    if (mesmoHash || normalizar(e.conteudo) === normalizar(conteudoNovo)) {
      return { acao: "atualizar", motivo: "hash", similaridade: 1, alvo: e, substitui: null };
    }
  }

  // 2) quase igual palavra por palavra
  let melhor: EntradaDedupe | null = null;
  let melhorSim = 0;
  for (const e of lista) {
    const sim = jaccard(e.conteudo, conteudoNovo);
    if (sim > melhorSim) {
      melhorSim = sim;
      melhor = e;
    }
  }
  if (melhor && melhorSim >= 0.85) {
    return { acao: "atualizar", motivo: "jaccard", similaridade: melhorSim, alvo: melhor, substitui: null };
  }

  // 3) mesma categoria: o novo pode revogar o antigo
  const tipoNovo = String(novo?.tipo ?? "").trim() || null;
  const projetoNovo = (novo?.projeto ?? null) || null;
  if (tipoNovo && TIPOS_SUBSTITUIVEIS.includes(tipoNovo as TipoMemoria)) {
    const mesmaCaixa = lista.filter(
      (e) =>
        String(e.tipo ?? "") === tipoNovo &&
        ((e.projeto ?? null) || null) === projetoNovo &&
        (e.id ?? "") !== (novo?.id ?? "—"),
    );
    let alvo: EntradaDedupe | null = null;
    let alvoSim = 0;
    for (const e of mesmaCaixa) {
      const sim = jaccard(e.conteudo, conteudoNovo);
      if (sim > alvoSim) {
        alvoSim = sim;
        alvo = e;
      }
    }
    const mudanca = MARCAS_MUDANCA.test(conteudoNovo);
    if (alvo && (mudanca || alvoSim >= 0.5)) {
      return {
        acao: "criar",
        motivo: alvo.id ? "substituicao" : null,
        similaridade: alvoSim,
        alvo,
        substitui: alvo.id ?? null,
      };
    }
  }

  return { acao: "criar", motivo: null, similaridade: melhorSim, alvo: melhor, substitui: null };
}

/* ---------------------------------------------------------------- resumo */

export type MensagemResumo = { role?: string; content?: string; conteudo?: string };

/** Tópicos mais frequentes (para a coluna text[] de memoria_resumos). */
export function extrairTopicos(texto: unknown, limite = 6): string[] {
  const contagem = new Map<string, number>();
  const ordem: string[] = [];
  for (const p of palavras(texto)) {
    if (p.length < 4) continue;
    if (!contagem.has(p)) ordem.push(p);
    contagem.set(p, (contagem.get(p) ?? 0) + 1);
  }
  return ordem
    .map((p, i) => ({ p, n: contagem.get(p) ?? 0, i }))
    .sort((a, b) => (b.n - a.n) || (a.i - b.i))
    .slice(0, Math.max(0, limite))
    .map((x) => x.p);
}

/**
 * Resumo extrativo da conversa, sem LLM (fallback honesto quando não há chave).
 * Pega a abertura, as frases com sinal de memória (preferência, decisão, projeto,
 * regra) e o último pedido; corta em `limiteChars`.
 */
export function resumirConversa(mensagens: MensagemResumo[] = [], limiteChars = 1200): string {
  const limite = Math.max(120, Number(limiteChars) || 1200);
  const msgs = (mensagens ?? [])
    .map((m) => ({
      role: String(m?.role ?? "user"),
      texto: limpar(m?.content ?? m?.conteudo ?? "", 2000),
    }))
    .filter((m) => m.texto.length > 0);
  if (!msgs.length) return "";

  const doUsuario = msgs.filter((m) => m.role !== "assistant" && m.role !== "system");
  const base = doUsuario.length ? doUsuario : msgs;
  const corta = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);

  const linhas: string[] = [];
  linhas.push(`Abertura: ${corta(base[0].texto.replace(/\n+/g, " "), 200)}`);

  const sinais: string[] = [];
  for (const m of base.slice(0, 40)) {
    for (const frase of frases(m.texto)) {
      if (frase.length < 15) continue;
      if (!GATILHOS.some((g) => g.re.test(frase))) continue;
      const limpa = corta(frase.replace(/\s+/g, " "), 180);
      if (!sinais.some((s) => jaccard(s, limpa) >= 0.8)) sinais.push(limpa);
      if (sinais.length >= 4) break;
    }
    if (sinais.length >= 4) break;
  }
  if (sinais.length) linhas.push(`Pontos: ${sinais.map((s) => `• ${s}`).join(" ")}`);

  if (base.length > 1) {
    const ultimo = base[base.length - 1].texto.replace(/\n+/g, " ");
    linhas.push(`Último pedido: ${corta(ultimo, 200)}`);
  }
  linhas.push(`(${msgs.length} mensagens)`);

  let saida = "";
  for (const linha of linhas) {
    const tentativa = saida ? `${saida}\n${linha}` : linha;
    if (tentativa.length > limite) {
      if (!saida) saida = corta(linha, limite);
      break;
    }
    saida = tentativa;
  }
  return saida;
}
