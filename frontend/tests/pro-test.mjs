import { chromium } from "playwright";
const ok = (t) => console.log("  ✔ " + t);
const bad = (t) => console.log("  ✘ " + t);
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
await p.goto("https://mlk010173.github.io/skynetchat/#/", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
// chat anônimo → resposta com ações
await p.fill('input[aria-label="Mensagem"]', "diga ok");
await p.click("button.dock-send");
for (let i = 0; i < 20; i++) { await p.waitForTimeout(1000); const body = await p.textContent("body"); if (body.includes("Trabalhou por")) break; }
const body = await p.textContent("body");
body.includes("Trabalhou por") ? ok("tempo real da resposta exibido") : bad("sem 'Trabalhou por'");
body.includes("Assinar SKYNETchat PRO") ? ok("link PRO no rodapé do chat") : bad("sem link PRO");
(await p.locator("button:has-text('Copiar')").count()) > 0 ? ok("botão Copiar real") : bad("sem Copiar");
await p.click("button:has-text('Editar')");
(await p.inputValue('input[aria-label="Mensagem"]') || "").length > 0 ? ok("Editar devolve texto ao composer") : bad("Editar não preencheu");
// link PRO abre o modal na aba Assinatura
await p.click("a.pro-link");
await p.waitForTimeout(2500);
const modal = await p.textContent("body");
modal.includes("Conta FREE") && modal.includes("ASSINAR PRO") ? ok("modal PRO com abas e CTA verde") : bad("modal não abriu: " + modal.slice(0, 100));
modal.includes("Seja PRO") ? ok("CTA 'Seja PRO' presente") : bad("sem CTA");
// abas (convidado: estado honesto)
await p.click('.pro-tab:has-text("Conta")');
(await p.textContent("body")).includes("Entre na sua conta") ? ok("aba Conta honesta para convidado") : bad("aba Conta vazia");
// placeholder rotativo
await p.goto("https://mlk010173.github.io/skynetchat/#/", { waitUntil: "networkidle" });
await p.waitForTimeout(2000);
await p.waitForTimeout(6500);
const ph = await p.getAttribute('input[aria-label="Mensagem"]', "placeholder");
["Pergunte sem medo.", "Vá além", "Sem filtros, sem limites.", "Pesquise sem censura..."].includes(ph) ? ok("placeholder rotativo: '" + ph + "'") : bad("placeholder estático: " + ph);
console.log(errs.length ? "PAGE ERRORS: " + errs : "zero page errors");
await b.close();
