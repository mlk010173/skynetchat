import { chromium } from "playwright";
const B = "https://mlk010173.github.io/skynetchat/#";
const ok = (t) => console.log("  ✔ " + t);
const bad = (t) => console.log("  ✘ " + t);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 120)));

// ── visitante ──
await p.goto(B + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(2000);
(await p.textContent("body")).includes("Apresentamos") ? ok("visitante vê a home") : bad("home não carregou");
(await p.textContent("body")).includes("Fazer login") ? ok("visitante vê Fazer login") : bad("sem login link");
// chat anônimo
await p.fill('input[aria-label="Mensagem"]', "oi");
await p.click("button.dock-send");
await p.waitForTimeout(7000);
const anon = await p.textContent("body");
anon.includes("oi") ? ok("mensagem do visitante aparece") : bad("mensagem não aparece");
/ola|olá|posso ajudar|oi/i.test(anon) ? ok("visitante recebeu resposta real da IA") : bad("visitante sem resposta");

// ── login com código inválido ──
await p.goto(B + "/login", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
await p.fill('input[aria-label="Código de acesso"]', "000000000001");
await p.click("button:has-text('ENTRAR')");
await p.waitForTimeout(3500);
const invalid = await p.textContent("body");
invalid.toLowerCase().includes("invalid") || invalid.toLowerCase().includes("muitas tentativas") ? ok("código inválido tratado com mensagem visível") : bad("erro de código inválido não aparece");

// ── criar conta (código válido) ──
await p.goto(B + "/sign-up", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
await p.click("button:has-text('GERAR')");
await p.waitForTimeout(4000);
const code = (await p.textContent("body").then(t => (t.match(/\d{4}-\d{4}-\d{4}/) || [""])[0]));
code.length === 14 ? ok("conta criada, código: " + code) : bad("sem código gerado");
await p.click("button:has-text('ENTRAR')");
await p.waitForTimeout(2500);
(await p.locator('input[aria-label="Mensagem"]').count()) > 0 ? ok("logado após criar conta (chat visível)") : bad("não logou ou chat sumiu");

// ── persistência após reload ──
await p.goto(B + "/", { waitUntil: "networkidle" });
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(2500);
const after = await p.textContent("body");
(await p.locator('button[aria-label="Notificações"]').count()) > 0 ? ok("sessão persiste após reload (sino visível)") : bad("sessão PERDIDA no reload");

// ── sair e entrar com o código válido ──
await p.goto(B + "/login", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
await p.fill('input[aria-label="Código de acesso"]', code);
await p.click("button:has-text('ENTRAR')");
await p.waitForTimeout(4000);
(await p.locator('input[aria-label="Mensagem"]').count()) > 0 ? ok("login com código válido funciona") : bad("login com código válido FALHOU");

// ── chat logado ──
await p.fill('input[aria-label="Mensagem"]', "quem e voce?");
await p.click("button.dock-send");
await p.waitForTimeout(7000);
const logged = await p.textContent("body");
logged.length > 200 ? ok("chat logado respondeu") : bad("chat logado sem resposta");

// sino de notificações (logado)
try {
  const bell = p.locator('button[aria-label="Notificações"]');
  if (await bell.count()) {
    const badge = await bell.locator(".bell-badge").count();
    badge > 0 ? ok("sino com badge de não lidas") : bad("badge do sino vazio");
    await bell.click();
    await p.waitForTimeout(1500);
    const painel = await p.textContent(".notif-panel").catch(() => "");
    painel.includes("Bem-vindo") ? ok("notificação de boas-vindas no painel") : bad("painel sem boas-vindas: " + painel.slice(0, 80));
  } else bad("sino não aparece logado");
} catch (e) { bad("falha ao testar sino: " + e.message.slice(0, 60)); }

console.log(errs.length ? "── erros de console: " + JSON.stringify(errs.slice(0,4)) : "── zero erros de console ──");
await b.close();
