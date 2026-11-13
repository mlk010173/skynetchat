// SKYNET · orçamento de contexto, deduplicação e idempotência (núcleo puro, sem rede).
// Usado pelo chat para parar de reenviar o histórico inteiro a cada mensagem e para
// impedir que o mesmo pedido seja processado (e cobrado) duas vezes.

export interface Msg {
  role: string;
  content: string;
}

/** Estimativa barata de tokens (~4 caracteres por token em português, mínimo 1). */
export const estimarTokens = (texto: string): number => Math.max(1, Math.ceil(String(texto ?? "").length / 4));

const normaliza = (t: string) => String(t ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Remove mensagens consecutivas idênticas do mesmo papel (retry e duplo envio deixam
 * a mesma fala gravada duas vezes) sem mexer em respostas legitimamente repetidas
 * em pontos diferentes da conversa.
 */
export function deduplicarSequencia(msgs: Msg[]): Msg[] {
  const saida: Msg[] = [];
  for (const m of msgs) {
    const anterior = saida[saida.length - 1];
    if (anterior && anterior.role === m.role && normaliza(anterior.content) === normaliza(m.content)) continue;
    saida.push(m);
  }
  return saida;
}

export interface ResultadoOrcamento {
  mensagens: Msg[];
  /** quantas mensagens antigas ficaram de fora */
  omitidas: number;
  /** resumo extrativo do que ficou de fora (vazio se nada foi omitido) */
  resumoOmitido: string;
  tokensEstimados: number;
}

/** Resumo extrativo, sem LLM: primeira frase de cada fala antiga, truncada. */
export function resumoExtrativo(msgs: Msg[], limiteChars = 700): string {
  const linhas: string[] = [];
  let usados = 0;
  for (const m of msgs) {
    const texto = String(m.content ?? "").replace(/\s+/g, " ").trim();
    if (!texto) continue;
    const primeira = (texto.match(/^.{12,}?[.!?](?=\s|$)/)?.[0] ?? texto).slice(0, 140);
    const linha = `${m.role === "user" ? "Usuário" : "SKYNET"}: ${primeira}`;
    if (usados + linha.length > limiteChars) break;
    linhas.push(linha);
    usados += linha.length + 1;
  }
  return linhas.join("\n");
}

/**
 * Seleciona o histórico que cabe no orçamento. Mantém SEMPRE as mensagens mais recentes
 * (a continuidade imediata não pode ser sacrificada) e troca o resto por um resumo curto.
 * `msgs` vem em ordem cronológica. `reservaTokens` é o espaço do system prompt + pedido.
 */
export function aplicarOrcamento(
  msgs: Msg[],
  { orcamentoTokens = 6000, reservaTokens = 1800, minimoRecentes = 6 }: {
    orcamentoTokens?: number;
    reservaTokens?: number;
    minimoRecentes?: number;
  } = {},
): ResultadoOrcamento {
  const limpas = deduplicarSequencia(msgs);
  const disponivel = Math.max(400, orcamentoTokens - reservaTokens);

  const escolhidas: Msg[] = [];
  let usados = 0;
  for (let i = limpas.length - 1; i >= 0; i--) {
    const custo = estimarTokens(limpas[i].content) + 4; // + overhead de papel
    const dentroDosRecentes = limpas.length - i <= minimoRecentes;
    if (usados + custo > disponivel && !dentroDosRecentes) break;
    escolhidas.unshift(limpas[i]);
    usados += custo;
  }

  const omitidasLista = limpas.slice(0, limpas.length - escolhidas.length);
  const resumoOmitido = omitidasLista.length ? resumoExtrativo(omitidasLista) : "";
  return {
    mensagens: escolhidas,
    omitidas: omitidasLista.length,
    resumoOmitido,
    tokensEstimados: usados + (resumoOmitido ? estimarTokens(resumoOmitido) : 0),
  };
}

// ----------------------------------------------------------------- idempotência
/** Chave de idempotência aceita do cliente: curta e segura para usar em índice. */
export function chaveValida(chave: unknown): chave is string {
  return typeof chave === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(chave);
}

interface Entrada {
  expiraEm: number;
  estado: "em_andamento" | "concluido";
}

/**
 * Registro em memória do isolate (barato, protege contra duplo clique e retry imediato
 * dentro da mesma instância). Para garantia entre instâncias use a tabela
 * `chat_execucoes` (migration 20261115010000) via `reservarNoBanco`.
 */
export class RegistroIdempotencia {
  private mapa = new Map<string, Entrada>();
  constructor(private ttlMs = 120_000, private maximo = 500) {}

  private limpar(agora: number) {
    if (this.mapa.size < this.maximo) return;
    for (const [k, v] of this.mapa) if (v.expiraEm <= agora) this.mapa.delete(k);
    while (this.mapa.size >= this.maximo) {
      const primeira = this.mapa.keys().next().value;
      if (primeira === undefined) break;
      this.mapa.delete(primeira);
    }
  }

  /** true se a execução pode começar; false se a mesma chave já está viva (duplicada). */
  reservar(chave: string, agora = Date.now()): boolean {
    this.limpar(agora);
    const atual = this.mapa.get(chave);
    if (atual && atual.expiraEm > agora) return false;
    this.mapa.set(chave, { expiraEm: agora + this.ttlMs, estado: "em_andamento" });
    return true;
  }

  concluir(chave: string, agora = Date.now()) {
    const atual = this.mapa.get(chave);
    if (atual) this.mapa.set(chave, { estado: "concluido", expiraEm: agora + this.ttlMs });
  }

  /** libera para novo envio (usado quando a execução falhou sem produzir resposta) */
  liberar(chave: string) {
    this.mapa.delete(chave);
  }

  estado(chave: string, agora = Date.now()): "livre" | "em_andamento" | "concluido" {
    const atual = this.mapa.get(chave);
    if (!atual || atual.expiraEm <= agora) return "livre";
    return atual.estado;
  }
}

// ----------------------------------------------------------------- métricas de consumo
export interface UsoMensagem {
  execucaoId: string;
  modelo: string;
  tokensEntradaEstimados: number;
  tokensSaidaEstimados: number;
  mensagensNoContexto: number;
  mensagensOmitidas: number;
  tentativas: number;
  duracaoMs: number;
}

export function montarUso(p: {
  execucaoId: string;
  modelo: string;
  sistema: string;
  historico: Msg[];
  pedido: string;
  resposta: string;
  omitidas: number;
  tentativas: number;
  inicio: number;
  agora?: number;
}): UsoMensagem {
  const entrada = estimarTokens(p.sistema) + p.historico.reduce((s, m) => s + estimarTokens(m.content) + 4, 0) + estimarTokens(p.pedido);
  return {
    execucaoId: p.execucaoId,
    modelo: p.modelo,
    tokensEntradaEstimados: entrada,
    tokensSaidaEstimados: estimarTokens(p.resposta),
    mensagensNoContexto: p.historico.length,
    mensagensOmitidas: p.omitidas,
    tentativas: p.tentativas,
    duracaoMs: Math.max(0, (p.agora ?? Date.now()) - p.inicio),
  };
}

// ----------------------------------------------------------------- dedupe de eventos SSE
/**
 * Descarta eventos repetidos de um stream (mesma chave de evento chegando duas vezes,
 * típico de retry/reconexão). Para deltas de texto, a chave deve incluir o índice
 * sequencial do servidor; sem índice, não deduplica (não dá para saber com segurança).
 */
export function criarFiltroEventos(janela = 256) {
  const vistos = new Set<string>();
  const ordem: string[] = [];
  return (chave: string | null | undefined): boolean => {
    if (!chave) return true;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    ordem.push(chave);
    if (ordem.length > janela) vistos.delete(ordem.shift()!);
    return true;
  };
}
