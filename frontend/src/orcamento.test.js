import { describe, expect, it } from "vitest";
import {
  aplicarOrcamento,
  chaveValida,
  criarFiltroEventos,
  deduplicarSequencia,
  estimarTokens,
  montarUso,
  RegistroIdempotencia,
  resumoExtrativo,
} from "../../supabase/functions/_shared/orcamento.ts";

const fala = (i, tam = 600) => ({
  role: i % 2 ? "assistant" : "user",
  content: `Mensagem ${i}. ` + "palavra ".repeat(Math.floor(tam / 8)),
});
const conversa = (n, tam) => Array.from({ length: n }, (_, i) => fala(i, tam));

describe("orçamento de contexto", () => {
  it("reduz de verdade o consumo de uma conversa longa e mede a economia", () => {
    const historico = conversa(30, 1200); // o que o chat enviava antes: 30 mensagens inteiras
    const antes = historico.reduce((s, m) => s + estimarTokens(m.content) + 4, 0);
    const r = aplicarOrcamento(historico, { orcamentoTokens: 4000, reservaTokens: 1000 });
    expect(r.tokensEstimados).toBeLessThan(antes * 0.5);
    expect(r.omitidas).toBeGreaterThan(0);
    expect(r.resumoOmitido.length).toBeGreaterThan(0);
  });

  it("nunca sacrifica as mensagens mais recentes", () => {
    const historico = conversa(30, 3000);
    const r = aplicarOrcamento(historico, { orcamentoTokens: 1500, reservaTokens: 1000, minimoRecentes: 6 });
    expect(r.mensagens.slice(-6)).toEqual(historico.slice(-6));
    expect(r.mensagens[r.mensagens.length - 1]).toEqual(historico[historico.length - 1]);
  });

  it("não corta nada quando a conversa cabe no orçamento", () => {
    const historico = conversa(6, 200);
    const r = aplicarOrcamento(historico, { orcamentoTokens: 6000 });
    expect(r.omitidas).toBe(0);
    expect(r.resumoOmitido).toBe("");
    expect(r.mensagens).toHaveLength(6);
  });

  it("mantém a ordem cronológica", () => {
    const r = aplicarOrcamento(conversa(20, 900), { orcamentoTokens: 3000, reservaTokens: 800 });
    const indices = r.mensagens.map((m) => Number(m.content.match(/Mensagem (\d+)/)[1]));
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
  });
});

describe("deduplicação", () => {
  it("remove fala repetida em sequência do mesmo papel (retry gravou duas vezes)", () => {
    const base = [
      { role: "user", content: "Quero o relatório" },
      { role: "user", content: "  quero   o RELATÓRIO " },
      { role: "assistant", content: "Segue." },
    ];
    expect(deduplicarSequencia(base)).toHaveLength(2);
  });

  it("preserva repetição legítima em pontos diferentes da conversa", () => {
    const base = [
      { role: "user", content: "ok" },
      { role: "assistant", content: "certo" },
      { role: "user", content: "ok" },
    ];
    expect(deduplicarSequencia(base)).toHaveLength(3);
  });

  it("resumo extrativo respeita o limite", () => {
    const r = resumoExtrativo(conversa(40, 800), 300);
    expect(r.length).toBeLessThanOrEqual(300);
  });
});

describe("idempotência", () => {
  it("bloqueia o segundo envio da mesma chave e libera depois do TTL", () => {
    const reg = new RegistroIdempotencia(1000);
    expect(reg.reservar("abc12345", 0)).toBe(true);
    expect(reg.reservar("abc12345", 500)).toBe(false); // duplo clique
    expect(reg.estado("abc12345", 500)).toBe("em_andamento");
    expect(reg.reservar("abc12345", 1500)).toBe(true); // expirou
  });

  it("liberar permite reenviar depois de uma falha sem resposta", () => {
    const reg = new RegistroIdempotencia();
    reg.reservar("falhou-001", 0);
    reg.liberar("falhou-001");
    expect(reg.reservar("falhou-001", 10)).toBe(true);
  });

  it("chaves diferentes não se bloqueiam", () => {
    const reg = new RegistroIdempotencia();
    expect(reg.reservar("chave-aaaa", 0)).toBe(true);
    expect(reg.reservar("chave-bbbb", 0)).toBe(true);
  });

  it("não cresce sem limite", () => {
    const reg = new RegistroIdempotencia(60_000, 50);
    for (let i = 0; i < 400; i++) reg.reservar(`chave-${String(i).padStart(6, "0")}`, i);
    expect(reg["mapa"].size).toBeLessThanOrEqual(50);
  });

  it("valida o formato da chave", () => {
    expect(chaveValida("a1b2c3d4-e5")).toBe(true);
    expect(chaveValida("curta")).toBe(false);
    expect(chaveValida("tem espaço e ; injeção")).toBe(false);
    expect(chaveValida(undefined)).toBe(false);
  });
});

describe("dedupe de eventos de stream", () => {
  it("descarta o mesmo evento chegando duas vezes e aceita os novos", () => {
    const aceita = criarFiltroEventos();
    expect(aceita("r1:0")).toBe(true);
    expect(aceita("r1:1")).toBe(true);
    expect(aceita("r1:1")).toBe(false);
    expect(aceita("r1:2")).toBe(true);
  });

  it("sem chave não deduplica (não dá para saber com segurança)", () => {
    const aceita = criarFiltroEventos();
    expect(aceita(null)).toBe(true);
    expect(aceita(null)).toBe(true);
  });
});

describe("métricas de consumo", () => {
  it("calcula entrada, saída e duração por mensagem", () => {
    const uso = montarUso({
      execucaoId: "run-1",
      modelo: "gpt-4o-mini",
      sistema: "x".repeat(400),
      historico: [{ role: "user", content: "y".repeat(400) }],
      pedido: "z".repeat(40),
      resposta: "w".repeat(200),
      omitidas: 3,
      tentativas: 2,
      inicio: 1000,
      agora: 3500,
    });
    expect(uso.tokensEntradaEstimados).toBe(100 + 104 + 10);
    expect(uso.tokensSaidaEstimados).toBe(50);
    expect(uso.duracaoMs).toBe(2500);
    expect(uso.mensagensOmitidas).toBe(3);
  });
});
