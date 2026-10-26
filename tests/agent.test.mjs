import { test } from "node:test";
import assert from "node:assert/strict";
process.env.SKYNET_AGENT_NO_LISTEN = "1";
const A = await import("../server/agent.mjs");

test("sanitizar mascara segredos", () => {
  assert.match(A.sanitizar("chave nvapi-ABCDEFGH12345 fim"), /\[removido\]/);
  assert.match(A.sanitizar("Bearer abc.def.ghi"), /Bearer \[removido\]/);
  assert.equal(A.sanitizar("texto limpo"), "texto limpo");
});

test("validarComando: whitelist e metacaracteres", () => {
  assert.equal(A.validarComando("ls -la").ok, true);
  assert.equal(A.validarComando("rm -rf /").ok, false);
  assert.equal(A.validarComando("ls; cat /etc/passwd").ok, false);
  assert.equal(A.validarComando("").ok, false);
});

test("urlPermitida bloqueia http e hosts internos", () => {
  assert.equal(A.urlPermitida("https://example.com/a").ok, true);
  assert.equal(A.urlPermitida("http://example.com").ok, false);
  assert.equal(A.urlPermitida("https://localhost/x").ok, false);
  assert.equal(A.urlPermitida("https://127.0.0.1/x").ok, false);
  assert.equal(A.urlPermitida("https://192.168.0.1/x").ok, false);
});

test("htmlParaTexto limpa tags e entidades", () => {
  const t = A.htmlParaTexto("<h1>Ola</h1><script>alert(1)</script><p>a &amp; b</p>");
  assert.match(t, /Ola/); assert.match(t, /a & b/); assert.doesNotMatch(t, /alert|</);
});

test("extrairResultados le o html do DuckDuckGo", () => {
  const html = `<div><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexemplo.com%2Fnota">Noticia X</a>
  <a class="result__snippet">Resumo da noticia X</a></div>`;
  const r = A.extrairResultados(html);
  assert.equal(r.length, 1);
  assert.equal(r[0].titulo, "Noticia X");
  assert.equal(r[0].url, "https://exemplo.com/nota");
  assert.match(r[0].trecho, /Resumo/);
});

test("rota /tools devolve o catalogo real", async () => {
  const res = { code: 0, body: "" , writeHead(c){ this.code = c; }, end(b){ this.body = b; } };
  await A.handler({ method: "GET", url: "/tools" }, res);
  const d = JSON.parse(res.body);
  assert.equal(res.code, 200);
  assert.equal(d.ok, true);
  assert.equal(d.ferramentas.length, 5);
  assert.ok(d.ferramentas.some((f) => f.nome === "web_pesquisar"));
});

test("pesquisa vazia responde honesto (sem rede)", async () => {
  const res = { code: 0, body: "", writeHead(c){ this.code = c; }, end(b){ this.body = b; } };
  const req = { method: "POST", url: "/tools/web_pesquisar", async *[Symbol.asyncIterator]() { yield JSON.stringify({ consulta: "" }); } };
  await A.handler(req, res);
  const d = JSON.parse(res.body);
  assert.equal(d.ok, false);
  assert.match(d.erro, /consulta vazia/);
});
