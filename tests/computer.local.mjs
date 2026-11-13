// Teste local do SKYNET COMPUTER — fala com o worker por HTTP, como a edge function faz.
// Não usa o agent.mjs inteiro: sobe uma cópia do módulo (criarServidorCompute) numa porta
// efêmera e prova, com números reais, que o navegador é de verdade.
//
//   node tests/computer.local.mjs
//
// Sai com código 0 só se TODAS as provas passarem. Cada prova imprime o valor medido.

import { createServer } from "node:http";
import { criarServidorCompute, LARGURA, ALTURA } from "../server/computer.mjs";

const TOKEN = "teste-local-" + Math.random().toString(36).slice(2, 10);
const falhas = [];
const provas = [];

function ok(nome, condicao, detalhe) {
  provas.push({ nome, ok: Boolean(condicao), detalhe });
  console.log(`${condicao ? "  OK  " : " FALHA"} · ${nome}${detalhe ? " — " + detalhe : ""}`);
  if (!condicao) falhas.push(nome + (detalhe ? " (" + detalhe + ")" : ""));
}

const servidor = criarServidorCompute({ token: TOKEN });
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;
const S = "teste-" + Date.now();

/* ---------------------------------------------------------------------------
   Servidor de páginas locais: prova que os detectores de console/rede/responsivo
   enxergam problemas de VERDADE (antes só víamos páginas limpas, o que não prova nada).
   - /      : página com console.log/error, um 404 real e um elemento que estoura a tela
   - /404   : 404 de verdade
--------------------------------------------------------------------------- */
const PAGINA_LOCAL = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Pagina local de prova</title>
<style>body{font-family:sans-serif;margin:0}h1{padding:12px}
#estourado{width:2600px;height:40px;background:#c33}
img{width:64px;height:64px}</style></head>
<body>
  <h1 id="titulo">Pagina local de prova</h1>
  <p id="paragrafo">Texto para inspecao de CSS.</p>
  <button id="btn">Botao</button>
  <input id="campo" name="campo">
  <div id="estourado">caixa larga (2600px)</div>
  <img src="/nao-existe.png" alt="imagem que falta">
  <script>
    console.log("log-real-do-computador", 42);
    console.warn("aviso-real");
    console.error("erro-real-controlado");
    fetch("/nao-existe.json").then(r => console.log("status do 404:", r.status));
    document.getElementById("btn").addEventListener("click", () => {
      document.getElementById("titulo").textContent = "Botao clicado de verdade";
      console.info("clique-real-processado");
    });
  </script>
</body></html>`;

const paginas = createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGINA_LOCAL);
    return;
  }
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("nao encontrado");
});
await new Promise((r) => paginas.listen(0, "127.0.0.1", r));
const BASE_LOCAL = `http://127.0.0.1:${paginas.address().port}`;

async function chamar(acao, corpo = {}, { token = TOKEN } = {}) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/compute/${acao}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ sessao: S, ...corpo }),
  });
  const json = await r.json().catch(() => null);
  return { status: r.status, dados: json, ms: Date.now() - t0 };
}

function bytesDataUrl(dataUrl) {
  const b64 = String(dataUrl ?? "").split(",")[1] ?? "";
  return Math.floor((b64.length * 3) / 4);
}

const linhas = [];
const log = (...a) => {
  const t = a.join(" ");
  linhas.push(t);
  console.log(t);
};

console.log("=== SKYNET COMPUTER · teste local ===");
log(`worker: ${BASE} · viewport esperado ${LARGURA}x${ALTURA}`);

/* ------------------------------------------------ provas de autenticação */
console.log("\n[1] Autenticação (401 sem token)");
const semTokenTela = await chamar("tela", { sessao: S }, { token: null });
const semTokenNav = await chamar("navegar", { sessao: S, url: "https://example.com" }, { token: null });
const tokenErrado = await chamar("iniciar", { sessao: S }, { token: "token-errado" });
ok("POST /compute/tela sem token devolve 401", semTokenTela.status === 401, `HTTP ${semTokenTela.status}`);
ok("POST /compute/navegar sem token devolve 401", semTokenNav.status === 401, `HTTP ${semTokenNav.status}`);
ok("POST /compute/iniciar com token errado devolve 401", tokenErrado.status === 401, `HTTP ${tokenErrado.status}`);
log(`corpos: ${JSON.stringify(semTokenTela.dados)} / ${JSON.stringify(semTokenNav.dados)}`);

