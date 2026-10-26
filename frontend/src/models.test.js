import { describe, expect, it } from "vitest";
import { CATALOGO, familiaFor, labelFor, nextModel, orderModels, parseModels, tierFor } from "./models.js";

describe("parseModels", () => {
  it("separa, limpa e remove repetidos", () => {
    expect(parseModels(" a , b ,a,, c ")).toEqual(["a", "b", "c"]);
  });
  it("lida com vazio", () => {
    expect(parseModels("")).toEqual([]);
    expect(parseModels(undefined)).toEqual([]);
  });
});

describe("orderModels", () => {
  it("poe o escolhido na frente", () => {
    expect(orderModels("b", ["a", "b", "c"])).toEqual(["b", "a", "c"]);
  });
  it("nao duplica o escolhido", () => {
    expect(orderModels("a", ["a", "a", "b"])).toEqual(["a", "b"]);
  });
});

describe("nextModel", () => {
  it("anda pela reserva e para no fim", () => {
    expect(nextModel("a", ["a", "b"])).toBe("b");
    expect(nextModel("b", ["a", "b"])).toBeNull();
  });
});

describe("rotulos", () => {
  it("conhece os modelos do catalogo", () => {
    expect(labelFor("nvidia/nemotron-3.5-super-vl-120b-a12b")).toBe("Nemotron 3.5 Super");
    expect(tierFor("nvidia/nemotron-3.5-lightning-30b-a3b")).toBe("leve");
  });
  it("gera rotulo legivel para desconhecido", () => {
    expect(labelFor("acme/super-model-9b")).toBe("super model 9b");
  });
});

describe("catalogo configurado", () => {
  it("tem as 7 familias ligadas no backend", () => {
    const fam = ["NVIDIA", "DeepSeek", "MiniMax", "StepFun", "Meta"];
    const vistas = CATALOGO.map((m) => familiaFor(m));
    for (const f of fam) expect(vistas).toContain(f);
    expect(CATALOGO).toHaveLength(7);
  });
  it("cada modelo do catalogo tem rotulo proprio", () => {
    for (const m of CATALOGO) expect(labelFor(m)).not.toMatch(/nvidia|deepseek-ai|minimaxai|stepfun-ai|meta/);
  });
});
