import { chromium } from "playwright";

const BASE_URL = process.env.TEST_URL || "https://mlk010173.github.io/skynetchat/#";
console.log("Iniciando teste E2E Playwright da Central de Automações em:", BASE_URL);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
const page = await ctx.newPage();

page.on("response", (res) => {
  if (res.status() === 401) {
    console.error(`[401 HTTP] ${res.request().method()} ${res.url()}`);
  }
});

const consoleErrs = [];
page.on("pageerror", (e) => {
  console.error("PageError:", e.message);
  consoleErrs.push(e.message);
});
page.on("console", (m) => {
  if (m.type() === "error") {
    const txt = m.text();
    if (!txt.includes("favicon") && !txt.includes("404") && !txt.includes("429")) {
      console.error("ConsoleError:", txt);
      consoleErrs.push(txt);
    }
  }
});

page.on("dialog", async (dialog) => {
  console.log(`[Dialog ${dialog.type()}]: ${dialog.message()}`);
  await dialog.accept();
});

try {
  // 1. Visitar site
  console.log("Acessando site...");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // 2. Signup ou Login via /functions/v1/auth-code + setSession completo
  console.log("Obtendo sessão autenticada...");
  const authRes = await page.evaluate(async () => {
    const supaUrl = "https://rkgwhhtenfozdwzpvxjj.supabase.co";
    const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrZ3doaHRlbmZvemR3enB2eGpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NTY2OTQsImV4cCI6MjEwODUzMjY5NH0.FRwfO66wi1ADFmSboCCwH1NWuz-212dDrIcuuiZ-0HA";
    let r = await fetch(`${supaUrl}/functions/v1/auth-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey },
      body: JSON.stringify({ action: "signup" }),
    });
    let data = await r.json();
    if (!data.ok) {
      r = await fetch(`${supaUrl}/functions/v1/auth-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anonKey },
        body: JSON.stringify({ action: "login", code: "477470711919" }),
      });
      data = await r.json();
    }
    return data;
  });

  if (!authRes.ok || !authRes.session) {
    throw new Error(`Falha na autenticação: ${JSON.stringify(authRes)}`);
  }

  // Set session via client on the page
  await page.evaluate(async (sess) => {
    const supaUrl = "https://rkgwhhtenfozdwzpvxjj.supabase.co";
    const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrZ3doaHRlbmZvemR3enB2eGpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NTY2OTQsImV4cCI6MjEwODUzMjY5NH0.FRwfO66wi1ADFmSboCCwH1NWuz-212dDrIcuuiZ-0HA";
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const client = createClient(supaUrl, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "skynet-session" }
    });
    await client.auth.setSession({
      access_token: sess.access_token,
      refresh_token: sess.refresh_token
    });
  }, authRes.session);

  console.log("✔ Autenticação obtida com sucesso!");

  // Recarregar para a UI atualizar o estado de logged
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // 3. Abrir Drawer
  console.log("Abrindo Drawer menu...");
  const menuBtn = page.locator('button[aria-label="Abrir menu"]');
  await menuBtn.click();
  await page.waitForTimeout(1000);

  // 4. Clicar em 'Automações'
  console.log("Clicando no painel 'Automações'...");
  const autoBtn = page.locator("button.drawer-item:has-text('Automações')");
  await autoBtn.click();
  await page.waitForTimeout(2000);

  // Verificar título do painel
  const panelTitle = await page.locator(".panel-title").textContent().catch(() => "");
  console.log("Título do painel exibido:", panelTitle.trim());

  // Criar automação 'Teste E2E Automacao <hora>'
  const nowStr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const testAutoName = `Teste E2E Automacao ${nowStr}`;
  const testPrompt = "Diga a palavra SUCESSO em maiúsculas";

  console.log(`Preenchendo formulário para "${testAutoName}"...`);
  const nameInput = page.locator('input[placeholder*="Resumo de notícias"]');
  await nameInput.waitFor({ state: "visible", timeout: 10000 });
  await nameInput.fill(testAutoName);

  const promptInput = page.locator('textarea[placeholder*="Pesquise a cotação"]');
  await promptInput.fill(testPrompt);

  const createBtn = page.locator('button:has-text("Criar Automação")');
  await createBtn.click();

  console.log("Aguardando criação da automação...");
  await page.waitForTimeout(3000);

  // Verificar se aparece na lista
  const autoCard = page.locator(`.panel-card:has-text("${testAutoName}")`).first();
  await autoCard.waitFor({ state: "visible", timeout: 10000 });
  console.log(`✔ Automação "${testAutoName}" criada com sucesso!`);

  // 6. Clicar em 'Executar agora'
  console.log("Clicando em 'Executar agora'...");
  const execBtn = autoCard.locator('button:has-text("Executar agora")');
  await execBtn.click();

  console.log("Aguardando conclusão da execução...");
  await page.waitForTimeout(12000);

  // 7. Verificar histórico de runs
  console.log("Verificando histórico de execuções...");
  const runCard = page.locator(`.panel-card:has-text("${testAutoName}")`).last();
  const runText = await runCard.textContent().catch(() => "");
  console.log("Resultado da run no histórico:", runText.trim().replace(/\s+/g, " "));

  // 8. Apagar a automação no fim
  console.log("Limpando: Apagando automação de teste...");
  const deleteBtn = autoCard.locator('button:has-text("Apagar")');
  await deleteBtn.click();
  await page.waitForTimeout(3000);

  const cardCountAfterDel = await page.locator(`.panel-card:has-text("${testAutoName}")`).count();
  if (cardCountAfterDel === 0) {
    console.log(`✔ Automação "${testAutoName}" apagada com sucesso!`);
  }

  console.log("\nConsole errors:", consoleErrs.length ? JSON.stringify(consoleErrs) : "0 erros de console!");

  if (consoleErrs.length > 0) {
    throw new Error(`Encontrados ${consoleErrs.length} erros de console durante o teste.`);
  }

  console.log("\n✔ TESTE PLAYWRIGHT FINALIZADO COM SUCESSO!");
} catch (err) {
  console.error("✘ Erro no teste Playwright:", err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
