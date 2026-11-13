// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Teste do módulo de consentimento com um navegador mínimo simulado.
 * Nada de jsdom: localStorage, sessionStorage, document.cookie e
 * TextEncoder são montados aqui para exercitar o código real.
 */

class StorageFalso {
  constructor() {
    this.mapa = new Map();
  }
  get length() {
    return this.mapa.size;
  }
  key(i) {
    return [...this.mapa.keys()][i] ?? null;
  }
  getItem(k) {
    return this.mapa.has(k) ? this.mapa.get(k) : null;
  }
  setItem(k, v) {
    this.mapa.set(String(k), String(v));
  }
  removeItem(k) {
    this.mapa.delete(k);
  }
  clear() {
    this.mapa.clear();
  }
}

/** document.cookie de mentira: guarda pares e respeita expires no passado. */
function criarDocumentoFalso() {
  const jarro = new Map();
  return {
    jarro,
    get cookie() {
      return [...jarro.values()].map((c) => `${c.nome}=${c.valor}`).join("; ");
    },
    set cookie(linha) {
      const [par, ...atributos] = String(linha).split(";");
      const igual = par.indexOf("=");
      const nome = (igual >= 0 ? par.slice(0, igual) : par).trim();
      const valor = igual >= 0 ? par.slice(igual + 1).trim() : "";
      const expirado = atributos.some((a) => /expires=Thu,\s*01\s*Jan\s*1970/i.test(a.trim()));
      if (expirado || valor === "") {
        jarro.delete(nome);
        return;
      }
      jarro.set(nome, { nome, valor });
    },
  };
}

const CHAVE = "skynet.consentimento.v1";

let mod;

async function carregarModulo() {
  vi.resetModules();
  return import("./consentimento.js");
}

beforeEach(async () => {
  globalThis.localStorage = new StorageFalso();
  globalThis.sessionStorage = new StorageFalso();
  globalThis.document = criarDocumentoFalso();
  globalThis.window = { dispatchEvent: () => true };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  mod = await carregarModulo();
});

afterEach(() => {
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.CustomEvent;
  vi.useRealTimers();
});

describe("persistência", () => {
  it("começa sem decisão e só com essenciais ligada", () => {
    const c = mod.lerConsentimento();
    expect(c.decididoEm).toBeNull();
    expect(c.categorias).toEqual({
      essenciais: true,
      preferencias: false,
      analiticos: false,
      marketing: false,
    });
    expect(mod.precisaDecidir()).toBe(true);
  });

  it("grava versão, categorias, datas e registro", () => {
    const gravado = mod.salvarConsentimento({ preferencias: true, analiticos: true }, "personalizar");

    const bruto = JSON.parse(globalThis.localStorage.getItem(CHAVE));
    expect(bruto.versao).toBe(1);
    expect(bruto.categorias).toEqual({
      essenciais: true,
      preferencias: true,
      analiticos: true,
      marketing: false,
    });
    expect(bruto.decididoEm).toBe(gravado.decididoEm);
    expect(Number.isFinite(Date.parse(bruto.expiraEm))).toBe(true);
    expect(bruto.registro).toHaveLength(1);
    expect(bruto.registro[0].acao).toBe("personalizar");
    expect(bruto.registro[0].categorias).toEqual(["essenciais", "preferencias", "analiticos"]);
    expect(mod.precisaDecidir()).toBe(false);
  });

  it("expira em 180 dias", () => {
    const gravado = mod.salvarConsentimento({ preferencias: true }, "aceitar-tudo");
    const dias = (Date.parse(gravado.expiraEm) - Date.parse(gravado.decididoEm)) / (24 * 60 * 60 * 1000);
    expect(Math.round(dias)).toBe(180);
  });

  it("limita o registro a 50 entradas", () => {
    for (let i = 0; i < 60; i += 1) mod.salvarConsentimento({ preferencias: true }, `acao-${i}`);
    const c = mod.lerConsentimento();
    expect(c.registro).toHaveLength(50);
    expect(c.registro[c.registro.length - 1].acao).toBe("acao-59");
  });

  it("ignora lixo no localStorage sem quebrar", () => {
    globalThis.localStorage.setItem(CHAVE, "{não é json");
    const c = mod.lerConsentimento();
    expect(c.decididoEm).toBeNull();
    expect(mod.precisaDecidir()).toBe(true);
  });
});

