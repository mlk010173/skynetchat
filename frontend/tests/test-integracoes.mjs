import { chromium } from "playwright";

const BASE_URL = "https://mlk010173.github.io/skynetchat/#";
console.log("Iniciando teste E2E Playwright de Integrações na URL:", `${BASE_URL}/integracoes`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
const page = await ctx.newPage();

const consoleErrs = [];
page.on("pageerror", (e) => consoleErrs.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrs.push(m.text());
});

// 1. Acessar site na rota /integracoes
console.log("\n--- TESTE 1: Navegação direta para /integracoes ---");
await page.goto(`${BASE_URL}/integracoes`, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

// Verificar título e elementos
const termTop = await page.locator(".term-top").textContent().catch(() => "");
console.log("Título do Terminal:", termTop.trim());

// Aguardar carregamento dos cards de integração
await page.waitForSelector(".integracao-card", { timeout: 10000 });
const cardCount = await page.locator(".integracao-card").count();
console.log(`Encontrados ${cardCount} cards de integração.`);

const integracoesLidas = [];
for (let i = 0; i < cardCount; i++) {
  const card = page.locator(".integracao-card").nth(i);
  const title = (await card.locator("h3").textContent()).trim();
  const idText = (await card.locator("p").first().textContent()).trim();
  const badge = (await card.locator(".badge-status").textContent()).trim();
  const detail = (await card.locator("span").last().textContent()).trim();

  integracoesLidas.push({ title, idText, badge, detail });
  console.log(`[${i + 1}] ${title} (${idText}) -> Status: ${badge} | Detalhe: "${detail}"`);
}

// 2. Testar o botão 'Testar' em um card
console.log("\n--- TESTE 2: Clicar no botão 'Testar' ao vivo ---");
const testBtn = page.locator(".integracao-card button").first();
console.log("Clicando no botão 'Testar' do primeiro card (agente)...");
await testBtn.click();

// Aguardar atualização ao vivo
await page.waitForTimeout(3000);
const updatedBadge = (await page.locator(".integracao-card .badge-status").first().textContent()).trim();
console.log("Badge do primeiro card após re-teste ao vivo:", updatedBadge);

// 3. Teste de Navegação via Drawer
console.log("\n--- TESTE 3: Navegação via Drawer ---");
await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

// Abrir drawer menu usando aria-label "Abrir menu"
const menuBtn = page.locator('button[aria-label="Abrir menu"]');
if (await menuBtn.count() > 0) {
  await menuBtn.click();
  await page.waitForTimeout(1000);

  // Clicar em Integrações
  const integracoesDrawerBtn = page.locator("button.drawer-item:has-text('Integrações')");
  if (await integracoesDrawerBtn.count() > 0) {
    console.log("Clicando no item 'Integrações' dentro do Drawer...");
    await integracoesDrawerBtn.click();
    await page.waitForTimeout(3000);

    const navUrl = page.url();
    console.log("URL após clicar no Drawer:", navUrl);
    if (navUrl.includes("integracoes")) {
      console.log("✔ SUCESSO: Navegação via Drawer redirecionou corretamente para /integracoes!");
    } else {
      console.log("✘ FALHA: URL não contém 'integracoes':", navUrl);
    }
  } else {
    console.log("✘ Item 'Integrações' não encontrado no Drawer.");
  }
} else {
  console.log("✘ Botão de menu do Drawer não encontrado.");
}

console.log("\nConsole errors:", consoleErrs.length ? JSON.stringify(consoleErrs) : "Nenhum");

await browser.close();
