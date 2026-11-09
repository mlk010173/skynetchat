import { describe, expect, it } from "vitest";
import {
  tracoVazio,
  aplicarEvento,
  encerrarTraco,
  codigoNoDelta,
  linksNoTexto,
  duracao,
  resumoTraco,
  listaTraco,
  EVENTOS_OPENAI,
} from "./traco.js";

const sequencia = () => {
  let t = tracoVazio();
  t = aplicarEvento(t, { tipo: "abrir", chave: "pensando", texto: "o usuário quer saber do mercado" });
  t = aplicarEvento(t, { tipo: "abrir", chave: "pesquisando", detalhe: "4 frentes em paralelo" });
  t = aplicarEvento(t, { tipo: "item", chave: "fontes", item: { titulo: "Fonte A", url: "https://a.com", dominio: "a.com" } });
  t = aplicarEvento(t, { tipo: "item", chave: "fontes", item: { titulo: "Fonte B", url: "https://b.com", dominio: "b.com" } });
  t = aplicarEvento(t, { tipo: "abrir", chave: "analisando", detalhe: "comparando os dois trechos" });
  t = aplicarEvento(t, { tipo: "texto", chave: "gerando", texto: "A resposta começa" });
  t = aplicarEvento(t, { tipo: "item", chave: "arquivos", item: { titulo: "relatorio.pdf" } });
  return encerrarTraco(t);
};

describe("traco", () => {
  it("mantém a ordem dos grupos sem repetir", () => {
    const t = sequencia();
    expect(t.ordem).toEqual(["pensando", "pesquisando", "fontes", "analisando", "gerando", "arquivos"]);
    expect(listaTraco(t)).toHaveLength(6);
  });

  it("conta fontes, caracteres e arquivos no resumo", () => {
    const t = sequencia();
    expect(t.resumo.fontes).toBe(2);
    expect(t.resumo.arquivos).toBe(1);
    expect(t.resumo.caracteres).toBe("A resposta começa".length);
  });

  it("só deixa um grupo ativo por vez e encerra todos no fim", () => {
    let t = aplicarEvento(tracoVazio(), { tipo: "abrir", chave: "pensando" });
    t = aplicarEvento(t, { tipo: "abrir", chave: "pesquisando" });
    expect(t.grupos.pensando.estado).toBe("concluido");
    expect(t.grupos.pesquisando.estado).toBe("ativo");
    const f = encerrarTraco(t);
    expect(Object.values(f.grupos).every((g) => g.estado === "concluido")).toBe(true);
    expect(f.fim).toBeTruthy();
  });

  it("não duplica a mesma fonte", () => {
    let t = aplicarEvento(tracoVazio(), { tipo: "abrir", chave: "fontes" });
    t = aplicarEvento(t, { tipo: "item", chave: "fontes", item: { titulo: "A", url: "https://a.com" } });
    t = aplicarEvento(t, { tipo: "item", chave: "fontes", item: { titulo: "A2", url: "https://a.com" } });
    expect(t.grupos.fontes.itens).toHaveLength(1);
    expect(t.resumo.fontes).toBe(1);
  });

  it("liga os eventos canônicos da Responses API aos grupos", () => {
    expect(EVENTOS_OPENAI["response.reasoning_summary_text.delta"]).toBe("pensando");
    expect(EVENTOS_OPENAI["response.web_search_call.searching"]).toBe("pesquisando");
    expect(EVENTOS_OPENAI["response.code_interpreter_call.code_delta"]).toBe("codigo");
    let t = tracoVazio();
    t = aplicarEvento(t, { tipo: "response.web_search_call.searching" });
    expect(t.ordem).toContain("pesquisando");
  });

  it("abre o grupo de código quando aparece cerca de código", () => {
    const t = codigoNoDelta(tracoVazio(), "aqui vai:\n```js\nconsole.log(1)\n```");
    expect(t.grupos.codigo).toBeTruthy();
  });

  it("extrai links do texto para as referências", () => {
    const t = linksNoTexto(tracoVazio(), "veja https://exemplo.com/a e https://exemplo.com/b");
    expect(t.grupos.links.itens).toHaveLength(2);
    expect(t.resumo.links).toBe(2);
  });

  it("resume o cabeçalho com fontes e tempo", () => {
    const t = sequencia();
    const r = resumoTraco(t);
    expect(r).toContain("fontes");
    expect(t.fim - t.inicio).toBeGreaterThanOrEqual(0);
    expect(duracao(t)).toBeGreaterThanOrEqual(0);
  });
});