describe("expiração", () => {
  it("volta a exigir decisão depois do prazo", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    mod.salvarConsentimento({ analiticos: true }, "aceitar-tudo");
    expect(mod.precisaDecidir()).toBe(false);
    expect(mod.permitido("analiticos")).toBe(true);

    vi.setSystemTime(new Date("2026-07-01T00:00:01.000Z")); // 181 dias depois
    expect(mod.precisaDecidir()).toBe(true);
    expect(mod.permitido("analiticos")).toBe(false);
  });

  it("não libera categoria quando a decisão está expirada", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    mod.salvarConsentimento({ marketing: true }, "aceitar-tudo");
    vi.setSystemTime(new Date("2027-01-01T00:00:00.000Z"));
    expect(mod.lerConsentimento().categorias.marketing).toBe(true); // histórico continua
    expect(mod.permitido("marketing")).toBe(false);
  });
});

describe("permitido e guardaCategoria", () => {
  it("essenciais sempre passam", () => {
    expect(mod.permitido("essenciais")).toBe(true);
    expect(mod.guardaCategoria("essenciais", () => "ok")).toBe("ok");
  });

  it("bloqueia gravação antes do aceite", () => {
    const fn = vi.fn(() => "gravou");
    expect(mod.guardaCategoria("preferencias", fn)).toBeNull();
    expect(fn).not.toHaveBeenCalled();
    expect(mod.permitido("analiticos")).toBe(false);
  });

  it("libera somente a categoria aceita", () => {
    mod.salvarConsentimento({ preferencias: true }, "personalizar");
    expect(mod.guardaCategoria("preferencias", () => 1)).toBe(1);
    expect(mod.guardaCategoria("analiticos", () => 1)).toBeNull();
  });

  it("recusa categoria inexistente", () => {
    mod.salvarConsentimento({ preferencias: true }, "personalizar");
    expect(mod.permitido("inexistente")).toBe(false);
    expect(mod.guardaCategoria("inexistente", () => 1)).toBeNull();
  });
});

describe("revogação", () => {
  it("apaga de fato as chaves da categoria em localStorage", () => {
    globalThis.localStorage.setItem("skynet-theme-bg", "white");
    globalThis.localStorage.setItem("skynet.agente.densidade.v1", "compacta");
    globalThis.localStorage.setItem("outra-coisa", "fica");
    globalThis.sessionStorage.setItem("skynet.rascunho", "texto");

    mod.salvarConsentimento({ preferencias: true }, "aceitar-tudo");
    expect(mod.permitido("preferencias")).toBe(true);

    const removidos = mod.revogar();

    expect(globalThis.localStorage.getItem("skynet-theme-bg")).toBeNull();
    expect(globalThis.localStorage.getItem("skynet.agente.densidade.v1")).toBeNull();
    expect(globalThis.sessionStorage.getItem("skynet.rascunho")).toBeNull();
    // chave fora dos prefixos do site é preservada
    expect(globalThis.localStorage.getItem("outra-coisa")).toBe("fica");
    expect(removidos.categorias.preferencias).toBe(false);
    expect(mod.precisaDecidir()).toBe(true);
  });

  it("apaga cookies da categoria revogada", () => {
    globalThis.document.cookie = "skynet_tema=escuro";
    // cookie desconhecido entra como analítico/terceiro e deve ser apagado
    const inventarioAntes = mod.inventarioCookies();
    expect(inventarioAntes.some((i) => i.nome === "skynet_tema")).toBe(true);

    mod.revogar();
    expect(String(globalThis.document.cookie)).not.toContain("skynet_tema");
  });

  it("apagarCategoria não toca em essenciais", () => {
    globalThis.localStorage.setItem("skynet-session", "token");
    const removidos = mod.apagarCategoria("essenciais");
    expect(removidos).toEqual([]);
    expect(globalThis.localStorage.getItem("skynet-session")).toBe("token");
  });

  it("registra a revogação no histórico", () => {
    mod.salvarConsentimento({ marketing: true }, "aceitar-tudo");
    mod.revogar();
    const registro = mod.lerConsentimento().registro;
    expect(registro[registro.length - 1].acao).toBe("revogar");
    expect(registro[registro.length - 1].categorias).toEqual(["essenciais"]);
  });

  it("salvar com categoria desligada também apaga as chaves dela", () => {
    globalThis.localStorage.setItem("skynet-theme-bg", "white");
    mod.salvarConsentimento({ preferencias: true }, "aceitar-tudo");
    mod.salvarConsentimento({ preferencias: false }, "personalizar");
    expect(globalThis.localStorage.getItem("skynet-theme-bg")).toBeNull();
  });
});

