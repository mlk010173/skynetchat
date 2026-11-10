import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { criarGerenciador, linhaDoTempo, resumoSeguro } from "./eventos.js";
import { ActivityTimeline, SourcesPanel, StreamingStatus, CitationReference } from "./components/Streaming.jsx";

// Sequência real de uma resposta com pesquisa (mesmos tipos da Responses API).
function estadoComPesquisa() {
  const g = criarGerenciador();
  g.aplicar({ type: "response.created", response: { id: "resp_1", model: "gpt" } });
  g.aplicar({ type: "response.in_progress", response: {} });
  g.aplicar({ type: "response.output_item.added", item: { type: "reasoning" } });
  g.aplicar({ type: "response.reasoning_summary_text.delta", delta: "resumo público do plano" });
  g.aplicar({ type: "response.reasoning_summary_text.done" });
  g.aplicar({ type: "response.output_item.added", item: { type: "web_search_call" } });
  g.aplicar({
    type: "response.output_item.done",
    item: {
      type: "web_search_call",
      action: { sources: [{ url: "https://exemplo.com/a", title: "Fonte A" }, { url: "https://noticias.com/b", title: "Fonte B" }] },
    },
  });
  g.aplicar({ type: "response.output_item.added", item: { type: "message" } });
  g.aplicar({ type: "response.output_text.delta", delta: "Primeiro" });
  g.aplicar({ type: "response.output_text.delta", delta: " parágrafo [1]." });
  g.aplicar({ type: "response.output_text.done", text: "Primeiro parágrafo [1]." });
  g.aplicar({ type: "response.completed", response: {} });
  return g.ler();
}

describe("componentes do streaming", () => {
  it("mostra apenas as etapas executadas e resume sem vazar raciocínio", () => {
    const est = estadoComPesquisa();
    const html = renderToStaticMarkup(
      <ActivityTimeline
        atividades={linhaDoTempo(est)}
        resumo={resumoSeguro(est)}
        fontes={est.fontes}
      />
    );
    expect(html).toContain("pesquisou na web (2 fontes)");
    expect(html).toContain("st-linha");
    // etapas realmente abertas: pensar, pesquisar e preparar
    const etapas = (html.match(/class="st-etapa /g) || []).length;
    expect(etapas).toBe(0); // recolhida por padrão
    expect(html).not.toContain("resumo público do plano");
  });

  it("painel de fontes lista domínio, título e link numerado", () => {
    const est = estadoComPesquisa();
    const html = renderToStaticMarkup(<SourcesPanel fontes={est.fontes} abertoInicial />);
    expect(html).toContain("exemplo.com");
    expect(html).toContain("Fonte A");
    expect(html).toContain("https://noticias.com/b");
    expect(html).toContain('class="st-fonte-n">1<');
    expect(html).toContain('class="st-fonte-n">2<');
  });

  it("citação sem fonte vira marcador órfão, sem link inventado", () => {
    expect(renderToStaticMarkup(<CitationReference indice={3} />)).toContain("[3]");
    expect(renderToStaticMarkup(<CitationReference indice={3} />)).not.toContain("href");
  });

  it("status comunica erro e resposta incompleta", () => {
    expect(renderToStaticMarkup(<StreamingStatus fase="falhou" erro="sem conexão" />)).toContain("sem conexão");
    expect(renderToStaticMarkup(<StreamingStatus fase="incompleto" incompleto />)).toMatch(/incomplet/i);
  });
});
