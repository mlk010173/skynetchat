import { chromium } from "playwright";
const ok = (t) => console.log("  ✔ " + t);
const bad = (t) => console.log("  ✘ " + t);
const B = "https://mlk010173.github.io/skynetchat/#";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 150)));
await p.goto(B + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(3000);

// 1. dropdown de modelos com ferramentas live
await p.click('button[aria-label="Escolher modelo"]');
await p.waitForTimeout(1500);
const mp = await p.textContent(".model-panel").catch(() => "");
mp.includes("MODELOS") ? ok("dropdown com seção MODELOS") : bad("dropdown não abriu");
mp.includes("FERRAMENTAS DO AGENTE") && mp.includes("web_pesquisar") ? ok("ferramentas reais do agente listadas (live)") : bad("sem ferramentas live: " + mp.slice(0, 80));
await p.locator('.mp-item').first().click();
await p.waitForTimeout(400);
(await p.locator(".model-panel").count()) === 0 ? ok("seleção de modelo fecha o dropdown") : bad("dropdown não fechou");

// 2. menu do + com 6 itens
await p.click('button[aria-label="Mais"]');
await p.waitForTimeout(600);
const pm = await p.textContent(".plus-menu").catch(() => "");
["Adicionar fotos", "Criar imagem", "Pensar", "Investigar", "Gerar código", "Traduzir"].every((t) => pm.includes(t)) ? ok("menu + com 6 itens fiéis") : bad("menu + incompleto");
await p.click('.plus-menu button:has-text("Traduzir")');
await p.waitForTimeout(500);
(await p.inputValue('input[aria-label="Mensagem"]')).startsWith("Traduza") ? ok("ação Traduzir preenche o composer") : bad("traduzir não preencheu");

// 3. criar imagem REAL (flux-3 no agente)
await p.click('button[aria-label="Mais"]');
await p.click('.plus-menu button:has-text("Criar imagem")');
await p.fill('input[aria-label="Prompt de imagem"]', "logo skynet vermelho");
await p.click('.img-actions button:has-text("gerar")');
let img = null;
for (let i = 0; i < 40; i++) { await p.waitForTimeout(1500); img = await p.locator(".gen-img").count(); if (img > 0) break; }
img > 0 ? ok("imagem REAL gerada e exibida (flux-3)") : bad("imagem não gerou (agente pode estar dormindo)");
console.log(errs.length ? "PAGE ERRORS: " + errs : "── zero page errors ──");
await b.close();
