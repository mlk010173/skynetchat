import { describe, expect, it } from "vitest";
import { extrairPalavrasChave, linhaDoTempo, checarAtualidade, balancoFontes, estimarLeitura, gerarPerguntas, compararTextos, paraCsv } from "./habilidades.js";

const itens = [
  { titulo: "Baterias de sódio avançam na China em 2025-03-14", url: "https://www.gov.br/a", domain: "gov.br", excerto: "A produção de baterias de sódio cresceu 40% em 2025 segundo o ministério. " .repeat(4), quando: Date.now() - 2 * 86400000 },
  { titulo: "Custo das baterias de sódio cai, diz estudo", url: "https://arxiv.org/b", domain: "arxiv.org", excerto: "O custo por kWh de baterias de sódio caiu 30% no último ano. " .repeat(4), quando: Date.now() - 300 * 86400000 },
  { titulo: "Análise: baterias de sódio e lítio", url: "https://g1.globo.com/c", domain: "g1.globo.com", resumo: "comparação entre baterias de sódio e lítio em 12 de março de 2025" },
  { titulo: "Repositório de células de sódio", url: "https://github.com/d", domain: "github.com", resumo: "" },
];

describe("extrairPalavrasChave", () => {
  it("coloca baterias no topo e respeita o limite", () => {
    const chaves = extrairPalavrasChave(itens, 4);
    const dois = chaves.slice(0, 2).map((c) => c.chave);
    expect(dois).toContain("baterias");
    expect(dois).toContain("sodio");
    expect(chaves[0].termo).toBe(chaves[0].termo.toLowerCase());
    expect(chaves.length).toBeLessThanOrEqual(4);
    expect(chaves.every((c) => c.termo.length > 3)).toBe(true);
  });
});

describe("linhaDoTempo", () => {
  it("lê datas ISO e por extenso e ordena do mais novo", () => {
    const t = linhaDoTempo(itens);
    expect(t.length).toBeGreaterThanOrEqual(2);
    const primeira = t[0].quando.getTime();
    const ultima = t[t.length - 1].quando.getTime();
    expect(primeira).toBeGreaterThanOrEqual(ultima);
    expect(t.map((p) => p.rotulo).join(" ")).toContain("2025");
  });
});

describe("checarAtualidade", () => {
  it("conta recentes e antigas e dá frescor entre 0 e 100", () => {
    const a = checarAtualidade(itens);
    expect(a.recentes).toBe(1);
    expect(a.antigas).toBe(1);
    expect(a.frescor).toBeGreaterThanOrEqual(0);
    expect(a.frescor).toBeLessThanOrEqual(100);
    expect(checarAtualidade([])).toBeNull();
  });
});

describe("balancoFontes", () => {
  it("separa oficial, acadêmico, imprensa e técnico", () => {
    const b = balancoFontes(itens);
    const porChave = Object.fromEntries(b.map((x) => [x.chave, x.n]));
    expect(porChave).toEqual({ oficial: 1, academico: 1, imprensa: 1, tecnico: 1 });
    expect(b.reduce((s, x) => s + x.fatia, 0)).toBe(100);
  });
});

describe("estimarLeitura", () => {
  it("dá pelo menos 1 minuto e uma estimativa por fonte", () => {
    const e = estimarLeitura(itens);
    expect(e.minutos).toBeGreaterThanOrEqual(1);
    expect(e.porFonte.length).toBe(itens.length);
    expect(e.porFonte.every((m) => m >= 1)).toBe(true);
  });
});

describe("gerarPerguntas", () => {
  it("usa o tema mais forte e devolve 5 perguntas distintas", () => {
    const p = gerarPerguntas(itens);
    expect(p.length).toBe(5);
    expect(new Set(p).size).toBe(5);
    expect(p[0]).toMatch(/baterias|sódio/);
    expect(p.join(" ")).toContain("baterias");
  });
});

describe("compararTextos", () => {
  it("acha palavras exclusivas e calcula semelhança", () => {
    const d = compararTextos("baterias de sódio crescem rápido", "baterias de lítio caem devagar");
    expect(d.soA).toContain("sódio");
    expect(d.soB).toContain("lítio");
    expect(d.semelhanca).toBeGreaterThan(0);
    expect(d.semelhanca).toBeLessThan(100);
  });
});

describe("paraCsv", () => {
  it("escapa aspas e separa por ponto e vírgula", () => {
    const csv = paraCsv([{ titulo: 'diz "oi"', url: "https://x.y", domain: "x.y" }]);
    const linhas = csv.split("\n");
    expect(linhas[0]).toContain("titulo");
    expect(linhas[1]).toContain('""oi""');
    expect(linhas[1].split(";").length).toBe(6);
  });
});
