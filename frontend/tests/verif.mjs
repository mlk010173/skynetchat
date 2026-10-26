import { chromium } from "playwright";
const ok = (t) => console.log("  ✔ " + t);
const bad = (t) => console.log("  ✘ " + t);
const B = "https://mlk010173.github.io/skynetchat/#";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();

// 1. convidado: modal Assinatura + aba Conta honesta
await p.goto(B + "/account?tab=assinatura", { waitUntil: "networkidle" });
await p.waitForTimeout(3000);
let body = await p.textContent("body");
body.includes("ASSINAR PRO") && body.includes("Seja PRO") ? ok("convidado vê o modal PRO (Assinatura)") : bad("modal não abriu p/ convidado");
await p.click('.pro-tab:has-text("Conta")');
await p.waitForTimeout(800);
body = await p.textContent("body");
body.includes("Entre na sua conta") ? ok("aba Conta honesta p/ convidado") : bad("aba Conta convidado: " + body.slice(0, 90));

// 2. placeholder rotativo na home
await p.goto(B + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
const p1 = await p.getAttribute('input[aria-label="Mensagem"]', "placeholder");
await p.waitForTimeout(6200);
const p2 = await p.getAttribute('input[aria-label="Mensagem"]', "placeholder");
p1 !== p2 ? ok(`placeholder rotativo (${p1} → ${p2})`) : bad("placeholder estático: " + p1);

// 3. logado: conta com dados reais
const code = process.env.CODE;
await p.goto(B + "/login", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
await p.fill('input[aria-label="Código de acesso"]', code);
await p.click("button:has-text('ENTRAR')");
for (let i = 0; i < 12; i++) { await p.waitForTimeout(1000); if ((await p.locator('input[aria-label="Mensagem"]').count()) > 0) break; }
await p.goto(B + "/account", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
body = await p.textContent("body");
body.includes("Membro desde") && body.includes("EMAIL DE RECUPERAÇÃO") ? ok("conta logada com dados reais") : bad("conta logada sem dados");
await b.close();
