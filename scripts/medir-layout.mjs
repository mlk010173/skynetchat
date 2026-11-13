#!/usr/bin/env node
// SKYNET · mede overflow horizontal e alvos de toque pequenos em várias larguras,
// usando o Chrome local via DevTools Protocol (sem dependências).
//
// uso:  node scripts/medir-layout.mjs [rota-hash] [larguras,separadas,por,virgula]
//   ex: node scripts/medir-layout.mjs "#/" 360,390,430,768,1280,1440
// Saída: tabela por largura + capturas em /tmp/layout-<largura>.png
// A rede precisa alcançar a Open-Meteo para o clima carregar de verdade.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL("..", import.meta.url)), "site", "app");
const ROTA = process.argv[2] || "#/";
const LARGURAS = (process.argv[3] || "360,390,430,768,1280,1440").split(",").map(Number).filter(Boolean);
const PORTA = 4790 + Math.floor(Math.random() * 100);
const DEBUG = 9300 + Math.floor(Math.random() * 100);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const servidor = createServer(async (req, res) => {
  const caminho = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  try {
    const arq = caminho.endsWith("/") ? join(RAIZ, caminho, "index.html") : join(RAIZ, caminho);
    const corpo = await readFile(arq);
    res.writeHead(200, { "content-type": MIME[extname(arq)] || "application/octet-stream" });
    res.end(corpo);
  } catch {
    res.writeHead(404).end("nao encontrado");
  }
});
await new Promise((ok) => servidor.listen(PORTA, "127.0.0.1", ok));

const chrome = spawn("google-chrome", [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  `--remote-debugging-port=${DEBUG}`, "--user-data-dir=/tmp/chrome-medir-" + DEBUG, "about:blank",
], { stdio: "ignore" });

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function alvoWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const lista = await (await fetch(`http://127.0.0.1:${DEBUG}/json`)).json();
      const pagina = lista.find((t) => t.type === "page");
      if (pagina) return pagina.webSocketDebuggerUrl;
    } catch { /* ainda subindo */ }
    await dormir(250);
  }
  throw new Error("Chrome não abriu a porta de depuração");
}

const ws = new WebSocket(await alvoWs());
await new Promise((ok, falha) => { ws.onopen = ok; ws.onerror = falha; });
let seq = 0;
const pendentes = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pendentes.has(d.id)) { pendentes.get(d.id)(d); pendentes.delete(d.id); }
};
const cdp = (method, params = {}) => new Promise((ok) => { const id = ++seq; pendentes.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
const avaliar = async (expressao) => {
  const r = await cdp("Runtime.evaluate", { expression: expressao, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

const MEDIDOR = `(() => {
  const larg = document.documentElement.clientWidth;
  const estouram = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "fixed") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // ignora o que está dentro de uma área que rola de propósito
    let rolavel = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if ((o === "auto" || o === "scroll") && p.scrollWidth > p.clientWidth) { rolavel = true; break; }
    }
    if (!rolavel && (r.right > larg + 1 || r.left < -1)) estouram.push((el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : el.tagName.toLowerCase()) + " (" + Math.round(r.left) + ".." + Math.round(r.right) + ")");
  }
  const pequenos = [];
  for (const el of document.querySelectorAll("button, a[href], input, [role=button], [role=tab]")) {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || !r.width) continue;
    if (r.height < 32 || r.width < 32) pequenos.push((el.getAttribute("aria-label") || el.textContent || el.className || el.tagName).toString().trim().slice(0, 28) + " " + Math.round(r.width) + "x" + Math.round(r.height));
  }
  return {
    largura: larg,
    rolagemHorizontal: document.documentElement.scrollWidth > larg + 1,
    scrollWidth: document.documentElement.scrollWidth,
    estouram: [...new Set(estouram)].slice(0, 8),
    pequenos: [...new Set(pequenos)].slice(0, 8),
    temClima: !!document.querySelector(".wx"),
    bannerVisivel: !!document.querySelector(".ck-banner"),
    erroReact: /Algo quebrou nesta tela/.test(document.body.innerText),
  };
})()`;

await cdp("Page.enable");
const resultados = [];
for (const w of LARGURAS) {
  await cdp("Emulation.setDeviceMetricsOverride", { width: w, height: w < 600 ? 800 : 900, deviceScaleFactor: 1, mobile: w < 600 });
  await cdp("Page.navigate", { url: `http://127.0.0.1:${PORTA}/${ROTA}` });
  await dormir(4500);
  const m = await avaliar(MEDIDOR);
  resultados.push(m);
  const shot = await cdp("Page.captureScreenshot", { format: "png" });
  await writeFile(`/tmp/layout-${w}.png`, Buffer.from(shot.result.data, "base64"));
  console.log(`\n== ${w}px ==`);
  console.log(`  rolagem horizontal: ${m.rolagemHorizontal ? "SIM (scrollWidth " + m.scrollWidth + ")" : "não"}  | clima: ${m.temClima ? "sim" : "não"}  | banner: ${m.bannerVisivel ? "sim" : "não"}  | erro React: ${m.erroReact ? "SIM" : "não"}`);
  if (m.estouram.length) console.log("  estouram a tela:", m.estouram.join(" | "));
  if (m.pequenos.length) console.log("  alvos < 32px:", m.pequenos.join(" | "));
}

ws.close();
chrome.kill("SIGKILL");
servidor.close();
const problemas = resultados.filter((m) => m.rolagemHorizontal || m.erroReact).length;
console.log(`\n${problemas ? "FALHOU" : "OK"}: ${problemas} largura(s) com rolagem horizontal ou erro.`);
process.exit(problemas ? 1 : 0);
