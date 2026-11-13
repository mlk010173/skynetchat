import { describe, expect, it } from "vitest";
import {
  CORES,
  dividirLinhaTabela,
  numeroDaCelula,
  parseBlocos,
  parseInline,
  tabelaParaCsv,
  tabelaParaTsv,
  textoPuro,
  urlSegura,
} from "./markdown-blocos.js";

const tipos = (nos) => nos.map((n) => n.tipo);

describe("inline", () => {
  it("negrito, itálico, sublinhado, tachado e destaque", () => {
    const nos = parseInline("**forte** *leve* ++sub++ ~~fora~~ ==marca==");
    expect(tipos(nos).filter((t) => t !== "texto")).toEqual(["negrito", "italico", "sublinhado", "tachado", "destaque"]);
  });

  it("código inline protege o que está dentro", () => {
    const nos = parseInline("use `**não** é negrito` aqui");
    expect(nos.find((n) => n.tipo === "codigo").valor).toBe("**não** é negrito");
    expect(tipos(nos)).not.toContain("negrito");
  });

  it("cores só para nomes conhecidos", () => {
    const ok = parseInline("{vermelho:alerta}");
    expect(ok[0]).toMatchObject({ tipo: "cor", cor: "vermelho" });
    expect(CORES.vermelho).toMatch(/^#/);
    const ruim = parseInline("{expression(alert(1)):x}");
    expect(tipos(ruim)).toEqual(["texto"]);
  });

  it("menção só vale no começo ou depois de espaço (e-mail não vira menção)", () => {
    expect(parseInline("oi @pesquisar agora").some((n) => n.tipo === "mencao")).toBe(true);
    expect(parseInline("fale com ana@empresa.com").some((n) => n.tipo === "mencao")).toBe(false);
    expect(parseInline("@agente faça").find((n) => n.tipo === "mencao").nome).toBe("agente");
  });

  it("citação [1] separada de link markdown", () => {
    const nos = parseInline("fato [1] e [site](https://exemplo.com)");
    expect(tipos(nos)).toContain("citacao");
    expect(nos.find((n) => n.tipo === "link").url).toBe("https://exemplo.com");
  });

  it("fórmula inline sem confundir preços", () => {
    expect(parseInline("vale $x^2+1$ ok").some((n) => n.tipo === "formula")).toBe(true);
    expect(parseInline("custa $5 e depois $10").some((n) => n.tipo === "formula")).toBe(false);
  });

  it("escape com barra invertida", () => {
    expect(textoPuro(parseInline("2 \\* 3 \\* 4"))).toBe("2 * 3 * 4");
  });
});

describe("segurança de links (XSS)", () => {
  it("bloqueia javascript:, data: e vbscript:", () => {
    for (const ruim of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>1</script>", "vbscript:x", " javascript:alert(1)"]) {
      expect(urlSegura(ruim)).toBeNull();
    }
  });

  it("link com esquema perigoso vira texto, nunca <a>", () => {
    const nos = parseInline("[clique](javascript:alert(1))");
    expect(nos.some((n) => n.tipo === "link")).toBe(false);
  });

  it("aceita http, https, mailto, caminho relativo e âncora", () => {
    for (const bom of ["https://a.com", "http://a.com/x?y=1", "mailto:a@b.com", "/privacidade", "#secao"]) {
      expect(urlSegura(bom)).toBe(bom);
    }
    expect(urlSegura("//evil.com")).toBeNull(); // protocolo-relativo
  });

  it("HTML cru fica como texto e nunca vira nó de marcação", () => {
    const blocos = parseBlocos('<img src=x onerror=alert(1)> <script>alert(1)</script>');
    const todos = JSON.stringify(blocos);
    expect(blocos[0].tipo).toBe("paragrafo");
    expect(todos).toContain("<script>"); // preservado como TEXTO para o React escapar
    expect(tipos(blocos[0].filhos)).toEqual(["texto"]);
  });
});

describe("tabelas", () => {
  const md = [
    "| Produto | Preço | Estoque |",
    "|:--------|------:|:-------:|",
    "| Caneta  | R$ 2,50 | 120 |",
    "| Caderno | R$ 18,90 | 40 |",
  ].join("\n");

  it("detecta cabeçalho, alinhamento e linhas", () => {
    const [t] = parseBlocos(md);
    expect(t.tipo).toBe("tabela");
    expect(t.cabecalho).toEqual(["Produto", "Preço", "Estoque"]);
    expect(t.alinhar).toEqual(["esquerda", "direita", "centro"]);
    expect(t.linhas).toHaveLength(2);
  });

  it("normaliza linha com colunas faltando ou sobrando", () => {
    const [t] = parseBlocos("| a | b | c |\n|---|---|---|\n| 1 |\n| 1 | 2 | 3 | 4 |");
    expect(t.linhas[0]).toEqual(["1", "", ""]);
    expect(t.linhas[1]).toEqual(["1", "2", "3"]);
  });

  it("barra escapada e barra dentro de código não dividem a célula", () => {
    expect(dividirLinhaTabela("| a \\| b | `x | y` | z |")).toEqual(["a | b", "`x | y`", "z"]);
  });

  it("texto com barra sem separador NÃO vira tabela", () => {
    expect(parseBlocos("isto | aquilo")[0].tipo).toBe("paragrafo");
  });

  it("tabela sem barras nas bordas também funciona", () => {
    const [t] = parseBlocos("a | b\n--- | ---\n1 | 2");
    expect(t.tipo).toBe("tabela");
    expect(t.linhas).toEqual([["1", "2"]]);
  });

  it("interpreta números em formato brasileiro e americano", () => {
    expect(numeroDaCelula("R$ 1.234,56")).toBe(1234.56);
    expect(numeroDaCelula("1,234.56")).toBe(1234.56);
    expect(numeroDaCelula("12%")).toBe(12);
    expect(numeroDaCelula("2,50")).toBe(2.5);
    expect(numeroDaCelula("1.234")).toBe(1234);
    expect(numeroDaCelula("-7")).toBe(-7);
    expect(numeroDaCelula("abc")).toBeNull();
    expect(numeroDaCelula("")).toBeNull();
  });

  it("CSV com aspas, separador e quebra de linha", () => {
    const csv = tabelaParaCsv(["Nome", "Obs"], [['Ana "A"', "oi, tudo\nbem"]]);
    expect(csv).toBe('Nome,Obs\r\n"Ana ""A""","oi, tudo bem"');
  });

  it("CSV neutraliza injeção de fórmula, mas preserva números negativos", () => {
    const csv = tabelaParaCsv(["x"], [["=HYPERLINK(\"http://evil\")"], ["+cmd|' /C calc'!A0"], ["@SUM(1)"], ["-5"], ["-3,50"]]);
    const linhas = csv.split("\r\n");
    expect(linhas[1]).toMatch(/^"?'=/);
    expect(linhas[2]).toMatch(/^'\+/);
    expect(linhas[3]).toMatch(/^'@/);
    expect(linhas[4]).toBe("-5");
    // número negativo legítimo não recebe apóstrofo; as aspas existem só porque a vírgula decimal
    // quebraria a coluna no CSV
    expect(linhas[5]).toBe('"-3,50"');
  });

  it("TSV limpa tabs e quebras para colar em planilha", () => {
    expect(tabelaParaTsv(["a", "b"], [["1\t2", "x\ny"]])).toBe("a\tb\n1 2\tx y");
  });

  it("tabela grande é parseada sem travar", () => {
    const linhas = ["| n | v |", "|---|---|", ...Array.from({ length: 5000 }, (_, k) => `| ${k} | ${k * 2} |`)];
    const t0 = Date.now();
    const [t] = parseBlocos(linhas.join("\n"));
    expect(t.linhas).toHaveLength(5000);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});

describe("blocos", () => {
  it("títulos de 1 a 4", () => {
    const b = parseBlocos("# A\n## B\n### C\n#### D\n##### E");
    expect(b.filter((x) => x.tipo === "titulo").map((x) => x.nivel)).toEqual([1, 2, 3, 4]);
    expect(b[4].tipo).toBe("paragrafo");
  });

  it("lista com checklist e aninhamento", () => {
    const [l] = parseBlocos("- [x] feito\n- [ ] falta\n  - sub item\n1. um");
    expect(l.tipo).toBe("lista");
    expect(l.itens[0]).toMatchObject({ marcado: true, nivel: 0 });
    expect(l.itens[1]).toMatchObject({ marcado: false });
    expect(l.itens[2].nivel).toBe(1);
    expect(l.itens[3].ordenada).toBe(true);
  });

  it("citação com conteúdo formatado", () => {
    const [c] = parseBlocos("> **nota** importante\n> segunda linha");
    expect(c.tipo).toBe("citacao");
    expect(c.filhos[0].tipo).toBe("paragrafo");
  });

  it("bloco de código aberto (stream em andamento) é marcado e não engole o resto", () => {
    const b = parseBlocos("antes\n\n```js\nconst a = 1;");
    expect(b[1]).toMatchObject({ tipo: "codigo", linguagem: "js", aberto: true });
  });

  it("código preserva conteúdo que parece markdown", () => {
    const [c] = parseBlocos("```\n| a | b |\n|---|---|\n# não é título\n```");
    expect(c.tipo).toBe("codigo");
    expect(c.codigo).toContain("# não é título");
  });

  it("separador não é confundido com item de lista", () => {
    expect(parseBlocos("---")[0].tipo).toBe("separador");
    expect(parseBlocos("- item")[0].tipo).toBe("lista");
  });

  it("fórmula em bloco", () => {
    expect(parseBlocos("$$\nE = mc^2\n$$")[0]).toMatchObject({ tipo: "formula", valor: "E = mc^2" });
  });

  it("documento misto na ordem certa", () => {
    const b = parseBlocos("# T\n\ntexto\n\n| a |\n|---|\n| 1 |\n\n- x\n\n```\ncod\n```");
    expect(b.map((x) => x.tipo)).toEqual(["titulo", "paragrafo", "tabela", "lista", "codigo"]);
  });
});
