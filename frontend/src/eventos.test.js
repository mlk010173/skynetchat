import { describe, expect, it } from "vitest";
import { criarGerenciador, estadoInicial, linhaDoTempo, resumoSeguro, comCitacoes, EVENTOS } from "./eventos.js";

const ger = () => criarGerenciador();

describe("gerenciador de eventos da Responses API", () => {
  it("conhece os eventos canônicos exigidos", () => {
    for (const nome of [
      "response.created", "response.in_progress", "response.output_item.added",
      "response.content_part.added", "response.output_text.delta", "response.output_text.done",
      "response.reasoning_summary_text.delta", "response.reasoning_summary_text.done",
      "response.function_call_arguments.delta", "response.output_item.done",
      "response.completed", "response.failed", "response.incomplete", "error",
    ]) {
      expect(EVENTOS[nome], nome).toBeTruthy();
    }
  });

  it("acumula texto progressivo sem tocar no resumo de raciocínio", () => {
    const g = ger();
    g.aplicar({ type: "response.created", response: { id: "resp_1", model: "gpt-5" } });
    g.aplicar({ type: "response.reasoning_summary_text.delta", delta: "verificando o pedido" });
    g.aplicar({ type: "response.output_text.delta", delta: "Olá" });
    g.aplicar({ type: "response.output_text.delta", delta: ", mundo" });
    const e = g.ler();
    expect(e.texto).toBe("Olá, mundo");
    expect(e.resumoRaciocinio).toBe("verificando o pedido");
    expect(e.id ?? e.respostaId).toBe("resp_1");
    expect(e.modelo).toBe("gpt-5");
  });

  it("só registra etapas que realmente aconteceram", () => {
    const g = ger();
    g.aplicar({ type: "response.created" });
    g.aplicar({ type: "response.output_text.delta", delta: "oi" });
    const chaves = g.ler().atividades.map((a) => a.chave);
    expect(chaves).toContain("preparando");
    expect(chaves).not.toContain("pesquisando");
    expect(chaves).not.toContain("codigo");
  });

  it("registra pesquisa, fontes numeradas e itens por atividade", () => {
    const g = ger();
    g.aplicar({ type: "response.web_search_call.searching" });
    g.aplicar({
      type: "response.output_item.done",
      item: { type: "web_search_call", action: { sources: [{ url: "https://g1.globo.com/a", title: "G1" }] } },
    });
    g.aplicar({
      type: "response.output_item.done",
      item: { type: "web_search_call", action: { sources: [{ url: "https://g1.globo.com/a", title: "G1" }, { url: "https://www.bbc.com/b", title: "BBC" }] } },
    });
    const e = g.ler();
    expect(e.fontes).toHaveLength(2);
    expect(e.fontes[0]).toMatchObject({ indice: 1, dominio: "g1.globo.com", titulo: "G1" });
    expect(e.fontes[1]).toMatchObject({ indice: 2, dominio: "bbc.com" });
    const pesquisa = e.atividades.find((a) => a.chave === "pesquisando");
    expect(pesquisa.estado).toBe("concluido");
  });

  it("fecha atividades e marca conclusão", () => {
    const g = ger();
    g.aplicar({ type: "response.created" });
    g.aplicar({ type: "response.code_interpreter_call.interpreting" });
    g.aplicar({ type: "response.output_text.delta", delta: "pronto" });
    g.aplicar({ type: "response.completed", response: { output: [] } });
    const e = g.ler();
    expect(e.fase).toBe("concluido");
    expect(e.terminadoEm).toBeTruthy();
    expect(e.atividades.every((a) => a.estado === "concluido")).toBe(true);
  });

  it("preserva o texto já recebido quando falha ou fica incompleta", () => {
    const g = ger();
    g.aplicar({ type: "response.created" });
    g.aplicar({ type: "response.output_text.delta", delta: "metade da resposta" });
    g.aplicar({ type: "error", message: "conexão caiu" });
    expect(g.ler().texto).toBe("metade da resposta");
    expect(g.ler().fase).toBe("erro");
    expect(g.ler().erro).toBe("conexão caiu");

    const g2 = ger();
    g2.aplicar({ type: "response.output_text.delta", delta: "parcial" });
    g2.aplicar({ type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" } } });
    expect(g2.ler().texto).toBe("parcial");
    expect(g2.ler().fase).toBe("incompleto");
  });

  it("resumo seguro não expõe raciocínio interno", () => {
    const g = ger();
    g.aplicar({ type: "response.reasoning_summary_text.delta", delta: "pensamento privado detalhado" });
    g.aplicar({ type: "response.web_search_call.searching" });
    g.aplicar({ type: "response.output_item.done", item: { type: "web_search_call", action: { sources: [{ url: "https://exemplo.com/x", title: "Exemplo" }] } } });
    const r = resumoSeguro(g.ler());
    expect(r).toContain("pesquisou na web (1 fonte)");
    expect(r).not.toContain("pensamento privado");
  });

  it("linha do tempo calcula segundos e conserva estado", () => {
    const g = ger();
    g.aplicar({ type: "response.created" });
    g.aplicar({ type: "response.completed" });
    const linha = linhaDoTempo(g.ler());
    expect(linha[0]).toHaveProperty("segundos");
    expect(linha[0].estado).toBe("concluido");
  });

  it("estado inicial é vazio e não inventa dados", () => {
    const e = estadoInicial();
    expect(e.texto).toBe("");
    expect(e.fontes).toHaveLength(0);
    expect(e.atividades).toHaveLength(0);
  });

  it("prepara citações numéricas como links", () => {
    expect(comCitacoes("segundo o G1 [1] e a BBC [2]")).toBe("segundo o G1 [[1]](cite:1) e a BBC [[2]](cite:2)");
    expect(comCitacoes("[texto](https://x.com)")).toBe("[texto](https://x.com)");
  });
});

describe("sequência completa de uma resposta com pesquisa", () => {
  it("reconstrói texto, etapas e fontes na ordem real dos eventos", () => {
    const g = criarGerenciador();
    const eventos = [
      { type: "response.created", response: { id: "resp_9", model: "gpt-5", status: "in_progress" } },
      { type: "response.in_progress", response: { status: "in_progress" } },
      { type: "response.reasoning_summary_text.delta", delta: "o pedido pede notícias" },
      { type: "response.reasoning_summary_text.done", text: "o pedido pede notícias" },
      { type: "response.output_item.added", item: { type: "web_search_call" } },
      { type: "response.web_search_call.searching" },
      { type: "response.web_search_call.completed" },
      { type: "response.output_item.done", item: { type: "web_search_call", action: { sources: [
        { url: "https://www.gov.br/noticia", title: "Gov" },
        { url: "https://g1.globo.com/x", title: "G1" },
      ] } } },
      { type: "response.output_item.added", item: { type: "code_interpreter_call" } },
      { type: "response.code_interpreter_call.interpreting" },
      { type: "response.output_item.done", item: { type: "code_interpreter_call" } },
      { type: "response.output_item.added", item: { type: "message" } },
      { type: "response.content_part.added", part: { type: "output_text" } },
      { type: "response.output_text.delta", delta: "Segundo o governo [1]" },
      { type: "response.output_text.delta", delta: " e o G1 [2], a alta foi de 3%." },
      { type: "response.output_text.done", text: "Segundo o governo [1] e o G1 [2], a alta foi de 3%." },
      { type: "response.output_item.done", item: { type: "message" } },
      { type: "response.completed", response: { id: "resp_9", status: "completed", output: [] } },
    ];
    for (const ev of eventos) g.aplicar(ev);
    const e = g.ler();

    expect(e.fase).toBe("concluido");
    expect(e.texto).toContain("a alta foi de 3%");
    expect(e.fontes.map((f) => f.dominio)).toEqual(["gov.br", "g1.globo.com"]);
    const chaves = e.atividades.map((a) => a.chave);
    expect(chaves).toEqual(expect.arrayContaining(["pesquisando", "fontes", "codigo", "preparando"]));
    expect(chaves).not.toContain("arquivos");
    expect(e.atividades.every((a) => a.estado !== "ativo")).toBe(true);
    expect(resumoSeguro(e)).toContain("pesquisou na web (2 fontes)");
  });
});

describe("resumo seguro, duração e citações", () => {
  it("resume apenas o que aconteceu, sem raciocínio interno", () => {
    const g = criarGerenciador();
    g.aplicar({ type: "response.created", response: { id: "r1" } });
    g.aplicar({ type: "response.output_item.added", item: { type: "web_search_call" } });
    g.aplicar({ type: "response.output_item.done", item: { type: "web_search_call", action: { sources: [{ url: "https://a.com/x", title: "A" }] } } });
    g.aplicar({ type: "response.output_text.delta", delta: "Olá" });
    g.aplicar({ type: "response.reasoning_summary_text.delta", delta: "pensei nisto" });
    g.aplicar({ type: "response.completed", response: {} });
    const est = g.ler();
    const resumo = resumoSeguro(est);
    expect(resumo).toContain("pesquisou na web (1 fonte)");
    expect(resumo).not.toContain("pensei nisto");
    expect(est.texto).toBe("Olá");
  });

  it("calcula a duração de cada etapa encerrada", () => {
    const est = {
      terminadoEm: 10_000,
      atividades: [
        { chave: "pensando", inicio: 0, fim: 2_000, estado: "concluido" },
        { chave: "gerando", inicio: 2_000, fim: null, estado: "concluido" },
      ],
    };
    const linha = linhaDoTempo(est);
    expect(linha[0].segundos).toBe(2);
    expect(linha[1].segundos).toBe(8);
  });

  it("transforma [n] em citação sem tocar em links markdown", () => {
    expect(comCitacoes("Fato [1] e [2], veja [texto](https://x.com)")).toBe(
      "Fato [[1]](cite:1) e [[2]](cite:2), veja [texto](https://x.com)"
    );
  });

  it("guarda código executado e arquivos lidos", () => {
    const g = criarGerenciador();
    g.aplicar({ type: "response.output_item.added", item: { type: "code_interpreter_call" } });
    g.aplicar({ type: "response.code_interpreter_call.code_delta", delta: "print(1)" });
    g.aplicar({ type: "response.code_interpreter_call.completed" });
    g.aplicar({ type: "response.output_item.added", item: { type: "file_search_call" } });
    g.aplicar({ type: "response.output_item.done", item: { type: "file_search_call" } });
    const est = g.ler();
    expect(est.codigo[0].codigo).toContain("print(1)");
    expect(est.atividades.map((a) => a.chave)).toEqual(expect.arrayContaining(["codigo", "arquivos"]));
  });
});
