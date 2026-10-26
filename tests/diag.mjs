import { chromium } from "playwright";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message.slice(0, 200)));
await p.goto("https://mlk010173.github.io/skynetchat/#/", { waitUntil: "networkidle" });
await p.waitForTimeout(2000);

await p.click('button[aria-label="Abrir menu"]');
await p.waitForTimeout(800);
console.log("aside classes:", await p.getAttribute("aside", "class"));
const btn = p.locator('button[aria-label="Fechar menu"]');
console.log("botão fechar count:", await btn.count(), "| visível:", await btn.first().isVisible().catch(e => "err: " + e.message.slice(0, 80)));
const bb = await btn.first().boundingBox().catch(() => null);
console.log("boundingBox do fechar:", bb ? `x=${bb.x} y=${bb.y}` : "FORA DA TELA/oculto");
// clicar via coordenada se estiver visível
if (bb) { await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(700); console.log("após clique no X, aside:", await p.getAttribute("aside", "class")); }
// scrim
await p.click('button[aria-label="Abrir menu"]'); await p.waitForTimeout(600);
await p.evaluate(() => document.querySelector(".scrim").click());
await p.waitForTimeout(700);
console.log("após clique no scrim, aside:", await p.getAttribute("aside", "class"));
console.log("erros:", errs.length ? errs : "nenhum");
await b.close();