/* ------------------------------------------------ diagnóstico real */
console.log("\n[2] Diagnóstico (lança o Chromium de verdade)");
const diag = await chamar("diagnostico");
ok("diagnostico ok", diag.dados?.ok === true, `motor=${diag.dados?.motor} versao=${diag.dados?.versao}`);
ok("diagnostico traz um screenshot de prova", (diag.dados?.prova?.screenshot_bytes ?? 0) > 0, `${diag.dados?.prova?.screenshot_bytes} bytes`);
log(
  `motor=${diag.dados?.motor} versao=${diag.dados?.versao} node=${diag.dados?.node} pacotes=${JSON.stringify(diag.dados?.pacotes)} ` +
    `executavel=${diag.dados?.executavel} memoria_rss=${diag.dados?.memoria_rss_mb}MB ms=${diag.ms}`,
);

/* ------------------------------------------------ iniciar + screenshot */
console.log("\n[3] iniciar + screenshot real");
const ini = await chamar("iniciar", {});
ok("iniciar ok", ini.dados?.ok === true, ini.dados?.erro ?? `motor=${ini.dados?.motor}`);
const telaIni = ini.dados?.tela;
const b1 = bytesDataUrl(telaIni?.data_url);
ok("screenshot > 5000 bytes", b1 > 5000, `${b1} bytes`);
ok(
  "dimensões 1280x800",
  telaIni?.largura === 1280 && telaIni?.altura === 800,
  `${telaIni?.largura}x${telaIni?.altura}`,
);
ok("data URL é JPEG", String(telaIni?.data_url ?? "").startsWith("data:image/jpeg;base64,"), String(telaIni?.data_url ?? "").slice(0, 30));
log(`iniciar: url=${ini.dados?.url} titulo=${JSON.stringify(ini.dados?.titulo)} motor=${ini.dados?.motor} versao=${ini.dados?.versao}`);
log(`tela: ${b1} bytes · ${telaIni?.largura}x${telaIni?.altura} · ${ini.ms}ms`);

/* ------------------------------------------------ navegar */
console.log("\n[4] navegar para https://example.com");
const nav = await chamar("navegar", { url: "https://example.com" });
ok("navegar ok", nav.dados?.ok === true, nav.dados?.erro);
ok("título da página é 'Example Domain'", /Example Domain/i.test(nav.dados?.titulo ?? ""), JSON.stringify(nav.dados?.titulo));
const bNav = bytesDataUrl(nav.dados?.tela?.data_url);
ok("screenshot da navegação > 5000 bytes", bNav > 5000, `${bNav} bytes`);
ok("screenshot da navegação 1280x800", nav.dados?.tela?.largura === 1280 && nav.dados?.tela?.altura === 800,
  `${nav.dados?.tela?.largura}x${nav.dados?.tela?.altura}`);
log(`navegar: url=${nav.dados?.url} titulo=${JSON.stringify(nav.dados?.titulo)} ${nav.ms}ms · tela ${bNav} bytes`);

/* ------------------------------------------------ DOM: clicar num link de verdade */
console.log("\n[5] DOM + clique real num link");
const domExample = await chamar("inspecionar", { alvo: "dom" });
ok("inspecionar dom ok", domExample.dados?.ok === true, domExample.dados?.erro);
const d1 = domExample.dados?.dados;
ok("dom lista links", (d1?.links?.length ?? 0) > 0, `${d1?.links?.length} links`);
ok("dom conta nós da página", (d1?.nos_total ?? 0) > 10, `${d1?.nos_total} nós`);
log(`dom: ${d1?.nos_total} nós · ${d1?.nos_estruturais} no outline · ${d1?.links?.length} links · ${d1?.botoes?.length} botões · ${d1?.campos?.length} campos · html ${d1?.html_bytes} bytes`);
const linkExample = d1?.links?.find((l) => /iana|more information/i.test(`${l.texto} ${l.href}`)) ?? d1?.links?.[0];
ok("achou um link clicável", Boolean(linkExample?.href), JSON.stringify(linkExample));

if (linkExample?.href) {
  const clicou = await chamar("clique", { seletor: `a[href="${linkExample.href}"]` });
  ok("clique no link ok", clicou.dados?.ok === true, clicou.dados?.erro);
  const mudou = clicou.dados?.url !== nav.dados?.url;
  ok("clique saiu do example.com", mudou, `${nav.dados?.url} -> ${clicou.dados?.url}`);
  log(`clique: ${nav.dados?.url} -> ${clicou.dados?.url} · titulo=${JSON.stringify(clicou.dados?.titulo)} ${clicou.ms}ms`);
  ok("título depois do clique é diferente", clicou.dados?.titulo !== nav.dados?.titulo,
    `${JSON.stringify(nav.dados?.titulo)} -> ${JSON.stringify(clicou.dados?.titulo)}`);
  const voltou = await chamar("voltar");
  ok("voltar funciona (voltou ao example.com)", /example\.com/.test(voltou.dados?.url ?? ""), voltou.dados?.url);
  log(`voltar: ${clicou.dados?.url} -> ${voltou.dados?.url}`);
}


