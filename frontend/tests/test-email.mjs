import { chromium } from "playwright";
import json from "fs";

const BASE_URL = "https://mlk010173.github.io/skynetchat/#";
console.log("Iniciando teste E2E Playwright de E-mail...");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
const page = await ctx.newPage();

const consoleErrs = [];
page.on("pageerror", (e) => consoleErrs.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrs.push(m.text());
});

// 1. Visitar site
await page.goto(BASE_URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

// 2. Fazer Signup / Login via código de 12 dígitos para ter sessão real
console.log("Realizando signup para obter sessão Supabase...");
const res = await page.evaluate(async () => {
  const supaUrl = "https://rkgwhhtenfozdwzpvxjj.supabase.co";
  const anonKey = "0a22d59e6939c7a459b75993c379b2a3044962163173842aa92b31ce0f02f96d";
  const r = await fetch(`${supaUrl}/functions/v1/auth-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey },
    body: JSON.stringify({ action: "signup" })
  });
  const data = await r.json();
  if (data.ok && data.session) {
    localStorage.setItem("skynet-session", JSON.stringify(data.session));
  }
  return data;
});

console.log("Signup ok:", res.ok);

// Recarregar página para restaurar sessão no frontend
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);

// 3. Abrir Drawer
console.log("Abrindo Drawer...");
const menuBtn = page.locator('button[aria-label="Abrir menu"]');
await menuBtn.click();
await page.waitForTimeout(1000);

// 4. Clicar em E-mail no Drawer
console.log("Clicando em E-mail...");
const emailBtn = page.locator("button.drawer-item:has-text('E-mail')");
await emailBtn.click();
await page.waitForTimeout(3000);

// 5. Verificar painel de E-mail
const panelTitle = await page.locator(".panel-title").textContent().catch(() => "");
console.log("Título do painel exibido:", panelTitle.trim());

// Aguardar carregamento da lista de e-mails
await page.waitForTimeout(3000);

const hasEmails = await page.locator(".drawer-list.panel small").count();
console.log("Elementos de e-mail na lista:", hasEmails);

const firstFrom = await page.locator(".drawer-list.panel strong").first().textContent().catch(() => "");
const firstSubject = await page.locator(".drawer-list.panel div[style*='60a5fa']").first().textContent().catch(() => "");

console.log("Primeiro E-mail Remetente:", firstFrom);
console.log("Primeiro E-mail Assunto:", firstSubject);

console.log("\nConsole errors:", consoleErrs.length ? JSON.stringify(consoleErrs) : "Nenhum");

await browser.close();
