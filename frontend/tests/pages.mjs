import { chromium } from "playwright";
const ok = (t) => console.log("  ✔ " + t);
const bad = (t) => console.log("  ✘ " + t);
const code = process.env.CODE;
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 100)));

// login
await p.goto("https://mlk010173.github.io/skynetchat/#/login", { waitUntil: "networkidle" });
await p.waitForTimeout(2000);
await p.fill('input[aria-label="Código de acesso"]', code);
await p.click("button:has-text('ENTRAR')");
for (let i = 0; i < 10; i++) { await p.waitForTimeout(1000); if ((await p.locator('input[aria-label="Mensagem"]').count()) > 0) break; }
(await p.locator('input[aria-label="Mensagem"]').count()) > 0 ? ok("login ok") : bad("login falhou");

// /account
await p.goto("https://mlk010173.github.io/skynetchat/#/account", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
const acc = await p.textContent("body");
acc.includes("membro desde") ? ok("/account: perfil com data real") : bad("/account sem perfil");
acc.includes("EMAIL DE RECUPERAÇÃO") ? ok("/account: form de recuperação") : bad("/account sem form");
await p.fill('input[aria-label="Email de recuperação"]', "teste.skynet@exemplo.com");
await p.click("button:has-text('SALVAR')");
await p.waitForTimeout(3500);
(await p.textContent("body")).includes("salvo na conta") ? ok("email de recuperação salvo (endpoint real)") : bad("falha ao salvar email");

// /settings
await p.goto("https://mlk010173.github.io/skynetchat/#/settings", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
const st = await p.textContent("body");
st.includes("TEMA DE FUNDO") && st.includes("NOTIFICAÇÕES") ? ok("/settings: preferências presentes") : bad("/settings incompleta");
await p.click('button:has-text("WHITE")');
await p.waitForTimeout(2500);
(await p.textContent("body")).includes("salvo no servidor") ? ok("preferência persistida no servidor (RLS ok)") : bad("não persistiu");

// /terms
await p.goto("https://mlk010173.github.io/skynetchat/#/terms", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
(await p.textContent("body")).includes("Termos de Serviço") ? ok("/terms: página portada") : bad("/terms ausente");

// desktop
await p.setViewportSize({ width: 1440, height: 900 });
await p.goto("https://mlk010173.github.io/skynetchat/#/", { waitUntil: "networkidle" });
await p.waitForTimeout(2000);
(await p.locator('input[aria-label="Mensagem"]').isVisible()) && (await p.locator('button[aria-label="Abrir menu"]').isVisible())
  ? ok("desktop 1440px: composer e menu acessíveis") : bad("desktop quebrado");

console.log(errs.length ? "── page errors: " + errs.length : "── zero page errors ──");
await b.close();