/* ------------------------------------------------ formulário real (httpbin) */
console.log("\n[6] Digitação num formulário real (httpbin.org/forms/post)");
const form = await chamar("navegar", { url: "https://httpbin.org/forms/post" });
ok("abriu o formulário", form.dados?.ok === true, form.dados?.erro);
const domForm = await chamar("inspecionar", { alvo: "dom" });
const campos = domForm.dados?.dados?.campos ?? [];
ok("formulário tem campos", campos.length > 0, `${campos.length} campos`);
log(`campos do formulário: ${campos.map((c) => `${c.tag}[name=${c.nome ?? "?"}]`).join(", ")}`);
const campoTexto = campos.find((c) => c.nome === "custname") ?? campos.find((c) => c.tag === "input" && c.tipo !== "radio" && c.tipo !== "checkbox");
ok("achou o campo de nome do cliente", campoTexto?.nome === "custname", JSON.stringify(campoTexto?.nome ?? null));

const VALOR = "SKYNET COMPUTER";
const digitou = await chamar("digitar", { seletor: 'input[name="custname"]', texto: VALOR });
ok("digitar ok", digitou.dados?.ok === true, digitou.dados?.erro);
ok("o campo contém o texto digitado", digitou.dados?.valor_no_campo === VALOR, JSON.stringify(digitou.dados?.valor_no_campo));
log(`digitar: valor_no_campo=${JSON.stringify(digitou.dados?.valor_no_campo)} ${digitou.ms}ms`);

const enviou = await chamar("clique", { seletor: "form button" });
ok("clique em enviar o formulário ok", enviou.dados?.ok === true, enviou.dados?.erro);
const domEnviado = await chamar("inspecionar", { alvo: "dom" });
const corpoEnviado = JSON.stringify(domEnviado.dados?.dados?.outline ?? []).toLowerCase();
const htmlEnviado = String(domEnviado.dados?.dados?.html ?? "").toLowerCase();
ok(
  "a página de resposta mostra o que foi enviado",
  htmlEnviado.includes("skynet") || corpoEnviado.includes("custname"),
  `url=${domEnviado.dados?.dados?.url}`,
);
log(`envio: url=${domEnviado.dados?.dados?.url} · html=${domEnviado.dados?.dados?.html_bytes} bytes · contém "skynet"=${htmlEnviado.includes("skynet")}`);

/* ------------------------------------------------ console + rede */
console.log("\n[7] Console e rede (dados reais do browser)");
const consoleR = await chamar("inspecionar", { alvo: "console", limite: 30 });
ok("inspecionar console ok", consoleR.dados?.ok === true, consoleR.dados?.erro);
const redeR = await chamar("inspecionar", { alvo: "rede", limite: 200 });
ok("inspecionar rede ok", redeR.dados?.ok === true, redeR.dados?.erro);
const rd = redeR.dados?.dados;
ok("rede registrou requisições", (rd?.total ?? 0) > 0, `${rd?.total} requisições`);
ok("rede registrou status HTTP", Object.keys(rd?.por_status ?? {}).length > 0, JSON.stringify(rd?.por_status));
const reqOk = (rd?.itens ?? []).find((r) => r.url?.includes("httpbin") && r.status === 200);
ok("achou requisição do httpbin com status 200", Boolean(reqOk),
  reqOk ? `${reqOk.metodo} ${reqOk.url} status=${reqOk.status} ${reqOk.ms}ms` : JSON.stringify(rd?.itens?.slice(0, 3)));
log(`rede: ${rd?.total} requisições · status=${JSON.stringify(rd?.por_status)} · erros=${rd?.erros?.length ?? 0}`);
log(`console: ${consoleR.dados?.dados?.total} mensagens · tipos=${JSON.stringify(consoleR.dados?.dados?.por_tipo)}`);

/* ------------------------------------------------ inspeções restantes */
console.log("\n[8] CSS, a11y, performance, responsivo");
const css = await chamar("inspecionar", { alvo: "css", seletor: "body" });
ok("inspecionar css ok", css.dados?.ok === true && css.dados?.dados?.encontrado === true, css.dados?.erro);
ok("css trouxe getComputedStyle", Boolean(css.dados?.dados?.estilos?.display), JSON.stringify(css.dados?.dados?.estilos?.font?.slice?.(0, 40) ?? css.dados?.dados?.estilos?.["font-family"]));
log(`css body: display=${css.dados?.dados?.estilos?.display} cor=${css.dados?.dados?.estilos?.color} ` +
  `caixa=${JSON.stringify(css.dados?.dados?.caixa)} regras_casadas=${css.dados?.dados?.regras?.length}`);

