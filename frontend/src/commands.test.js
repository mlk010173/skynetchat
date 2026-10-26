import { describe, expect, it } from "vitest";
import { ajudaComandos, parseCommand } from "./commands.js";

describe("parseCommand", () => {
  it("reconhece comando com argumentos", () => {
    expect(parseCommand("/pesquisar noticias de hoje")).toEqual({ nome: "pesquisar", args: "noticias de hoje" });
  });
  it("reconhece comando sem argumentos", () => {
    expect(parseCommand("/ferramentas")).toEqual({ nome: "ferramentas", args: "" });
  });
  it("ignora texto normal e comandos vazios", () => {
    expect(parseCommand("oi, tudo bem?")).toBeNull();
    expect(parseCommand("/")).toBeNull();
    expect(parseCommand("")).toBeNull();
  });
  it("nao confunde barra no meio do texto", () => {
    expect(parseCommand("use 10/10 de desconto")).toBeNull();
  });
  it("ajuda lista os tres comandos", () => {
    const a = ajudaComandos();
    expect(a).toMatch(/\/pesquisar/); expect(a).toMatch(/\/abrir/); expect(a).toMatch(/\/ferramentas/);
  });
});
