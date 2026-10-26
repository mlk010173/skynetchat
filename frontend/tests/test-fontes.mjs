import { chromium } from "playwright";

const B = "https://mlk010173.github.io/skynetchat/#";
console.log("Iniciando testes E2E ao vivo na URL:", B);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

const consoleErrs = [];
page.on("pageerror", (e) => consoleErrs.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrs.push(m.text());
});

// 1. Acessar site
await page.goto(B + "/", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

// 2. Teste de Busca com Ferramentas
console.log("\n--- TESTE 1: Pergunta com Busca de Notícias de IA ---");
const input = page.locator('input[aria-label="Mensagem"]');
await input.fill("pesquise notícias de IA hoje");
await page.click("button.dock-send");

// Aguarda aparecer o status ou fontes
console.log("Aguardando streaming e execução da ferramenta...");
await page.waitForTimeout(15000);

const bodyText = await page.textContent("body");
console.log("Resposta parcial do body (últimos 300 chars):", bodyText.slice(-300));

// Verificar se fontes apareceram
const chipLocator = page.locator(".fonte-chip");
const chipCount = await chipLocator.count();
console.log(`Encontrados ${chipCount} chips de fonte.`);

const fontesCapturadas = [];
for (let i = 0; i < chipCount; i++) {
  const chip = chipLocator.nth(i);
  const titulo = (await chip.textContent()).trim();
  const href = await chip.getAttribute("href");
  fontesCapturadas.push({ titulo, href });
  console.log(`[Fonte ${i + 1}] Título: "${titulo}" | URL: ${href}`);
}

const notaText = await page.locator(".fontes-nota").textContent().catch(() => null);
if (notaText) {
  console.log("Nota de horário:", notaText.trim());
}

if (chipCount > 0 && fontesCapturadas.every(f => f.href && f.href.startsWith("http"))) {
  console.log("✔ SUCESSO: Chips de fontes exibidos corretamente com URLs http!");
} else {
  console.log("✘ ALERTA: Nenhum chip ou URL inválida!");
}

// 3. Teste de Regressão (Chat sem Ferramenta)
console.log("\n--- TESTE 2: Regressão - Chat Simples sem Ferramenta ---");
// Abrir novo chat
const newChatBtn = page.locator('button[aria-label="Novo chat"]');
if (await newChatBtn.count() > 0) {
  await newChatBtn.click();
  await page.waitForTimeout(1000);
}

await input.fill("o que e javascript em poucas palavras?");
await page.click("button.dock-send");
await page.waitForTimeout(7000);

const regText = await page.textContent(".thread");
const regChips = await page.locator(".fonte-chip").count();

console.log("Resposta da regressão (primeiros 200 chars):", regText.slice(0, 200));
console.log("Chips no chat simples:", regChips);

if (regText.length > 50 && regChips === 0) {
  console.log("✔ SUCESSO: Chat de regressão respondeu normalmente sem emitir chips de ferramentas!");
} else {
  console.log("✘ FALHA no teste de regressão.");
}

console.log("Console errors:", consoleErrs.length ? JSON.stringify(consoleErrs) : "Nenhum");

await browser.close();
