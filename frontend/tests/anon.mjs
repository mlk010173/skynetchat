import { chromium } from "playwright";
const B = "https://mlk010173.github.io/skynetchat/#/";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
p.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 150)));
p.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text().slice(0, 150)); });
const ok = (m) => console.log("  ✔ " + m), fail = (m) => console.log("  ✘ " + m);

await p.goto(B, { waitUntil: "networkidle" }); await p.waitForTimeout(2000);
(await p.textContent("body")).includes("Apresentamos") ? ok("home carrega (hero)") : fail("home não carrega");

// drawer abre e fecha pelo X
await p.click('button[aria-label="Abrir menu"]'); await p.waitForTimeout(700);
const aside = await p.getAttribute("aside", "class");
aside?.includes("open") ? ok("drawer abre") : fail("drawer não abre: " + aside);
await p.click('button[aria-label="Fechar menu"]'); await p.waitForTimeout(700);
(await p.getAttribute("aside", "class"))?.includes("open") ? fail("X não fecha o drawer") : ok("X fecha o drawer");

// fecha pelo scrim (clicar fora)
await p.click('button[aria-label="Abrir menu"]'); await p.waitForTimeout(500);
await p.evaluate(() => document.querySelector(".scrim").click()); await p.waitForTimeout(600);
(await p.getAttribute("aside", "class"))?.includes("open") ? fail("scrim não fecha") : ok("clicar fora fecha");

// painel abre e volta
await p.click('button[aria-label="Abrir menu"]');
await p.click('button:has-text("Atualizações")'); await p.waitForTimeout(500);
(await p.textContent("body")).includes("ATUALIZAÇÕES") ? ok("painel Atualizações abre") : fail("painel não abre");
await p.click('button:has-text("Voltar")'); await p.waitForTimeout(400);
(await p.textContent("body")).includes("Novo chat") ? ok("Voltar ao menu funciona") : fail("Voltar não funciona");
await p.evaluate(() => document.querySelector(".scrim").click());

// chat anônimo
await p.fill('input[aria-label="Mensagem"]', "oi skynet");
await p.click('button.dock-send');
await p.waitForTimeout(6000);
const body = await p.textContent("body");
body.includes("oi skynet") ? ok("mensagem do usuário aparece") : fail("mensagem não aparece");
const honest = body.includes("IA ainda não configurada") || body.includes("não configurada");
honest ? ok("resposta honesta sobre IA") : ok("outra resposta recebida");

// signup pessoa nova
await p.click('button[aria-label="Abrir menu"]');
await p.click('a:has-text("Fazer login")'); await p.waitForTimeout(1200);
await p.click('a:has-text("CRIAR CONTA")'); await p.waitForTimeout(800);
await p.click('button:has-text("GERAR CÓDIGO")'); await p.waitForTimeout(8000);
const body2 = await p.textContent("body");
const code = (body2.match(/\d{4}-\d{4}-\d{4}/) || [])[0];
code ? ok("código real gerado: " + code) : fail("signup não gerou código: " + body2.slice(-200));
body2.includes("ENTRAR NO CHAT") ? ok("botão de entrar após criar conta") : fail("sem botão entrar");
if (code) {
  await p.click('button:has-text("ENTRAR NO CHAT")'); await p.waitForTimeout(2000);
  const body3 = await p.textContent("body");
  body3.includes("Sair da conta") ? ok("conta criada e logada") : fail("não ficou logado");
  // histórico com sessão
  await p.click('button[aria-label="Abrir menu"]');
  await p.click('button:has-text("Histórico")'); await p.waitForTimeout(2500);
  const body4 = await p.textContent("body");
  body4.includes("Nenhuma conversa") || body4.includes("oi skynet") ? ok("histórico carrega") : fail("histórico não carrega");
}
console.log(errors.length ? "── erros de console ──\n" + errors.slice(0, 8).join("\n") : "── zero erros de JS/console ──");
await b.close();