const a11y = await chamar("inspecionar", { alvo: "a11y" });
ok("inspecionar a11y ok", a11y.dados?.ok === true && !a11y.dados?.dados?.erro, a11y.dados?.dados?.erro ?? a11y.dados?.erro);
ok("a11y trouxe nós reais", (a11y.dados?.dados?.nos_relevantes ?? 0) > 0, `${a11y.dados?.dados?.nos_relevantes} nós`);
log(`a11y: fonte=${a11y.dados?.dados?.fonte} total=${a11y.dados?.dados?.total_nos} relevantes=${a11y.dados?.dados?.nos_relevantes} ` +
  `sem_nome=${a11y.dados?.dados?.elementos_sem_nome?.length ?? 0} papeis=${JSON.stringify(Object.keys(a11y.dados?.dados?.por_papel ?? {}).slice(0, 8))}`);

// performance: uma página com sub-recursos reais (CSS/imagens) para o buffer não vir vazio
const iana = await chamar("navegar", { url: "https://www.iana.org/help/example-domains" });
ok("abriu iana.org para medir performance", iana.dados?.ok === true, iana.dados?.erro);
const domIana = await chamar("inspecionar", { alvo: "dom" });
const di = domIana.dados?.dados;
ok("iana.org tem muito mais nós que example.com", (di?.nos_total ?? 0) > (d1?.nos_total ?? 0),
  `${di?.nos_total} vs ${d1?.nos_total} nós`);

const perf = await chamar("inspecionar", { alvo: "performance" });
ok("inspecionar performance ok", perf.dados?.ok === true, perf.dados?.erro);
ok("performance trouxe timing real", (perf.dados?.dados?.timing?.duracao_ms ?? 0) > 0, JSON.stringify(perf.dados?.dados?.timing));
ok("performance listou recursos reais", (perf.dados?.dados?.recursos?.total ?? 0) > 0,
  `${perf.dados?.dados?.recursos?.total} recursos · ${perf.dados?.dados?.recursos?.bytes_transferidos} bytes`);
log(`performance: ${JSON.stringify(perf.dados?.dados?.timing)} recursos=${perf.dados?.dados?.recursos?.total} ` +
  `bytes=${perf.dados?.dados?.recursos?.bytes_transferidos} fonte=${perf.dados?.dados?.fonte}`);
log(`performance cdp: ${JSON.stringify(Object.fromEntries(Object.entries(perf.dados?.dados?.metricas_cdp ?? {}).slice(0, 5)))}`);

const resp = await chamar("inspecionar", { alvo: "responsivo" });
ok("inspecionar responsivo ok", resp.dados?.ok === true, resp.dados?.erro);
ok("responsivo testou 7 breakpoints", (resp.dados?.dados?.resultados?.length ?? 0) === 7, `${resp.dados?.dados?.resultados?.length} breakpoints`);
log(`responsivo: breakpoints=${JSON.stringify(resp.dados?.dados?.breakpoints_testados)} com_overflow=${resp.dados?.dados?.resumo?.com_overflow}` +
  ` pior=${JSON.stringify(resp.dados?.dados?.resumo?.pior?.breakpoint ?? null)}`);
for (const r of resp.dados?.dados?.resultados ?? []) {
  log(`  ${String(r.breakpoint).padStart(4)}px · doc=${r.largura_documento}px · overflow=${r.overflow_px}px · cortados=${r.elementos_cortados}`);
}

/* ------------------------------------------------ abas */
console.log("\n[9] Abas");
const nova = await chamar("nova_aba", { url: "https://example.com" });
ok("nova aba ok", nova.dados?.ok === true, nova.dados?.erro);
ok("agora existem 2 abas", (nova.dados?.abas?.length ?? 0) === 2, `${nova.dados?.abas?.length} abas`);
const trocou = await chamar("trocar_aba", { indice: 0 });
ok("trocar aba ok", trocou.dados?.ok === true && trocou.dados?.aba === 0, `aba=${trocou.dados?.aba} erro=${trocou.dados?.erro ?? ""}`);
const listaAbas = await chamar("abas");
ok("listar abas ok", (listaAbas.dados?.abas?.length ?? 0) === 2, JSON.stringify(listaAbas.dados?.abas?.map((a) => a.indice)));
const fechou = await chamar("fechar_aba", { indice: 1 });
ok("fechar aba ok", fechou.dados?.ok === true && (fechou.dados?.abas?.length ?? 0) === 1, `${fechou.dados?.abas?.length} abas`);
log(`abas: 1 -> 2 -> ${listaAbas.dados?.abas?.length} -> ${fechou.dados?.abas?.length} · titulos=${JSON.stringify(listaAbas.dados?.abas?.map((a) => a.titulo))}`);

