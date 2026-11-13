import { describe, expect, it } from "vitest";
import {
  atende,
  capacidadesDe,
  custoEstimado,
  filtrarCompativeis,
  lerSobrescritas,
} from "../../supabase/functions/_shared/capacidades.ts";

describe("capacidades dos modelos", () => {
  it("reconhece visão e ferramentas em modelos multimodais conhecidos", () => {
    const c = capacidadesDe("gpt-4o-mini");
    expect(c.modalidades).toContain("visao");
    expect(c.ferramentas).toBe(true);
  });

  it("modelo desconhecido não ganha capacidade inventada", () => {
    const c = capacidadesDe("modelo-sem-nome-conhecido");
    expect(c.modalidades).toEqual(["texto"]);
    expect(c.ferramentas).toBeNull();
    expect(c.custoPorMilhao).toBeNull();
  });

  it("não manda imagem para modelo sem visão", () => {
    const lista = [{ id: "llama-3.1-8b" }, { id: "gpt-4o" }, { id: "llava-1.6" }];
    const ok = filtrarCompativeis(lista, { visao: true }).map((m) => m.id);
    expect(ok).toEqual(["gpt-4o", "llava-1.6"]);
  });

  it("mantém a ordem original dos candidatos", () => {
    const lista = [{ id: "claude-3-5-sonnet" }, { id: "gpt-4o" }, { id: "gemini-1.5-pro" }];
    expect(filtrarCompativeis(lista, { visao: true }).map((m) => m.id)).toEqual(lista.map((m) => m.id));
  });

  it("modelo de imagem ou de áudio puro não entra para conversar", () => {
    expect(atende(capacidadesDe("flux.1-dev"), {})).toBe(false);
    expect(atende(capacidadesDe("whisper-large-v3"), {})).toBe(false);
    expect(atende(capacidadesDe("tts-1"), {})).toBe(false);
  });

  it("recusa modelo que declara não suportar ferramentas quando elas são exigidas", () => {
    expect(atende(capacidadesDe("llama-guard-3"), { ferramentas: true })).toBe(false);
    // desconhecido (null) é tolerado, para não esvaziar a lista
    expect(atende(capacidadesDe("modelo-x"), { ferramentas: true })).toBe(true);
  });

  it("respeita o limite de contexto quando ele é conhecido", () => {
    const cap = { ...capacidadesDe("modelo-x"), contextoTokens: 8000 };
    expect(atende(cap, { tokensEntrada: 7500 })).toBe(false); // acima de 90% de 8000
    expect(atende(cap, { tokensEntrada: 3000 })).toBe(true);
    expect(atende(cap, { tokensEntrada: 7000 })).toBe(true); // ainda cabe com folga de 10%
  });

  it("sobrescritas do dono vencem as regras", () => {
    const sob = lerSobrescritas('{"meu-modelo":{"modalidades":["texto","visao"],"contextoTokens":128000}}');
    const c = capacidadesDe("meu-modelo", sob);
    expect(c.modalidades).toContain("visao");
    expect(c.contextoTokens).toBe(128000);
  });

  it("JSON de sobrescrita inválido é ignorado sem quebrar", () => {
    expect(lerSobrescritas("{quebrado")).toEqual({});
    expect(lerSobrescritas("[1,2]")).toEqual({});
    expect(lerSobrescritas(undefined)).toEqual({});
  });

  it("custo só existe quando o preço é conhecido", () => {
    expect(custoEstimado(capacidadesDe("modelo-x"), 1000, 1000)).toBeNull();
    const cap = { ...capacidadesDe("modelo-x"), custoPorMilhao: { entrada: 1, saida: 4 } };
    expect(custoEstimado(cap, 1_000_000, 500_000)).toBeCloseTo(3, 6);
  });
});
