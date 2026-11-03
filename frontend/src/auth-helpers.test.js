import { describe, expect, it } from "vitest";
import { destinoSeguro, forcaDaSenha, traduzirErro } from "./auth-helpers.js";

describe("traduzirErro", () => {
  it("traduz credenciais inválidas", () => {
    expect(traduzirErro({ message: "Invalid login credentials" })).toBe("E-mail ou senha incorretos.");
  });
  it("avisa sobre e-mail não confirmado", () => {
    expect(traduzirErro({ message: "Email not confirmed" })).toContain("Confirme seu e-mail");
  });
  it("explica senha vazada", () => {
    expect(traduzirErro({ message: "Password is known to be pwned" })).toContain("vazamentos");
  });
  it("usa a mensagem crua quando não conhece o erro", () => {
    expect(traduzirErro({ message: "erro estranho" })).toBe("erro estranho");
  });
  it("não quebra sem erro", () => {
    expect(traduzirErro(null)).toBe("Não foi possível concluir. Tente de novo.");
  });
});

describe("forcaDaSenha", () => {
  it("recusa senha curta", () => {
    expect(forcaDaSenha("Ab1!").minimo).toBe(false);
  });
  it("conta os níveis", () => {
    expect(forcaDaSenha("SenhaForte#2026").pontos).toBe(4);
    expect(forcaDaSenha("senhafraca").pontos).toBe(1);
  });
  it("aceita 8 caracteres", () => {
    expect(forcaDaSenha("12345678").minimo).toBe(true);
  });
});

describe("destinoSeguro", () => {
  it("mantém caminho interno", () => {
    expect(destinoSeguro("/dashboard")).toBe("/dashboard");
  });
  it("bloqueia domínio externo", () => {
    expect(destinoSeguro("//evil.com")).toBe("/");
    expect(destinoSeguro("https://evil.com")).toBe("/");
  });
  it("usa o padrão quando vazio", () => {
    expect(destinoSeguro(undefined)).toBe("/");
  });
});
