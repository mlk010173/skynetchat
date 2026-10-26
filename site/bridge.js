/* bridge.js — liga a interface (espelho estatico) ao NOSSO backend.
   Sem mudar a aparencia: redireciona /api/* para Supabase (IA, contas, memoria,
   dados) e para o agente no Render. Toda rota responde algo coerente:
   ou executa de verdade, ou devolve { disponivel: false, motivo, precisa }. */
(function () {
  var SUPA = "https://rkgwhhtenfozdwzpvxjj.supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrZ3doaHRlbmZvemR3enB2eGpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NTY2OTQsImV4cCI6MjEwODUzMjY5NH0.FRwfO66wi1ADFmSboCCwH1NWuz-212dDrIcuuiZ-0HA";
  var REST = SUPA + "/rest/v1";
  var AGENT = "https://skynet-agent.onrender.com";
  var MODELO_PADRAO = "nvidia/nemotron-3-ultra-550b-a55b";
  var TURNSTILE_SITE_KEY = "0x4AAAAAAfMLV6C2QyPpsxZe";
  var turnstileToken = null;
  var CATALOGO = ["nvidia/nemotron-3-ultra-550b-a55b","nvidia/nemotron-3.5-super-vl-120b-a12b","deepseek-ai/deepseek-v4.1-flash","minimaxai/minimax-m3.1-flash","stepfun-ai/step-5-preview","meta/muse-glimmer-30b","google/gemma-4-31b-it","google/diffusiongemma-26b-a4b-it","openai/gpt-oss-20b","poolside/laguna-xs-2.1","meta/llama-3.2-90b-vision-instruct","meta/llama-3.2-11b-vision-instruct","nvidia/nemotron-3-nano-omni-30b-a3b-reasoning","nvidia/nemotron-3.5-lightning-30b-a3b","nvidia/nemotron-3.5-bolt-e4b","meta/llama-guard-4-12b","nvidia/ising-calibration-1.5-31b"];
  var LIGADAS = ["/api/session","/api/models","/api/chat","/api/chat-V2-fast","/api/chat-V2-thinking","/api/chat-V3","/api/chat-V3-interacao","/api/chat-V3-thinking","/api/chat-V4","/api/chat-search","/api/classify-intent","/api/title","/api/code-repair","/api/image-gen","/api/image-followups","/api/access-code","/api/security/new-code","/api/recovery/request","/api/recovery/email","/api/memory","/api/memory/toggle","/api/preferences","/api/projects","/api/prompts","/api/groups","/api/files/upload","/api/files/","/api/file-extract","/api/conversations","/api/conversations/config","/api/conversations/migrate","/api/updates","/api/support","/api/support/session","/api/feedback","/api/initial-feedback","/api/log","/api/log/message","/api/analytics","/api/currency-verify","/api/vision","/api/tts","/api/tts-eleven","/api/speak","/api/export-pdf","/api/pdf-generate","/api/pix","/api/checkout-recover","/api/stripe/checkout","/api/stripe/portal","/api/monetize-interest","/api/affiliate","/api/affiliate/withdraw","/api/admin/accounts","/api/admin/feedback","/api/admin/influencer","/api/admin/metrics-refresh","/api/admin/pix-metrics-details","/api/admin/pix-summary","/api/admin/product-analytics","/api/admin/subaccounts","/api/admin/support","/api/osint","/api/integrations","/api/integrations/gmail/permissions"];
  // Rotas que dependem de provedor externo ainda nao contratado/configurado.
  var INDISPONIVEIS = {
    "/api/vision": ["visao de imagem no chat", "modelo de visao ligado ao nosso chat"],
    "/api/tts": ["voz sintetizada", "provedor de voz (nao existe na chave atual)"],
    "/api/tts-eleven": ["voz ElevenLabs", "chave ElevenLabs"],
    "/api/speak": ["voz sintetizada", "provedor de voz"],
    "/api/export-pdf": ["exportar conversa em PDF", "servico de PDF"],
    "/api/pdf-generate": ["gerar PDF", "servico de PDF"],
    "/api/pix": ["pagamento por PIX", "conta de pagamento"],
    "/api/checkout-recover": ["recuperar checkout", "conta de pagamento"],
    "/api/stripe/checkout": ["checkout Stripe", "chave Stripe"],
    "/api/stripe/portal": ["portal Stripe", "chave Stripe"],
    "/api/monetize-interest": ["interesse em monetizar", "conta de pagamento"],
    "/api/affiliate": ["programa de afiliados", "conta de pagamento"],
    "/api/affiliate/withdraw": ["saque de afiliado", "conta de pagamento"],
    "/api/admin/accounts": ["painel admin", "permissao de administrador"],
    "/api/admin/feedback": ["painel admin", "permissao de administrador"],
    "/api/admin/influencer": ["painel admin", "permissao de administrador"],
    "/api/admin/metrics-refresh": ["painel admin", "permissao de administrador"],
    "/api/admin/pix-metrics-details": ["painel admin", "permissao de administrador"],
    "/api/admin/pix-summary": ["painel admin", "permissao de administrador"],
    "/api/admin/product-analytics": ["painel admin", "permissao de administrador"],
    "/api/admin/subaccounts": ["painel admin", "permissao de administrador"],
    "/api/admin/support": ["painel admin", "permissao de administrador"],
    "/api/osint": ["OSINT", "fontes externas contratadas"],
    "/api/integrations": ["integracoes externas", "OAuth dos servicos (Gmail, Drive...)"],
    "/api/integrations/gmail/permissions": ["integracoes externas", "OAuth do Google"],
  };

  function resposta(obj, status) {
    return new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json; charset=utf-8" } });
  }
  function indisponivel(path) {
    var p = INDISPONIVEIS[path] || ["esta funcao", "configuracao externa"];
    return resposta({ ok: false, disponivel: false, rota: path, motivo: "A funcao de " + p[0] + " ainda nao esta ligada.", precisa: p[1] }, 200);
  }
  function sessao() {
    try { var raw = localStorage.getItem("skynet-session"); if (!raw) return null; var d = JSON.parse(raw); return d && d.access_token ? d : null; } catch (e) { return null; }
  }
  function cabecalhos(extra) {
    var s = sessao();
    var h = Object.assign({ "content-type": "application/json", apikey: ANON }, extra || {});
    if (s) h.Authorization = "Bearer " + s.access_token;
    return h;
  }
  function guardarSessao(sess, user) {
    try {
      var atual = {}; try { atual = JSON.parse(localStorage.getItem("skynet-session") || "{}"); } catch (e) {}
      var nova = Object.assign({}, atual, sess || {}); if (user) nova.user = user;
      localStorage.setItem("skynet-session", JSON.stringify(nova)); return nova;
    } catch (e) { return sess; }
  }
  function textoDoCorpo(body) { if (!body) return {}; if (typeof body === "string") { try { return JSON.parse(body); } catch (e) { return {}; } } return body; }
  function juntarSSE(txt) {
    var saida = "";
    String(txt).split("\n").forEach(function (l) {
      if (l.indexOf("data:") !== 0) return;
      var p = l.slice(5).trim(); if (!p || p === "[DONE]") return;
      try { var j = JSON.parse(p); if (typeof j.delta === "string") saida += j.delta; } catch (e) {}
    });
    return saida;
  }
  function adaptarChat(body) {
    var out = Object.assign({}, body);
    if (!out.content) {
      var msgs = body.messages || body.conversation || [];
      if (Array.isArray(msgs)) {
        for (var i = msgs.length - 1; i >= 0; i--) {
          var m = msgs[i] || {}; if ((m.role || "user") !== "user") continue;
          out.content = typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map(function (p) { return (p && p.text) || ""; }).join(" ") : "";
          break;
        }
      }
    }
    if (!out.model) out.model = MODELO_PADRAO;
    if (!out.content) out.content = String(body.q || body.prompt || body.query || "");
    delete out.messages;
    return out;
  }
  async function pedirAuthCode(corpo) {
    var acao = corpo.action; if (!acao) acao = corpo.code ? "login" : "signup";
    var envio = Object.assign({}, corpo, { action: acao });
    if (turnstileToken) envio.turnstile_token = turnstileToken;
    var r = await fetch(SUPA + "/functions/v1/auth-code", { method: "POST", headers: { "content-type": "application/json", apikey: ANON }, body: JSON.stringify(envio) });
    var d = await r.json().catch(function () { return { ok: false, error: "resposta invalida" }; });
    if (d && d.session) guardarSessao(d.session, d.user || null);
    return resposta(d, r.status);
  }
  async function chatComReserva(corpo, cab, querJson) {
    var ordem = [corpo.model || MODELO_PADRAO].concat(CATALOGO.filter(function (m) { return m !== corpo.model; }));
    var ultimo = "", tentados = [];
    for (var i = 0; i < ordem.length; i++) {
      var tent = Object.assign({}, corpo, { model: ordem[i] });
      var res = await fetch(SUPA + "/functions/v1/chat", { method: "POST", headers: cab, body: JSON.stringify(tent) });
      var tipo = res.headers.get("content-type") || "";
      var txt = await res.text();
      var falhou = !res.ok || !txt || txt.indexOf('"ok":false') >= 0;
      var limpo = juntarSSE(txt);
      tentados.push(ordem[i] + (falhou || !limpo ? ":falhou" : ":ok"));
      if (!falhou && limpo) {
        if (querJson) return resposta({ ok: true, reply: limpo, message: limpo, title: limpo.slice(0, 60), intent: "chat", model: ordem[i], reserva: i > 0 });
        return new Response(txt, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" } });
      }
      ultimo = limpo || txt;
    }
    return resposta({ ok: false, disponivel: true, error: "nenhum modelo respondeu agora", tentados: tentados, detalhe: String(ultimo).slice(0, 160) }, 200);
  }
  async function kvLer(chave) {
    var s = sessao(); if (!s) return null;
    var r = await fetch(REST + "/user_settings?select=dados&limit=1", { headers: cabecalhos() });
    if (!r.ok) return null;
    var d = await r.json().catch(function () { return null; });
    var linha = Array.isArray(d) ? d[0] : null;
    return linha && linha.dados ? linha.dados[chave] : null;
  }
  async function kvGravar(chave, valor) {
    var s = sessao(); if (!s) return false;
    var atual = (await kvLer("__tudo__")) || {};
    var dados = Object.assign({}, atual); dados[chave] = valor;
    var r = await fetch(REST + "/user_settings?on_conflict=user_id", {
      method: "POST", headers: cabecalhos({ Prefer: "resolution=merge-duplicates,return=representation" }),
      body: JSON.stringify({ user_id: s.user && s.user.id ? s.user.id : null, dados: dados }),
    });
    return r.ok;
  }
  async function memoriaDoUsuario() {
    var s = sessao(); if (!s) return [];
    var r = await fetch(REST + "/messages?select=content,created_at&order=created_at.desc&limit=20", { headers: cabecalhos() });
    if (!r.ok) return [];
    var d = await r.json().catch(function () { return []; });
    return (Array.isArray(d) ? d : []).map(function (m) { return { texto: m.content, quando: m.created_at }; });
  }

  async function rota(path, init) {
    var corpo = textoDoCorpo(init && init.body);
    var cab = cabecalhos();
    var s = sessao();

    if (path === "/api/session") return s ? resposta({ ok: true, authenticated: true, user: s.user || null }) : resposta({ ok: false, authenticated: false, error: "sem sessao" }, 401);
    if (path === "/api/models") { var rm = await fetch(SUPA + "/functions/v1/models", { headers: cab }); return new Response(await rm.text(), { status: rm.status, headers: { "content-type": "application/json" } }); }

    if (path.indexOf("/api/chat") === 0 || path === "/api/title" || path === "/api/classify-intent" || path === "/api/code-repair") {
      var c = adaptarChat(corpo);
      if (path === "/api/code-repair") c.content = "Corrija este codigo e explique o erro:\n\n" + (c.content || "");
      var querJson = corpo.stream === false || path === "/api/title" || path === "/api/classify-intent" || path === "/api/code-repair";
      return chatComReserva(c, cab, querJson);
    }
    if (path === "/api/image-gen") {
      var ri = await fetch(SUPA + "/functions/v1/imagem", { method: "POST", headers: { "content-type": "application/json", apikey: ANON }, body: JSON.stringify({ prompt: corpo.prompt || corpo.q || corpo.text || "", aspect_ratio: corpo.aspect_ratio || "1:1", modelo: corpo.modelo }) });
      return new Response(await ri.text(), { status: ri.status, headers: { "content-type": "application/json" } });
    }
    if (path === "/api/image-followups") {
      var cf = adaptarChat(corpo); cf.content = "Sugira 3 ideias de novas imagens a partir de: " + (cf.content || "a imagem anterior");
      var rf = await chatComReserva(cf, cab, true); var df = await rf.json();
      return resposta({ ok: true, sugestoes: String(df.reply || "").split("\n").filter(Boolean).slice(0, 3) });
    }

    if (path === "/api/access-code") return pedirAuthCode(corpo);
    if (path === "/api/security/new-code") return pedirAuthCode(Object.assign({}, corpo, { action: "newcode" }));
    if (path === "/api/recovery/request" || path === "/api/recovery/email") return pedirAuthCode(Object.assign({}, corpo, { action: "recover" }));

    if (path === "/api/memory") return resposta({ ok: true, memorias: await memoriaDoUsuario() });
    if (path === "/api/memory/toggle") {
      var atual = await kvLer("memoria_ativa"); var novo = typeof corpo.ativo === "boolean" ? corpo.ativo : !(atual !== false);
      await kvGravar("memoria_ativa", novo); return resposta({ ok: true, memoria_ativa: novo });
    }
    if (path === "/api/preferences") {
      if (init && init.method && init.method !== "GET") { await kvGravar("preferencias", corpo); return resposta({ ok: true, preferencias: corpo }); }
      return resposta({ ok: true, preferencias: (await kvLer("preferencias")) || {} });
    }
    if (path === "/api/projects" || path === "/api/prompts" || path === "/api/groups") {
      var chave = path.split("/").pop();
      if (init && init.method && init.method !== "GET") {
        var lista = (await kvLer(chave)) || []; lista = Array.isArray(lista) ? lista : [];
        lista.push(Object.assign({ id: String(Date.now()) }, corpo)); await kvGravar(chave, lista);
        return resposta({ ok: true, item: lista[lista.length - 1], total: lista.length });
      }
      return resposta({ ok: true, items: (await kvLer(chave)) || [] });
    }
    if (path === "/api/files/upload") {
      var arq = (await kvLer("arquivos")) || []; arq = Array.isArray(arq) ? arq : [];
      var item = { id: String(Date.now()), nome: corpo.nome || corpo.name || "arquivo", texto: String(corpo.texto || corpo.text || "").slice(0, 200000) };
      arq.push(item); await kvGravar("arquivos", arq);
      return resposta({ ok: true, id: item.id, nome: item.nome, caracteres: item.texto.length });
    }
    if (path === "/api/files" || path === "/api/files/") return resposta({ ok: true, arquivos: ((await kvLer("arquivos")) || []).map(function (a) { return { id: a.id, nome: a.nome, caracteres: (a.texto || "").length }; }) });
    if (path === "/api/file-extract") return resposta({ ok: true, texto: String(corpo.texto || corpo.text || "").slice(0, 200000) });

    if (path === "/api/conversations" || path === "/api/conversations/config") {
      if (!s) return resposta({ ok: false, error: "sem sessao" }, 401);
      var rc = await fetch(SUPA + "/functions/v1/conversations", { headers: cab });
      return new Response(await rc.text(), { status: rc.status, headers: { "content-type": "application/json" } });
    }
    if (path === "/api/conversations/migrate") return resposta({ ok: true, migradas: 0, aviso: "nada a migrar: as conversas ja ficam no nosso banco" });

    if (path === "/api/updates") return fetch("updates.json");
    if (path === "/api/support" || path === "/api/support/session") return resposta({ ok: true, canal: "nosso backend", mensagem: "Fale com o suporte pelo proprio chat.", ligado_ao_backend: true });
    if (path === "/api/feedback" || path === "/api/initial-feedback") {
      if (s && s.user && s.user.id) {
        await fetch(REST + "/notifications", { method: "POST", headers: cabecalhos({ Prefer: "return=minimal" }), body: JSON.stringify({ user_id: s.user.id, kind: "feedback", title: "Feedback", body: String(corpo.texto || corpo.message || corpo.text || "").slice(0, 2000) }) });
      }
      return resposta({ ok: true, recebido: true });
    }
    if (path === "/api/log" || path === "/api/log/message" || path === "/api/analytics") return resposta({ ok: true, registrado: true });
    if (path === "/api/currency-verify") {
      try {
        var moeda = String(corpo.moeda || corpo.currency || "USD").toUpperCase();
        var rr = await fetch("https://open.er-api.com/v6/latest/" + moeda);
        var dd = await rr.json();
        if (!dd || !dd.rates) throw new Error("sem taxas");
        var alvo = String(corpo.alvo || corpo.to || "BRL").toUpperCase();
        return resposta({ ok: true, base: moeda, alvo: alvo, taxa: dd.rates[alvo] ?? null, atualizado: dd.time_last_update_utc || null, fonte: "open.er-api.com" });
      } catch (e) { return resposta({ ok: false, disponivel: true, error: "cotacao indisponivel agora" }); }
    }
    if (INDISPONIVEIS[path]) return indisponivel(path);
    return resposta({ ok: false, disponivel: false, rota: path, motivo: "Rota desconhecida para a interface.", ligado_ao_backend: false }, 200);
  }

  var fetchOriginal = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    try {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var u = new URL(url, location.origin);
      if (u.origin === location.origin && u.pathname.indexOf("/api/") === 0) return rota(u.pathname, init || {});
    } catch (e) {}
    return fetchOriginal ? fetchOriginal(input, init) : Promise.reject(new Error("fetch indisponivel"));
  };
  function paginaDeConta() {
    var p = (location.pathname || "") + (document.title || "");
    return /login|sign-?up|cadastro|recovery|recuperar|acessar|entrar/i.test(p);
  }
  function montarTurnstile() {
    if (!TURNSTILE_SITE_KEY || !paginaDeConta()) return;
    if (document.querySelector(".cf-turnstile")) return;
    var alvo = document.querySelector("form button[type=submit]") || document.querySelector("form") || document.querySelector("main") || document.body;
    if (!alvo) return;
    window.__skynetTurnstileOk = function (t) { turnstileToken = t; };
    var caixa = document.createElement("div");
    caixa.className = "cf-turnstile";
    caixa.style.margin = "12px 0";
    caixa.setAttribute("data-sitekey", TURNSTILE_SITE_KEY);
    caixa.setAttribute("data-callback", "__skynetTurnstileOk");
    caixa.setAttribute("data-theme", "auto");
    if (alvo.tagName === "FORM") alvo.insertBefore(caixa, alvo.firstChild); else alvo.parentNode.insertBefore(caixa, alvo);
    if (!document.querySelector("script[data-turnstile]")) {
      var sc = document.createElement("script");
      sc.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      sc.async = true; sc.defer = true; sc.setAttribute("data-turnstile", "1");
      document.head.appendChild(sc);
    } else if (window.turnstile) { try { window.turnstile.render(caixa); } catch (e) {} }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montarTurnstile); else montarTurnstile();
  setTimeout(montarTurnstile, 1500);

  window.__skynetBridge = { versao: "2.1.0", backend: SUPA, agente: AGENT, rotasTratadas: LIGADAS.length, indisponiveis: Object.keys(INDISPONIVEIS).length, catalogo: CATALOGO.length, modeloPadrao: MODELO_PADRAO, turnstile: Boolean(TURNSTILE_SITE_KEY) };
  console.log("[bridge] v2: " + LIGADAS.length + " rotas tratadas (" + Object.keys(INDISPONIVEIS).length + " com aviso honesto), catalogo de " + CATALOGO.length + " modelos");
})();
