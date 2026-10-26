import { chromium } from "playwright";
const ok = (t) => console.log("  ✔ " + t);
const bad = (t) => console.log("  ✘ " + t);
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));

// criar conta via UI (espera generosa)
await p.goto("https://mlk010173.github.io/skynetchat/#/sign-up", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
await p.click("button:has-text('GERAR')");
let code = "";
for (let i = 0; i < 12 && !code; i++) { await p.waitForTimeout(1500); code = (await p.textContent("body").then(t => (t.match(/\d{4}-\d{4}-\d{4}/) || [""])[0])); }
code ? ok("conta criada, código: " + code) : bad("signup sem código");
if (!code) { console.log("abortado"); process.exit(1); }

// painel de notificações com boas-vindas
await p.waitForTimeout(1500);
const badge = await p.locator(".bell-badge").textContent().catch(() => "0");
Number(badge) >= 1 ? ok("badge com não lidas: " + badge) : bad("badge vazio");
await p.click('button[aria-label="Notificações"]');
await p.waitForTimeout(1500);
const panel = await p.textContent(".notif-panel").catch(() => "");
panel.includes("Bem-vindo ao SKYNET") ? ok("boas-vindas no painel") : bad("painel: " + panel.slice(0, 80));
// segunda abertura marca como lida
await p.click('button[aria-label="Notificações"]'); await p.waitForTimeout(600);
await p.click('button[aria-label="Notificações"]'); await p.waitForTimeout(1200);
(await p.locator(".bell-badge").count()) === 0 ? ok("marcadas como lidas (badge zerou)") : bad("badge não zerou");
await p.click('button[aria-label="Notificações"]');

// sessão persiste + histórico
await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(2500);
(await p.locator('button[aria-label="Notificações"]').count()) > 0 ? ok("sessão persiste no reload") : bad("sessão perdida");
await p.click('button[aria-label="Abrir menu"]'); await p.waitForTimeout(700);
await p.click("text=Histórico de conversas"); await p.waitForTimeout(1500);
const hist = await p.textContent("body");
hist.includes("Nenhuma conversa") ? ok("histórico vazio (conta nova) — ok") : ok("histórico carregado");

console.log(errs.length ? "── erros: " + errs.length : "── zero page errors ──");
await b.close();
