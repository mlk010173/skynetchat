import { describe, expect, it } from "vitest";
import { direcaoVento, normalizarPrevisao } from "./clima-api.js";
import fx from "./__fixtures__/open-meteo-forecast.json";

// Regressão do React #31 em produção: tudo que o widget entrega como texto tem de ser
// primitivo. Objeto no JSX derruba a tela inteira.
const primitivo = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);

describe("contrato de renderização do clima", () => {
  it("direcaoVento devolve objeto: o widget precisa usar .sigla/.nome, nunca o objeto", () => {
    const d = direcaoVento(180);
    expect(typeof d).toBe("object");
    expect(primitivo(d.sigla) && primitivo(d.nome)).toBe(true);
  });

  it("campos exibidos pelo widget com dado real da Open-Meteo são primitivos", () => {
    const r = normalizarPrevisao(fx, { unidade: "C" });
    expect(r.ok).toBe(true);
    for (const k of ["horaLocal", "tempC", "sensacaoC", "umidade", "codigo", "rotulo", "icone", "ventoKmh", "ventoGraus", "pressaoHpa"]) {
      expect(primitivo(r.agora[k]), `agora.${k}`).toBe(true);
    }
    for (const k of ["maxC", "minC", "chuvaMax", "nascer", "por", "uv"]) expect(primitivo(r.hoje[k]), `hoje.${k}`).toBe(true);
    expect(primitivo(r.local.nome) && primitivo(r.local.uf)).toBe(true);
  });
});
