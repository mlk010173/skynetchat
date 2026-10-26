import { chromium } from "playwright";
const B = "https://mlk010173.github.io/skynetchat/#/";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
p.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text().slice(0, 300)); });
p.on("requestfailed", (r) => errors.push("REQFAIL: " + r.url().slice(0, 120) + " " + (r.failure()?.errorText || "")));

console.log("── 1. abrir home anônimo ──");
await p.goto(B, { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
console.log("hero:", (await p.textContent("body")).includes("Apresentamos"));

console.log("── 2. drawer abre/fecha ──");
await p.click('button[aria-label="Abrir menu"]');
await p.waitForTimeout(600);
console.log("abriu:", (await p.textContent("body")).includes("Fazer login"));
await p.click('button[aria-label="Fechar menu"]');
await p.waitForTimeout(600);
console.log("fechou:", !(await p.locator("aside").first().isVisible?.() ?? true));

console.log("── 3. painel (widget) abre e PRECISA FECHAR ──");
await p.click('button[aria-label="Abrir menu"]');
await p.click('text=Atualizações');
await p.waitForTimeout(800);
const body1 = await p.textContent("body");
console.log("painel atualizações abriu:", body1.includes("melhorias"));
// procurar botão de fechar/voltar
const btns = await p.$$eval("aside button", els => els.map(e => e.getAttribute("aria-label") + "|" + e.textContent.slice(0, 25).trim()));
console.log("botões do aside:", JSON.stringify(btns.slice(-6)));

console.log("── 4. enviar mensagem no chat anônimo ──");
await p.click('button[aria-label="Fechar menu"]');
await p.fill('input[aria-label="Mensagem"]', "oi skynet");
await p.click('button[aria-label="Enviar"]');
await p.waitForTimeout(6000);
const msgs = await p.$$eval(".thread .bubble, .msg, [class*=bubble]", els => els.map(e => e.textContent.slice(0, 90)));
console.log("bolhas:", JSON.stringify(msgs));
const body4 = await p.textContent("body");
console.log("algum erro visível:", body4.includes("não configurada") || body4.includes("erro") ? body4.match(/(IA não configurada[^"]{0,40}|erro[^"]{0,40})/i)?.[0] : "nenhum texto de erro");

console.log("── 5. signup anônimo completo ──");
await p.click('button[aria-label="Abrir menu"]');
await p.click('text=Fazer login');
await p.waitForTimeout(1200);
await p.click('text=CRIAR CONTA');
await p.waitForTimeout(800);
const btn = p.locator('button:has-text("GERAR CÓDIGO")');
if (await btn.count()) { await btn.click(); await p.waitForTimeout(7000); }
const codeEl = await p.textContent("body");
console.log("código mostrado:", (codeEl.match(/\d{4}-\d{4}-\d{4}/) || ["NÃO"])[0]);
console.log("sessão criada (ENTRAR NO CHAT):", codeEl.includes("ENTRAR NO CHAT"));

console.log("── ERROS CAPTURADOS ──");
errors.slice(0, 12).forEach(e => console.log(e));
await b.close();