describe("inventário", () => {
  it("classifica sessão, preferências, agente e desconhecido", () => {
    globalThis.localStorage.setItem("skynet-session", JSON.stringify({ access_token: "x" }));
    globalThis.localStorage.setItem("sb-projeto-auth-token", "y");
    globalThis.localStorage.setItem("skynet-theme-bg", "white");
    globalThis.localStorage.setItem("skynet.agente.config.v1", "{}");
    globalThis.localStorage.setItem("skynet.consentimento.v1", "{}");
    globalThis.localStorage.setItem("chave-de-outro-app", "nao entra");
    globalThis.sessionStorage.setItem("sb-outro", "z");
    globalThis.document.cookie = "_ga=GA1.2; path=/";

    const inv = mod.inventarioCookies();
    const porNome = Object.fromEntries(inv.map((i) => [i.nome, i]));

    expect(porNome["skynet-session"]).toMatchObject({ categoria: "essenciais", party: "propria" });
    expect(porNome["sb-projeto-auth-token"]).toMatchObject({ categoria: "essenciais", party: "propria" });
    expect(porNome["skynet-theme-bg"]).toMatchObject({ categoria: "preferencias" });
    expect(porNome["skynet.agente.config.v1"]).toMatchObject({ categoria: "preferencias" });
    expect(porNome["skynet.consentimento.v1"].validade).toBe("180 dias");
    expect(porNome["sb-outro"].onde).toBe("sessionStorage");
    // chave fora dos prefixos do site não é listada
    expect(porNome["chave-de-outro-app"]).toBeUndefined();
    // cookie de terceiro desconhecido aparece, e como terceiro
    expect(porNome._ga).toMatchObject({ onde: "cookie", party: "terceiro", desconhecido: true });
  });

  it("conta bytes e ordena por categoria", () => {
    globalThis.localStorage.setItem("skynet-theme-bg", "white");
    globalThis.document.cookie = "_ga=valor-longo-para-contar";
    const inv = mod.inventarioCookies();
    expect(inv.length).toBe(2);
    expect(mod.tamanhoAproximado(inv)).toBeGreaterThan(0);
    expect(inv[0].categoria).toBe("preferencias"); // essenciais ausente, preferencias vem antes de analiticos
  });

  it("não quebra sem document nem storage", async () => {
    delete globalThis.document;
    delete globalThis.localStorage;
    delete globalThis.sessionStorage;
    vi.resetModules();
    const isolado = await import("./consentimento.js");
    expect(isolado.inventarioCookies()).toEqual([]);
    expect(isolado.lerConsentimento().decididoEm).toBeNull();
    expect(isolado.precisaDecidir()).toBe(true);
    expect(isolado.salvarConsentimento({ preferencias: true }).categorias.preferencias).toBe(true);
    expect(isolado.exportarMeusDados().inventario).toEqual([]);
  });
});

describe("exportação", () => {
  it("devolve consentimento, categorias e inventário", () => {
    globalThis.localStorage.setItem("skynet-theme-bg", "white");
    mod.salvarConsentimento({ preferencias: true }, "aceitar-tudo");
    const dados = mod.exportarMeusDados();
    expect(dados.aplicacao).toBe("SKYNETchat");
    expect(dados.consentimento.categorias.preferencias).toBe(true);
    expect(dados.categorias).toHaveLength(4);
    expect(dados.inventario.some((i) => i.nome === "skynet-theme-bg")).toBe(true);
    expect(dados.tamanhoAproximadoBytes).toBeGreaterThan(0);
    expect(() => JSON.parse(mod.exportarMeusDadosJSON())).not.toThrow();
  });
});
