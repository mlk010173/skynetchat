import { chromium } from "playwright";

const BASE_URL = "https://mlk010173.github.io/skynetchat/#";
console.log("Iniciando teste E2E Playwright de E-mail...");
const ok = (t) => console.log("  ✔ " + t);
const bad = (t) => console.log("  ✘ " + t);

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

// 2. Login real pela UI com código de 12 dígitos (mesmo fluxo do usuario)
console.log("Criando conta pela UI (código de 12 dígitos)...");
await page.goto(BASE_URL + "/sign-up", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.click("button:has-text('GERAR')");
await page.waitForTimeout(4500);
const code = (await page.textContent("body").then((t) => (t.match(/\d{4}-\d{4}-\d{4}/) || [""])[0]));
console.log("Código gerado:", code);
await page.click("button:has-text('ENTRAR')");
await page.waitForTimeout(3000);
const logged = (await page.locator('input[aria-label="Mensagem"]').count()) > 0;
logged ? ok("logado pela UI após criar conta") : bad("login pela UI falhou");

// 3. Abrir Drawer
console.log("Abrindo Drawer...");
await page.click('button[aria-label="Abrir menu"]');
await page.waitForTimeout(1000);

// 4. Clicar em E-mail no Drawer
console.log("Clicando em E-mail...");
await page.locator("button.drawer-item:has-text('E-mail')").click();
await page.waitForTimeout(1500);
const panelTitle = (await page.locator(".panel-title").first().textContent().catch(() => "")).trim();
panelTitle.includes("E-MAIL") ? ok("painel abriu: " + panelTitle) : bad("painel de e-mail não abriu: " + panelTitle);

// aguarda carregamento da lista
await page.waitForTimeout(6000);
const panelText = ((await page.locator(".drawer-list.panel").first().textContent().catch(() => "")) || "").replace(/\s+/g, " ");
if (/Requer login/.test(panelText)) bad("painel pediu login mesmo com sessão ativa");
if (/token expirado|Token do Gmail expirado/i.test(panelText)) ok("estado honesto: token do Gmail expirado");
if (/pendente de configura/i.test(panelText)) ok("estado honesto: integração pendente de configuração");

const rows = page.locator('.drawer-list.panel div[style*="cursor: pointer"]');
const n = await rows.count();
console.log("E-mails listados:", n);
if (n > 0) {
  const firstText = ((await rows.first().textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim();
  console.log("Primeiro item:", firstText.slice(0, 160));
  ok("lista de e-mails REAIS carregada (" + n + " itens)");

  // 5. Abrir a primeira mensagem e conferir o corpo
  await rows.first().click();
  await page.waitForTimeout(4000);
  const readText = ((await page.locator(".drawer-list.panel").first().textContent().catch(() => "")) || "").replace(/\s+/g, " ");
  const hasFrom = /De:/.test(readText);
  const hasBody = readText.length > 260;
  console.log("Corpo da mensagem (trecho):", readText.slice(0, 220));
  hasFrom && hasBody ? ok("mensagem aberta com remetente e corpo") : bad("mensagem abriu sem remetente/corpo");
} else {
  bad("nenhum e-mail listado (token do Gmail pode ter expirado durante o teste)");
}

console.log("\nConsole errors:", consoleErrs.length ? JSON.stringify(consoleErrs) : "Nenhum");
await browser.close();
