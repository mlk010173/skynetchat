import { chromium } from "playwright";
const BASE = "https://mlk010173.github.io/skynetchat/#";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
const ok = (m) => console.log("  ✔ " + m);
const fail = (m) => { console.log("  ✘ " + m); process.exitCode = 1; };

// 1. home renderiza
await p.goto(BASE + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
const body = await p.textContent("body");
body.includes("Apresentamos o SKYNETchat") && body.includes("Pesquisar") ? ok("hero + chips renderizados") : fail("hero não renderizou");
(await p.getAttribute("input[aria-label=\"Mensagem\"]", "placeholder")) === "Pesquise sem censura..." ? ok("composer fiel") : fail("composer errado");

// 2. drawer abre com itens fiéis
await p.click('button[aria-label="Abrir menu"]');
await p.waitForTimeout(600);
const drawer = await p.textContent(".drawer");
for (const probe of ["Novo chat", "Indique e Ganhe", "Monetize com SKYNETchat", "Atualizações", "Imagens", "Conversas em grupo", "Codex", "Projetos", "Histórico de conversas", "Conheça o SKYNETchat", "Prompts", "Suporte", "Fazer login", "Tema de fundo", "Termos de Serviço"])
  drawer.includes(probe) ? ok(probe) : fail("FALTA: " + probe);

// 3. painel Atualizações real
await p.click('button:has-text("Atualizações")');
await p.waitForTimeout(400);
(await p.textContent(".drawer")).includes("ATUALIZAÇÕES") ? ok("painel de atualizações abre") : fail("painel atualizações");
await p.click('button[aria-label="Fechar menu"]');

// 4. tela de login por código (real)
await p.evaluate(() => window.location.hash = "#/login");
await p.waitForTimeout(1200);
(await p.textContent("body")).includes("CÓDIGO DE ACESSO 0/12") ? ok("tela de código de 12 dígitos") : fail("tela login");

// 5. criar conta real → código gerado pelo servidor
await p.evaluate(() => window.location.hash = "#/sign-up");
await p.waitForTimeout(1200);
await p.click('button:has-text("GERAR CÓDIGO DE ACESSO")');
await p.waitForTimeout(4000);
const codeTxt = (await p.textContent(".code-reveal").catch(() => "")).replace(/\D/g, "");
codeTxt.length === 12 ? ok("código real gerado: " + codeTxt.replace(/(\d{4})(?=\d)/g, "$1-")) : fail("código não apareceu: " + codeTxt);

// 6. logout + login com o código
await p.click('button:has-text("ENTRAR NO CHAT")');
await p.waitForTimeout(1500);
await p.evaluate(() => window.location.hash = "#/login");
await p.waitForTimeout(1200);
const code = codeTxt.replace(/(\d{4})(?=\d)/g, "$1-");
await p.click('input[aria-label="Código de acesso"]');
await p.keyboard.type(code);
await p.keyboard.press("Enter");
await p.waitForTimeout(4000);
(await p.textContent("body")).includes("Apresentamos o SKYNETchat") ? ok("login com o código: sessão real") : fail("login falhou");

// 7. estado logado no drawer
await p.click('button[aria-label="Abrir menu"]');
await p.waitForTimeout(500);
(await p.textContent(".drawer")).includes("Sair da conta") ? ok("estado logado exibido") : fail("estado logado");

errs.length === 0 ? ok("zero erros de JS") : fail("erros JS: " + errs.slice(0,3).join(" | "));
await b.close();