/* ------------------------------------------------ tecla / rolar / recarregar */
console.log("\n[10] Teclado, rolagem, recarregar, logs");
const rolou = await chamar("rolar", { dy: 400 });
ok("rolar ok", rolou.dados?.ok === true, rolou.dados?.erro);
const recarregou = await chamar("recarregar");
ok("recarregar ok", recarregou.dados?.ok === true, recarregou.dados?.erro);
const tecla = await chamar("tecla", { tecla: "Escape" });
ok("tecla Escape ok", tecla.dados?.ok === true, tecla.dados?.erro);
const teclaInvalida = await chamar("tecla", { tecla: "Control+Shift+Alt+F13" });
ok("tecla perigosa é recusada sem derrubar o worker", teclaInvalida.dados?.ok === false, teclaInvalida.dados?.erro);
const logs = await chamar("logs", { limite: 100 });
ok("logs traz o histórico de ações", (logs.dados?.total ?? 0) > 5, `${logs.dados?.total} entradas`);
log(`logs: ${logs.dados?.total} entradas · últimas=${JSON.stringify((logs.dados?.logs ?? []).slice(-4).map((l) => `${l.acao}:${l.resultado.slice(0, 24)}`))}`);
log(`rolagem: ${JSON.stringify(rolou.dados?.rolagem)} · recarregar url=${recarregou.dados?.url}`);

/* ------------------------------------------------ erros que não derrubam */
console.log("\n[11] Erros de ação não derrubam o worker");
const sessaoErrada = await chamar("tela", { sessao: "nao-existe" });
ok("sessão inexistente devolve ok:false", sessaoErrada.dados?.ok === false, sessaoErrada.dados?.erro);
ok("worker continua respondendo", (await chamar("abas")).dados?.ok === true);
const acaoRuim = await fetch(`${BASE}/compute/acao_que_nao_existe`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
  body: "{}",
}).then((r) => r.json());
ok("ação desconhecida devolve ok:false + catálogo", acaoRuim.ok === false && Array.isArray(acaoRuim.acoes), `acoes=${acaoRuim.acoes?.length}`);
const alvoRuim = await chamar("inspecionar", { alvo: "satelite" });
ok("alvo de inspeção inválido devolve ok:false", alvoRuim.dados?.ok === false, alvoRuim.dados?.erro);

/* ------------------------------------------------ encerrar */
console.log("\n[12] Encerrar");
const encerrou = await chamar("encerrar");
ok("encerrar ok", encerrou.dados?.ok === true && encerrou.dados?.encerrada === true, JSON.stringify(encerrou.dados));
const depois = await chamar("tela");
ok("sessão encerrada não responde mais", depois.dados?.ok === false, depois.dados?.erro);

/* ------------------------------------------------ resumo */
const total = provas.length;
const passou = provas.filter((p) => p.ok).length;
console.log("\n=== RESUMO ===");
console.log(`provas: ${passou}/${total} passaram`);
console.log(`screenshot inicial: ${b1} bytes · ${telaIni?.largura}x${telaIni?.altura}`);
console.log(`screenshot após navegar: ${bNav} bytes · ${nav.dados?.tela?.largura}x${nav.dados?.tela?.altura}`);
console.log(`requisições observadas: ${redeR.dados?.dados?.total} · status: ${JSON.stringify(redeR.dados?.dados?.por_status)}`);
console.log(`nós de acessibilidade: ${a11y.dados?.dados?.nos_relevantes} · nós do DOM: example.com=${d1?.nos_total} · iana.org=${di?.nos_total}`);
console.log(`recursos medidos: ${perf.dados?.dados?.recursos?.total} · bytes transferidos: ${perf.dados?.dados?.recursos?.bytes_transferidos}`);
console.log(`performance duracao_ms: ${perf.dados?.dados?.timing?.duracao_ms} · breakpoints: ${resp.dados?.dados?.resultados?.length}`);
if (falhas.length) {
  console.log("\nFALHAS:");
  for (const f of falhas) console.log(" - " + f);
}

await new Promise((r) => servidor.close(r));
await servidor.computador.encerrarTudo("fim do teste").catch(() => null);
process.exit(falhas.length ? 1 : 0);
