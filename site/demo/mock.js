/* MODO DEMO — espelho estatico do SKYNETchat.
   Simula sessao/API para a interface renderizar com dados ficticios.
   Nenhum dado real de conta e usado. */
(function () {
  var orig = window.fetch ? window.fetch.bind(window) : null;
  if (!orig) return;

  function persona() {
    try { return window.__sky_persona ? window.__sky_persona() : { user: {} }; }
    catch (e) { return { user: {} }; }
  }
  function json(obj, status, headers) {
    return new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: Object.assign({ "Content-Type": "application/json" }, headers || {})
    });
  }

  /* ---- limpa estado antigo de conversa (evita travar em mensagem corrompida) ---- */
  (function limpar() {
    try {
      var forcar = /[?&]fresh=/.test(location.search);
      if (sessionStorage.getItem("sky_clean") === "4" && !forcar) return;
      sessionStorage.setItem("sky_clean", "4");
      try { sessionStorage.removeItem("sveltekit:snapshot"); } catch (e) {}
      if (window.indexedDB && indexedDB.deleteDatabase) indexedDB.deleteDatabase("skynetchat");
    } catch (e) {}
  })();

  /* ---- linhas de pensamento usadas no stream ---- */
  var PASSOS = [
    { tipo: "thinking", titulo: "Interpretar pedido", texto: "Entendi o pedido e vou decidir quais ferramentas usar." },
    { tipo: "search", titulo: "Pesquisar na web", texto: "Buscando fontes na web...", queries: ["skynetchat 4.5", "politicos TSE"] },
    { tipo: "thinking", titulo: "Abrir painel de politicos", texto: "Chamando ferramenta abrir_painel_politicos (TSE, Camara, Senado)." },
    { tipo: "thinking", titulo: "Falhou: API de doacoes", texto: "A API de doacoes eleitorais nao respondeu; sigo com dados publicos.", erro: true },
    { tipo: "thinking", titulo: "Montar resposta", texto: "Cruzando o que foi encontrado e montando a resposta final." }
  ];

  function sse(eventos, aoTerminar) {
    return new Response(new ReadableStream({
      start: function (ctrl) {
        var enc = new TextEncoder(), i = 0;
        function tick() {
          if (i >= eventos.length) {
            try { ctrl.enqueue(enc.encode("data: [DONE]\n\n")); ctrl.close(); } catch (e) {}
            if (aoTerminar) setTimeout(aoTerminar, 600);
            return;
          }
          try { ctrl.enqueue(enc.encode("data: " + JSON.stringify(eventos[i++]) + "\n\n")); } catch (e) { return; }
          setTimeout(tick, 380);
        }
        tick();
      }
    }), { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  }

  /* ---- chat REAL: /api/chat -> Supabase edge function "chat" (roteador automatico) ---- */
  function chatReal(orig, init) {
    var cfg = window.__SKY_LIVE || {};
    if (!cfg.url || !cfg.key) return Promise.resolve(json({ error: "backend nao configurado" }, 503));
    var body = {};
    try { body = JSON.parse((init && init.body) || "{}"); } catch (e) {}
    var msgs = body.messages || body.history || [];
    /* o app manda no formato do AI SDK: {role, parts:[{type:"text",text}]} */
    function textoDe(m) {
      if (!m) return "";
      if (typeof m.content === "string") return m.content;
      if (Array.isArray(m.parts)) {
        return m.parts.filter(function (pt) { return pt && pt.type === "text"; })
          .map(function (pt) { return pt.text || ""; }).join("\n");
      }
      return m.text || "";
    }
    var ultimo = "";
    for (var i = msgs.length - 1; i >= 0; i--) {
      var m = msgs[i] || {};
      if (m.role === "user") {
        var t = textoDe(m).trim();
        if (t) { ultimo = t; break; }
      }
    }
    if (!ultimo) ultimo = textoDe(body) || body.content || body.message || body.prompt || "";
    var conv = null;
    try { conv = sessionStorage.getItem("sky_conv"); } catch (e) {}

    var stream = new ReadableStream({
      start: async function (ctrl) {
        var enc = new TextEncoder();
        var send = function (o) { try { ctrl.enqueue(enc.encode("data: " + JSON.stringify(o) + "\n\n")); } catch (e) {} };
        var t0 = Date.now();
        send({ type: "start", messageId: "m" + t0 });
        send({ type: "thinking-meta", summaryTitle: "Pensando" });
        send({ type: "step-start", stepId: "s0", stepType: "thinking" });
        send({ type: "step-delta", stepId: "s0", delta: "O servidor escolhe o melhor modelo disponivel." });
        send({ type: "text-start", id: "t1" });
        try {
          var r = await orig(cfg.url + "/functions/v1/chat", {
            method: "POST",
            headers: (function () {
              var h = { "Content-Type": "application/json", "apikey": cfg.key, "Authorization": "Bearer " + cfg.key };
              var sess = authToken();
              if (sess) h["x-session"] = sess;
              return h;
            })(),
            body: JSON.stringify({ content: ultimo, model: "auto", conversationId: conv })
          });
          if (!r.ok || !r.body) {
            var txt = "Nao consegui falar com o servidor (HTTP " + r.status + ").";
            send({ type: "text-delta", id: "t1", delta: txt });
          } else {
            var reader = r.body.getReader(), dec = new TextDecoder(), buf = "";
            for (;;) {
              var x = await reader.read();
              if (x.done) break;
              buf += dec.decode(x.value, { stream: true });
              var linhas = buf.split("\n");
              buf = linhas.pop() || "";
              for (var j = 0; j < linhas.length; j++) {
                var l = linhas[j].trim();
                if (l.indexOf("data:") !== 0) continue;
                var payload = l.slice(5).trim();
                if (!payload || payload === "[DONE]") continue;
                var ev; try { ev = JSON.parse(payload); } catch (e) { continue; }
                if (ev.delta) send({ type: "text-delta", id: "t1", delta: ev.delta });
                if (ev.ok === false && ev.error) send({ type: "text-delta", id: "t1", delta: "\n\n" + ev.error });
                if (ev.done) {
                  if (ev.conversationId) { try { sessionStorage.setItem("sky_conv", ev.conversationId); } catch (e) {} }
                  if (ev.model) {
                    send({ type: "step-end", stepId: "s0", title: "Respondeu com " + ev.model });
                    send({ type: "step-start", stepId: "s1", stepType: "thinking" });
                    send({ type: "step-end", stepId: "s1", title: "Concluido em " + Math.round((Date.now() - t0) / 1000) + "s" });
                  }
                }
              }
            }
          }
        } catch (e) {
          send({ type: "text-delta", id: "t1", delta: "Falha de rede ao chamar o servidor." });
        }
        send({ type: "text-end", id: "t1" });
        send({ type: "finish" });
        try { ctrl.close(); } catch (e) {}
      }
    });
    return Promise.resolve(new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } }));
  }

  /* ================= AUTH REAL ================= */
  function authToken() { try { return localStorage.getItem("sky_session") || ""; } catch (e) { return ""; } }
  function authGuardar(t) { try { if (t) localStorage.setItem("sky_session", t); } catch (e) {} }
  function authLimpar() { try { localStorage.removeItem("sky_session"); } catch (e) {} }

  /* mapeia a rota que o app chama para a acao da edge function "auth" */
  function authRota(p, metodo) {
    if (p.indexOf("/api/access-code") !== -1) return "access-code";
    if (p.indexOf("/api/recovery/request") !== -1) return "recovery-request";
    if (p.indexOf("/api/recovery/email") !== -1) return "recovery-email";
    if (p.indexOf("/api/security/new-code") !== -1) return "new-code";
    if (p.indexOf("/api/support") !== -1 && p.indexOf("session") === -1) return "support";
    if (p.endsWith("/api/session") || p.indexOf("/api/session?") !== -1) {
      if (metodo === "DELETE") return "logout";
      if (metodo === "POST") return "login";
      return "session";
    }
    return null;
  }

  function authReal(orig, acao, init, corpoTxt) {
    var cfg = (window.__SKY_AUTH || {});
    var metodo = (init && init.method) || (acao === "session" ? "GET" : "POST");
    var headers = { "Content-Type": "application/json", "apikey": cfg.key, "Authorization": "Bearer " + cfg.key };
    var t = authToken();
    if (t) headers["x-session"] = t;
    var opts = { method: metodo, headers: headers };
    if (metodo !== "GET") opts.body = corpoTxt || "{}";
    return orig(cfg.url + "/functions/v1/auth?action=" + encodeURIComponent(acao), opts)
      .then(function (r) {
        return r.text().then(function (txt) {
          var dados = {};
          try { dados = JSON.parse(txt); } catch (e) { dados = { ok: false, error: txt.slice(0, 200) }; }
          if (acao === "access-code" || acao === "login") {
            if (dados && dados.session) authGuardar(dados.session);
          }
          if (acao === "logout") authLimpar();
          /* 409 = conta ja existe / ja logado (o app redireciona) */
          if (acao === "access-code" && dados && dados.code) {
            dados.registration_event_id = "signup_" + Date.now();
            dados.signup_event_id = "signup_ok_" + Date.now();
          }
          if (r.status === 401 && acao === "session") return json({ error: "unauthorized" }, 401);
          return json(dados, r.status);
        });
      })
      .catch(function () { return json({ ok: false, error: "servidor indisponivel" }, 503); });
  }

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var p = url.split("?")[0];
    var body0 = (init && typeof init.body === "string") ? init.body : "";
    if (p.indexOf("/api/") === -1) return orig(input, init);

    /* ---- AUTH REAL (código secreto) via edge function "auth" ---- */
    if (window.__SKY_AUTH) {
      var rota = authRota(p, (init || {}).method || "GET");
      if (rota) return authReal(orig, rota, init, body0);
    }
    if (p.endsWith("/api/session")) return Promise.resolve(json({ user: persona().user }));
    if (p.endsWith("/api/preferences")) return Promise.resolve(json({ theme: "black", model: "skynet-v4" }));
    if (p.indexOf("/api/conversations/config") !== -1)
      return Promise.resolve(json({ models: [{ id: "skynet-v4", name: "SKYNET V4" }] }));

    if (p.indexOf("/api/auth") !== -1 || p.indexOf("/api/login") !== -1 || p.indexOf("/api/signup") !== -1 || p.indexOf("/api/verify") !== -1) {
      if (window.__sky_setPersona) setTimeout(function () { window.__sky_setPersona("pro"); }, 300);
      return Promise.resolve(json({ ok: true, success: true, token: "demo-token", user: persona().user }));
    }

    if (p.indexOf("/api/admin") !== -1) {
      var u = persona().user || {};
      if (!u.isAdmin) return Promise.resolve(json({ error: "forbidden", message: "Acesso restrito a administradores" }, 403));
      return Promise.resolve(json({ ok: true, items: [] }));
    }

    if (p.indexOf("/api/chat") !== -1 && window.__SKY_LIVE) return chatReal(orig, init);

    if (p.indexOf("/api/chat") !== -1) {
      var ev = [{ type: "start", messageId: "demo-msg-1" }, { type: "thinking-meta", summaryTitle: "Pensando" }];
      PASSOS.forEach(function (ps, n) {
        ev.push({ type: "step-start", stepId: "s" + n, stepType: ps.tipo });
        if (ps.queries) ev.push({ type: "step-start", stepId: "s" + n, stepType: ps.tipo, searchQueries: ps.queries });
        ev.push({ type: "step-delta", stepId: "s" + n, delta: ps.texto });
        ev.push({ type: "step-end", stepId: "s" + n, title: ps.titulo });
      });
      ev.push({ type: "text-start", id: "t1" });
      var txt = "Resposta em streaming do espelho.\n\nAcima esta a linha de pensamento: cada etapa, a ferramenta usada, o que ele pensou, o que ia fazer, o que concluiu e o que falhou.";
      (txt.match(/[\s\S]{1,12}/g) || []).forEach(function (c) { ev.push({ type: "text-delta", id: "t1", delta: c }); });
      ev.push({ type: "text-end", id: "t1" }, { type: "finish" });
      return Promise.resolve(sse(ev, pintarPassos));
    }

    if (p.indexOf("/api/tts") !== -1) return Promise.resolve(new Response("", { status: 200 }));
    if (p.indexOf("/api/politicos") !== -1) return Promise.resolve(json({ results: [] }));
    return Promise.resolve(json({}));
  };

  /* ---- painel fixo da linha de pensamento (fica na tela depois da resposta) ---- */
  function pintarPassos() {
    try {
      if (document.querySelector("[data-sky-steps]")) return;
      var alvo = null;
      var nos = document.querySelectorAll("div,p,span");
      for (var i = nos.length - 1; i >= 0; i--) {
        var el = nos[i];
        if (el.children.length === 0 && /Resposta em streaming/.test(el.textContent || "")) { alvo = el; break; }
      }
      if (!alvo) {
        var t = document.body.innerText || "";
        if (t.indexOf("Resposta em streaming") === -1) return;
      }
      var bolha = alvo;
      for (var k = 0; k < 6 && bolha && bolha.parentElement; k++) {
        if (bolha.parentElement.querySelectorAll("[data-sky-steps]").length) break;
        if (bolha.getBoundingClientRect().width > 320) break;
        bolha = bolha.parentElement;
      }
      if (!bolha || !bolha.parentElement) return;
      var box = document.createElement("div");
      box.setAttribute("data-sky-steps", "1");
      box.style.cssText = "margin:0 0 10px;font:12px/1.5 ui-sans-serif,system-ui;color:#b9b9b9;max-width:760px";
      var head = document.createElement("div");
      head.style.cssText = "display:flex;align-items:center;gap:8px;cursor:pointer;color:#e6e6e6;padding:4px 0";
      head.innerHTML = '<span style="color:#e33">\u25CF</span> Pensou por 4s \u00B7 5 etapas';
      var corpo = document.createElement("div");
      corpo.style.cssText = "border-left:1px solid #2b2b2b;margin-left:5px;padding:2px 0 2px 12px;display:none";
      PASSOS.forEach(function (ps) {
        var linha = document.createElement("div");
        linha.style.cssText = "padding:3px 0;display:flex;gap:8px;align-items:flex-start";
        var marca = ps.erro ? '<span style="color:#e33">\u2715</span>' : '<span style="color:#2ea043">\u2713</span>';
        var titulo = ps.erro ? '<span style="color:#e33">' + ps.titulo + "</span>" : '<span style="color:#ddd">' + ps.titulo + "</span>";
        linha.innerHTML = marca + '<div><div>' + titulo + '</div><div style="color:#8a8a8a">' + ps.texto + "</div></div>";
        corpo.appendChild(linha);
      });
      var aviso = document.createElement("div");
      aviso.style.cssText = "color:#666;padding-top:6px";
      aviso.textContent = "Controles da mensagem: copiar, editar, compartilhar, ouvir, reescrever, util, nao util, mais acoes.";
      corpo.appendChild(aviso);
      head.onclick = function () { corpo.style.display = corpo.style.display === "none" ? "block" : "none"; };
      box.appendChild(head); box.appendChild(corpo);
      var pai = bolha.parentElement;
      pai.insertBefore(box, bolha);
    } catch (e) {}
  }

  /* ---- menu: adiciona as secoes que so existiam por URL ---- */
  function addMenu() {
    var itens = [
      ["Investigar Politicos", "Cruze dados de campanha, doacoes e votacoes", "/politicos/"],
      ["Planos PRO", "Assine e veja os planos disponiveis", "/checkout/"],
      ["Termos de uso", "Politica de privacidade e termos", "/termos/"]
    ];
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var modelo = null;
      var btns = document.querySelectorAll("button");
      for (var i = 0; i < btns.length; i++) {
        var t = (btns[i].innerText || "").trim();
        if (t.indexOf("Monetize") === 0 || t.indexOf("Indique e Ganhe") === 0) { modelo = btns[i]; break; }
      }
      if (!modelo) { if (tries > 20) clearInterval(timer); return; }
      if (document.querySelector("[data-sky-extra]")) { clearInterval(timer); return; }
      var pai = modelo.parentElement;
      itens.forEach(function (it) {
        var b = modelo.cloneNode(true);
        b.setAttribute("data-sky-extra", "1");
        var spans = b.querySelectorAll("span");
        if (spans.length >= 2) {
          spans[0].textContent = it[0];
          if (spans[1]) spans[1].textContent = it[1];
        } else { b.textContent = it[0]; }
        b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); location.href = it[2]; };
        pai.appendChild(b);
      });
      clearInterval(timer);
    }, 500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addMenu);
  else addMenu();

  /* ---- login / criar conta / recuperacao: qualquer entrada vale como PRO ---- */
  (function authDemo() {
    if (!/\/(login|sign-up|recovery|dev\/security)/.test(location.pathname)) return;
    function entrar() {
      try { localStorage.setItem("sky_persona", "pro"); } catch (e) {}
      setTimeout(function () { location.href = "/"; }, 500);
    }
    var timer = setInterval(function () {
      var btns = [].slice.call(document.querySelectorAll("button"));
      var b = btns.filter(function (x) { return /ENTRAR|CRIAR|ACESSAR|CONTINUAR|VERIFICAR/i.test(x.innerText || ""); })[0];
      if (!b) return;
      if (b.disabled) { b.disabled = false; b.removeAttribute("disabled"); }
      b.style.opacity = "1";
      b.style.cursor = "pointer";
      if (b.getAttribute("data-sky-auth")) return;
      b.setAttribute("data-sky-auth", "1");
      b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); entrar(); }, true);
    }, 400);
    document.addEventListener("submit", function (e) { e.preventDefault(); entrar(); }, true);
    setTimeout(function () { clearInterval(timer); }, 30000);
  })();
})();
