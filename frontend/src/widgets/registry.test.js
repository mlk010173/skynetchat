import { describe, expect, it, beforeEach, vi } from "vitest";
import { TIPOS, criarWidget, daSpec, extrairJson, intervaloValido, chaveStorage, carregarWidgets, salvarWidgets } from "./registry.js";

describe("criarWidget", () => {
  it("aplica os padrões do tipo", () => {
    const w = criarWidget("status");
    expect(w.tipo).toBe("status");
    expect(w.cols).toBe(2);
    expect(w.atualizarAgora).toBe(60);
    expect(w.id).toBeTruthy();
  });
  it("respeita limites de tamanho", () => {
    const w = criarWidget("metricas", { cols: 99, linhas: 1 });
    expect(w.cols).toBe(4);
    expect(w.linhas).toBe(2);
  });
  it("ignora tipo inexistente", () => {
    expect(criarWidget("foguete")).toBeNull();
  });
  it("gera ids diferentes", () => {
    expect(criarWidget("texto").id).not.toBe(criarWidget("texto").id);
  });
});

describe("intervaloValido", () => {
  it("0 é manual", () => expect(intervaloValido(0)).toBe(0));
  it("negativo vira manual", () => expect(intervaloValido(-5)).toBe(0));
  it("clampa no mínimo de 10s", () => expect(intervaloValido(3)).toBe(10));
  it("clampa no máximo de 1h", () => expect(intervaloValido(99999)).toBe(3600));
  it("texto vira manual", () => expect(intervaloValido("abc")).toBe(0));
});

describe("extrairJson", () => {
  it("acha JSON puro", () => {
    expect(extrairJson('{"tipo":"status"}')).toEqual({ tipo: "status" });
  });
  it("acha JSON dentro de bloco de código com conversa em volta", () => {
    const t = 'claro!\n```json\n{"tipo":"metricas","config":{"metrica":"chamadas"}}\n```\nfeito';
    expect(extrairJson(t).tipo).toBe("metricas");
  });
  it("devolve null sem JSON", () => expect(extrairJson("nada aqui")).toBeNull());
  it("devolve null em JSON quebrado", () => expect(extrairJson("{tipo: status}")).toBeNull());
});

describe("daSpec", () => {
  it("aceita spec válida e normaliza", () => {
    const r = daSpec({ tipo: "noticias", titulo: "Manchetes", config: { consulta: "IA hoje" }, cols: 3, atualizarAgora: 120 });
    expect(r.ok).toBe(true);
    expect(r.widget.titulo).toBe("Manchetes");
    expect(r.widget.config.consulta).toBe("IA hoje");
    expect(r.widget.cols).toBe(3);
    expect(r.widget.atualizarAgora).toBe(120);
  });
  it("recusa tipo desconhecido", () => {
    expect(daSpec({ tipo: "planilha" }).ok).toBe(false);
  });
  it("recusa spec vazia", () => {
    expect(daSpec(null).ok).toBe(false);
  });
});

describe("persistência", () => {
  // stub simples: o vitest roda em node, sem localStorage
  beforeEach(() => {
    const memoria = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
      setItem: (k, v) => memoria.set(k, String(v)),
      removeItem: (k) => memoria.delete(k),
      clear: () => memoria.clear(),
    });
  });
  it("salva e recarrega só tipos conhecidos", () => {
    const chave = chaveStorage("u1");
    salvarWidgets(chave, [criarWidget("status"), { id: "x", tipo: "alien" }]);
    const lidos = carregarWidgets(chave);
    expect(lidos).toHaveLength(1);
    expect(lidos[0].tipo).toBe("status");
  });
  it("chave muda por usuário", () => {
    expect(chaveStorage("a")).not.toBe(chaveStorage("b"));
  });
  it("lida com lixo no storage", () => {
    localStorage.setItem(chaveStorage(), "{quebrado");
    expect(carregarWidgets(chaveStorage())).toEqual([]);
  });
});

describe("TIPOS", () => {
  it("marca terminal como crítico", () => {
    expect(TIPOS.terminal.critico).toBe(true);
    expect(TIPOS.status.critico).toBe(false);
  });
});
