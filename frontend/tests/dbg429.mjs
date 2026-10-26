import { chromium } from "playwright";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await p.goto("https://mlk010173.github.io/skynetchat/#/login", { waitUntil: "networkidle" });
await p.waitForTimeout(2000);
// 11 tentativas inválidas para estourar o limite
for (let i = 0; i < 11; i++) {
  await p.fill('input[aria-label="Código de acesso"]', "111122223333");
  await p.click("button:has-text('ENTRAR')");
  await p.waitForTimeout(900);
}
await p.fill('input[aria-label="Código de acesso"]', "9662-5097-8642");
await p.click("button:has-text('ENTRAR')");
await p.waitForTimeout(3000);
const err = await p.textContent(".auth-error").catch(() => "(SEM ERRO EXIBIDO)");
console.log("mensagem exibida após 429:", err);
await b.close();
