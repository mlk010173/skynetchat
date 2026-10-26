import { chromium } from "playwright";
const ok = (t) => console.log("  ✔ " + t);
const bad = (t) => console.log("  ✘ " + t);
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
await p.goto("https://mlk010173.github.io/skynetchat/#/", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
(await p.textContent("body")).includes("Apresentamos o SKYNETchat") ? ok("home ok") : bad("home quebrada");
await p.fill('input[aria-label="Mensagem"]', "responda com uma palavra: ok");
await p.click("button.dock-send");
for (let i = 0; i < 25; i++) { await p.waitForTimeout(1000); const t = await p.textContent("body"); if (t.includes("Trabalhou por")) break; }
(await p.textContent("body")).includes("Trabalhou por") ? ok("chat com IA real + tempo exibido") : bad("chat sem resposta");
(await p.locator("button:has-text('Copiar')").count()) > 0 ? ok("ações de mensagem presentes") : bad("sem ações");
(await p.textContent("body")).includes("Assinar SKYNETchat PRO") ? ok("link PRO no rodapé") : bad("sem link PRO");
// desktop também
const d = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await d.goto("https://mlk010173.github.io/skynetchat/#/", { waitUntil: "networkidle" });
await d.waitForTimeout(2000);
(await d.locator('input[aria-label="Mensagem"]').count()) > 0 && (await d.locator('button[aria-label="Abrir menu"]').count()) > 0 ? ok("desktop 1440px ok") : bad("desktop quebrado");
console.log(errs.length ? "PAGE ERRORS: " + errs : "zero page errors");
await b.close();
