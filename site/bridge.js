/* bridge.js — liga a interface (espelho estatico) ao NOSSO backend.
   Nao muda a aparencia: so redireciona as chamadas /api/* para
   Supabase (IA, sessoes, memoria) e para o agente no Render.
   Rotas ainda nao ligadas respondem 501 honesto, em vez de 404. */
(function () {
  var SUPA = "https://rkgwhhtenfozdwzpvxjj.supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrZ3doaHRlbmZvemR3enB2eGpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NTY2OTQsImV4cCI6MjEwODUzMjY5NH0.FRwfO66wi1ADFmSboCCwH1NWuz-212dDrIcuuiZ-0HA";
  var AGENT = "https://skynet-agent.onrender.com";
  var MODELO_PADRAO = "nvidia/nemotron-3.5-super-vl-120b-a12b";
  var CATALOGO = ["nvidia/nemotron-3-ultra-550b-a55b", "nvidia/nemotron-3.5-super-vl-120b-a12b", "deepseek-ai/deepseek-v4.1-flash", "minimaxai/minimax-m3.1-flash", "stepfun-ai/step-5-preview", "meta/muse-glimmer-30b", "google/gemma-4-31b-it", "google/diffusiongemma-26b-a4b-it", "openai/gpt-oss-20b", "poolside/laguna-xs-2.1", "meta/llama-3.2-90b-vision-instruct", "meta/llama-3.2-11b-vision-instruct", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", "nvidia/nemotron-3.5-lightning-30b-a3b", "nvidia/nemotron-3.5-bolt-e4b", "meta/llama-guard-4-12b", "nvidia/ising-calibration-1.5-31b"];
  var LIGADAS = ["/api/session", "/api/models", "/api/conversations/config", "/api/conversations", "/api/chat", "/api/chat-V2-fast", "/api/chat-V2-thinking", "/api/chat-V3", "/api/chat-V3-interacao", "/api/chat-V3-thinking", "/api/chat-V4", "/api/chat-search", "/api/title", "/api/classify-intent", "/api/updates", "/api/support", "/api/feedback", "/api/access-code", "/api/recovery/request", "/api/recovery/email", "/api/image-gen"];

  function resposta(obj, status) {
    return new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json; charset=utf-8" } });
  }
  function sessao() {
    try {
      var raw = localStorage.getItem("skynet-session");
      if (!raw) return null;
      var d = JSON.parse(raw);
      return d && d.access_token ? d : null;
    } catch (e) { return null; }
  }
  function textoDoCorpo(body) {
    if (!body) return {};
    if (typeof body === "string") { try { return JSON.parse(body); } catch (e) { return {}; } }
    return body;
  }
  function adaptarChat(body) {
    var out = Object.assign({}, body);
    if (!out.content) {
      var msgs = body.messages || body.conversation || [];
      if (Array.isArray(msgs)) {
        for (var i = msgs.length - 1; i >= 0; i--) {
          var m = msgs[i] || {};
          if ((m.role || "user") !== "user") continue;
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
  function juntarSSE(txt) {
    var saida = "";
    String(txt).split("\n").forEach(function (linha) {
      if (linha.indexOf("data:") !== 0) return;
      var p = linha.slice(5).trim();
      if (!p || p === "[DONE]") return;
      try { var j = JSON.parse(p); if (typeof j.delta === "string") saida += j.delta; } catch (e) {}
    });
    return saida;
  }

  function guardarSessao(sess, user) {
    try {
      var atual = {};
      try { atual = JSON.parse(localStorage.getItem("skynet-session") || "{}"); } catch (e) {}
      var nova = Object.assign({}, atual, sess || {});
      if (user) nova.user = user;
      localStorage.setItem("skynet-session", JSON.stringify(nova));
      return nova;
    } catch (e) { return sess; }
  }
  async function pedirAuthCode(corpo) {
    var acao = corpo.action;
    if (!acao) acao = corpo.code ? "login" : "signup";
    var envio = Object.assign({}, corpo, { action: acao });
    var r = await fetch(SUPA + "/functions/v1/auth-code", { method: "POST", headers: { "content-type": "application/json", apikey: ANON }, body: JSON.stringify(envio) });
    var d = await r.json().catch(function () { return { ok: false, error: "resposta invalida" }; });
    if (d && d.session) guardarSessao(d.session, d.user || null);
    return resposta(d, r.status);
  }
  async function chatComReserva(corpo, cabecalhos, querJson) {
    // Tenta o modelo pedido e, se ele falhar (erro do provedor ou resposta vazia),
    // passa para o proximo da reserva. A resposta e bufferizada para poder conferir.
    var ordem = [corpo.model || MODELO_PADRAO].concat(CATALOGO.filter(function (m) { return m !== corpo.model; }));
    var ultimo = "";
    var tentados = [];
    for (var i = 0; i < ordem.length; i++) {
      var tentativa = Object.assign({}, corpo, { model: ordem[i] });
      var res = await fetch(SUPA + "/functions/v1/chat", { method: "POST", headers: cabecalhos, body: JSON.stringify(tentativa) });
      var tipo = res.headers.get("content-type") || "";
      var txt = tipo.indexOf("event-stream") >= 0 ? await res.text() : await res.text();
      var falhou = !res.ok || !txt || txt.indexOf('"ok":false') >= 0 || txt.indexOf('"error"') >= 0;
      var limpo = juntarSSE(txt);
      tentados.push(ordem[i] + (falhou ? ":falhou" : ":ok"));
      if (!falhou && limpo) {
        if (querJson) return resposta({ ok: true, reply: limpo, message: limpo, title: limpo.slice(0, 60), intent: "chat", model: ordem[i], reserva: i > 0 });
        return new Response(txt, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" } });
      }
      ultimo = limpo || txt;
    }
    return resposta({ ok: false, ligado_ao_backend: true, error: "nenhum modelo respondeu agora", tentados: tentados, detalhe: String(ultimo).slice(0, 160) }, 502);
  }

  async function rota(path, init) {
    var s = sessao();
    var corpo = textoDoCorpo(init && init.body);
    var cabecalhos = { "content-type": "application/json", apikey: ANON, ...(s ? { Authorization: "Bearer " + s.access_token } : {}) };

    if (path === "/api/session") {
      return s ? resposta({ ok: true, authenticated: true, user: s.user || null }) : resposta({ ok: false, authenticated: false, error: "sem sessao" }, 401);
    }
    if (path === "/api/models" || path === "/api/conversations/config") {
      var r = await fetch(SUPA + "/functions/v1/models", { headers: cabecalhos });
      return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
    }
    if (path === "/api/image-gen") {
      var ri = await fetch(SUPA + "/functions/v1/imagem", {
        method: "POST",
        headers: { "content-type": "application/json", apikey: ANON },
        body: JSON.stringify({ prompt: corpo.prompt || corpo.q || corpo.text || "", aspect_ratio: corpo.aspect_ratio || "1:1", modelo: corpo.modelo }),
      });
      return new Response(await ri.text(), { status: ri.status, headers: { "content-type": "application/json" } });
    }
    if (path === "/api/access-code") return pedirAuthCode(corpo);
    if (path === "/api/recovery/request" || path === "/api/recovery/email") {
      var rec = await pedirAuthCode(Object.assign({}, corpo, { action: "recover" }));
      return rec;
    }
    if (path === "/api/conversations" || path === "/api/conversations/config") {
      if (!s) return resposta({ ok: false, error: "sem sessao" }, 401);
      var rc = await fetch(SUPA + "/functions/v1/conversations", { headers: cabecalhos });
      return new Response(await rc.text(), { status: rc.status, headers: { "content-type": "application/json" } });
    }
    if (path.indexOf("/api/chat") === 0 || path === "/api/title" || path === "/api/classify-intent") {
      var querJson = corpo.stream === false || path === "/api/title" || path === "/api/classify-intent";
      return chatComReserva(adaptarChat(corpo), cabecalhos, querJson);
    }
    if (path === "/api/updates") return fetch("updates.json");
    if (path === "/api/support" || path === "/api/feedback") {
      return resposta({ ok: true, canal: "nosso backend", mensagem: "Suporte pelo nosso proprio sistema. Envie sua mensagem no chat.", ligado_ao_backend: true });
    }
    return resposta({ ok: false, ligado_ao_backend: false, error: "A rota " + path + " ainda nao esta ligada ao nosso backend." }, 501);
  }

  var fetchOriginal = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    try {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var u = new URL(url, location.origin);
      if (u.origin === location.origin && u.pathname.indexOf("/api/") === 0) {
        return rota(u.pathname, init || {});
      }
    } catch (e) {}
    return fetchOriginal ? fetchOriginal(input, init) : Promise.reject(new Error("fetch indisponivel"));
  };
  window.__skynetBridge = { versao: "1.0.0", backend: SUPA, agente: AGENT, rotasLigadas: LIGADAS, modeloPadrao: MODELO_PADRAO };
  console.log("[bridge] interface ligada ao nosso backend:", SUPA, "| rotas ligadas:", LIGADAS.length);
})();
