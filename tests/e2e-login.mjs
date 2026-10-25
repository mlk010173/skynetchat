// E2E do SKYNET — login real + verificação de sessão + notificações.
// Uso: npm run e2e  (opcional: E2E_EMAIL=... E2E_PASS=... E2E_BASE=...)
// Primeira vez: npx playwright install chromium
import { chromium } from "playwright";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.env.E2E_BASE || "https://mlk010173.github.io/skynetchat";
const EMAIL = process.env.E2E_EMAIL || "teste.clone@skynet.dev";
const PASS = process.env.E2E_PASS || "";

function ok(msg) { console.log("  ✔", msg); }
function fail(msg) { console.error("  ✘", msg); process.exitCode = 1; }

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

try {
  // 1. site no ar + chunk de hidratação acessível
  const res = await page.goto(BASE + "/", { waitUntil: "networkidle" });
  res.status() === 200 ? ok("home 200") : fail("home " + res.status());

  // 2. chunk JS carregou (hidratação possível)
  const chunks = await page.evaluate(
    () => [...document.scripts].map((s) => s.src).filter((s) => s.includes("_next/static/chunks/")),
  );
  chunks.length ? ok(chunks.length + " chunks referenciados") : fail("nenhum chunk JS na página");
  for (const src of chunks.slice(0, 3)) {
    const r = await page.request.get(src);
    r.status() === 200 ? ok("chunk 200: " + src.split("/").pop()) : fail("chunk " + r.status() + ": " + src);
  }

  // 3. React hidratou: espera um elemento controlado pelo app
  await page.waitForSelector("header", { timeout: 15000 });
  ok("header do app renderizado");

  // 4. login (se credenciais fornecidas)
  if (PASS) {
    await page.goto(BASE + "/login/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500); // hidratação
    await page.fill("#email", EMAIL);
    await page.fill("#password", PASS);
    await page.click("button.auth-submit");
    let logged = false, lastErr = "";
    for (let i = 0; i < 15 && !logged; i++) {
      await sleep(1000);
      const body = await page.textContent("body").catch(() => "");
      const errEl = await page.textContent(".auth-status").catch(() => "");
      if (errEl) lastErr = errEl;
      logged = body.includes("SAIR") && !body.includes("Fazer login");
    }
    logged ? ok("login real funcionando (sessão ativa, botão SAIR)") : fail("login não confirmou sessão — URL: " + page.url() + " — erro na tela: " + lastErr);
    if (logged) {
      // 6. painel de notificações com dado real
      const bell = await page.$(".btn-bell");
      if (bell) {
        await bell.click();
        await sleep(800);
        const panel = await page.textContent(".notif-panel").catch(() => "");
        panel.includes("Bem-vindo ao SKYNET") ? ok("notificação de boas-vindas no painel") : fail("painel sem notificação: " + (panel || "não abriu"));
      } else fail("sino de notificações não encontrado");
    }
  } else {
    console.log("  … E2E sem senha: passos de login pulados (E2E_PASS vazio)");
  }

  // 5. erros de página
  errors.length ? fail("erros JS: " + errors.slice(0, 3).join(" | ")) : ok("zero erros de JS no console");
} finally {
  await browser.close();
}
console.log(process.exitCode ? "E2E: FALHOU" : "E2E: PASSOU");
