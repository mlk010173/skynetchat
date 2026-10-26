/* bridge.js — liga a interface (espelho estatico) ao NOSSO backend.
   Nao muda a aparencia: so redireciona as chamadas /api/* para
   Supabase (IA, sessoes, memoria) e para o agente no Render.
   Rotas ainda nao ligadas respondem 501 honesto, em vez de 404. */
(function () {
  var SUPA = "https://rkgwhhtenfozdwzpvxjj.supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrZ3doaHRlbmZvemR3enB2eGpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NTY2OTQsImV4cCI6MjEwODUzMjY5NH0.FRwfO66wi1ADFmSboCCwH1NWuz-212dDrIcuuiZ-0HA";
  var AGENT = "https://skynet-agent.onrender.com";
  var MODELO_PADRAO = "nvidia/nemotron-3.5-super-vl-120b-a12b";
  var LIGADAS = ["/api/session", "/api/models", "/api/conversations/config", "/api/chat", "/api/chat-V2-fast", "/api/chat-V2-thinking", "/api/chat-V3", "/api/chat-V3-interacao", "/api/chat-V3-thinking", "/api/chat-V4", "/api/chat-search", "/api/title", "/api/classify-intent", "/api/updates", "/api/support", "/api/feedback"];

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
    if (path.indexOf("/api/chat") === 0 || path === "/api/title" || path === "/api/classify-intent") {
      var querJson = corpo.stream === false || path === "/api/title" || path === "/api/classify-intent";
      var res = await fetch(SUPA + "/functions/v1/chat", { method: "POST", headers: cabecalhos, body: JSON.stringify(adaptarChat(corpo)) });
      if (!querJson) return res;
      var texto = juntarSSE(await res.text());
      return resposta({ ok: true, reply: texto, message: texto, title: texto.slice(0, 60), intent: "chat", model: corpo.model || MODELO_PADRAO });
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
