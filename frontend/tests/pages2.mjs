import { chromium } from "playwright";
const code = process.env.CODE;
const ok = (t) => console.log("  ✔ " + t);
const bad = (t) => console.log("  ✘ " + t);
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await p.goto("https://mlk010173.github.io/skynetchat/#/login", { waitUntil: "networkidle" });
await p.waitForTimeout(2000);
await p.fill('input[aria-label="Código de acesso"]', code);
await p.click("button:has-text('ENTRAR')");
for (let i = 0; i < 10; i++) { await p.waitForTimeout(1000); if ((await p.locator('input[aria-label="Mensagem"]').count()) > 0) break; }
(await p.locator('input[aria-label="Mensagem"]').count()) > 0 ? ok("login ok") : bad("login falhou");
await p.goto("https://mlk010173.github.io/skynetchat/#/account", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
await p.fill('input[aria-label="Email de recuperação"]', "minha.conta@exemplo.com");
await p.click("button:has-text('SALVAR')");
await p.waitForTimeout(4000);
(await p.textContent("body")).includes("salvo na conta") ? ok("email de recuperação salvo pela UI") : bad("falha ao salvar email pela UI");
await b.close();
