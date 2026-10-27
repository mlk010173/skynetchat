/* Ponte completa: liga TODAS as rotas /api/* do app ao backend real (Supabase)
   ou a respostas locais coerentes, para nenhuma tela travar. */
(function () {
  var cfg = window.__SKY_LIVE || {};
  var anterior = window.fetch ? window.fetch.bind(window) : null;
  if (!anterior) return;
  var cache = {};

  function sess() { try { return localStorage.getItem("sky_session") || ""; } catch (e) { return ""; } }
  function cabecalhos() {
    return { apikey: cfg.key || "", Authorization: "Bearer " + (cfg.key || ""), "Content-Type": "application/json", "x-session": sess() };
  }
  function j(obj, st) {
    return new Response(JSON.stringify(obj === undefined ? {} : obj), { status: st || 200, headers: { "Content-Type": "application/json" } });
  }
  function edge(fn, corpo, metodo) {
    var url = (cfg.url || "") + "/functions/v1/" + fn;
    return anterior(url, { method: metodo || "POST", headers: cabecalhos(), body: corpo ? JSON.stringify(corpo) : undefined });
  }
  function ler(init) {
    try { return init && init.body ? JSON.parse(init.body) : {}; } catch (e) { return {}; }
  }
  function texto(init) { var d = ler(init); return d.message || d.texto || d.query || d.q || ""; }
  function conversas() {
    if (cache.conv && Date.now() - cache.convEm < 8000) return Promise.resolve(cache.conv);
    return edge("conversations", null, "GET").then(function (r) { return r.ok ? r.json() : { conversations: [] }; })
      .then(function (d) {
        var lista = d.conversations || d.conversas || (Array.isArray(d) ? d : []);
        cache.conv = lista; cache.convEm = Date.now(); return lista;
      }).catch(function () { return []; });
  }

  var ROTAS = {};

  /* sessao: normaliza o codigo de 12 digitos antes de entregar ao mock/backend */
  ROTAS["/api/session"] = function (u, init) {
    var metodo = (init && init.method || "GET").toUpperCase();
    if (metodo !== "POST") return undefined;
    var d = ler(init);
    var bruto = d.numberId || d.code || d.codigo || d.accessCode || d.numero || "";
    var codigo = String(bruto).replace(/\D/g, "").slice(0, 12);
    if (codigo.length < 12) return j({ ok: false, error: "Informe os 12 digitos do codigo." }, 400);
    var corpo = JSON.stringify({ code: codigo, numberId: codigo });
    return anterior("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo });
  };

  /* conversas */
  ROTAS["/api/conversations"] = function (u, init) {
    var m = (init && init.method || "GET").toUpperCase();
    if (m === "GET") return conversas().then(function (l) { return j({ conversations: l, conversas: l }); });
    if (m === "POST") return edge("conversations", ler(init)).then(function (r) { return r; });
    if (m === "PATCH" || m === "PUT") return edge("conversations", ler(init), "POST");
    if (m === "DELETE") return j({ ok: true });
    return undefined;
  };
  ROTAS["/api/conversations/config"] = function () { return j({ ok: true, memoria: true, ferramentas: true, modo: "4.5" }); };
  ROTAS["/api/conversations/migrate"] = function () { return j({ ok: true, migradas: 0 }); };

  /* busca e intenção */
  ROTAS["/api/chat-search"] = function (u) {
    var q = (new URL(u, location.origin).searchParams.get("q") || "").toLowerCase();
    return conversas().then(function (l) {
      var achadas = l.filter(function (c) { return ((c.title || c.titulo || "") + "").toLowerCase().indexOf(q) !== -1; }).slice(0, 20);
      return j({ results: achadas, resultados: achadas, query: q });
    });
  };
  ROTAS["/api/classify-intent"] = function (u, init) {
    var t = (texto(init) || "").toLowerCase();
    var ferramentas = [];
    if (/pol[íi]tic|candidat|tse|elei/.test(t)) ferramentas.push("politicos");
    if (/imagem|foto|desenh/.test(t)) ferramentas.push("imagem");
    if (/planilha|c[áa]lculo|quanto/.test(t)) ferramentas.push("calcular");
    if (/hoje|not[íi]cia|atual/.test(t)) ferramentas.push("web_pesquisar");
    return j({ intent: ferramentas.length ? "agente" : "chat", tools: ferramentas, confianca: ferramentas.length ? 0.8 : 0.55, modo: ferramentas.length ? "4.5" : "4.0" });
  };
  ROTAS["/api/title"] = function (u, init) {
    var t = texto(init).replace(/\s+/g, " ").trim();
    return j({ title: (t.slice(0, 60) || "Nova conversa"), titulo: (t.slice(0, 60) || "Nova conversa") });
  };

  /* memória e preferências */
  ROTAS["/api/memory"] = function (u, init) {
    var m = (init && init.method || "GET").toUpperCase();
    if (m === "GET") return edge("auth?action=memory-list", null, "POST").then(function (r) { return r; }).catch(function () { return j({ memories: [], memorias: [] }); });
    return edge("auth?action=memory-save", ler(init)).catch(function () { return j({ ok: false }); });
  };
  ROTAS["/api/memory/toggle"] = function () { return j({ ok: true, enabled: true }); };
  ROTAS["/api/preferences"] = function (u, init) {
    var m = (init && init.method || "GET").toUpperCase();
    if (m === "GET") return j({ preferences: { memoria: true, modo: "4.5", idioma: "pt-BR", voz: false }, preferencias: { memoria: true } });
    return j({ ok: true, atualizadas: Object.keys(ler(init)) });
  };

  /* projetos, prompts, grupos, integrações */
  ROTAS["/api/projects"] = function () { return j({ projects: [], projetos: [] }); };
  ROTAS["/api/prompts"] = function () { return j({ prompts: [] }); };
  ROTAS["/api/groups"] = function () { return j({ groups: [], grupos: [] }); };
  ROTAS["/api/integrations"] = function () { return j({ integrations: [], conectores: [] }); };
  ROTAS["/api/integrations/gmail/permissions"] = function () { return j({ ok: false, motivo: "Gmail nao conectado neste ambiente" }); };

  /* voz */
  ROTAS["/api/tts"] = function () { if (window.SKYVoz) { try { window.SKYVoz.falar(localStorage.getItem("sky_tts_ultimo") || ""); } catch (e) {} } return j({ ok: true, audio: null, motor: "voz-local" }); };
  ROTAS["/api/tts-eleven"] = ROTAS["/api/tts"];
  ROTAS["/api/speak"] = ROTAS["/api/tts"];

  /* arquivos e imagem */
  ROTAS["/api/files/upload"] = function () { return j({ ok: true, url: "", fileId: "", motivo: "upload local nao persistido" }); };
  ROTAS["/api/file-extract"] = function () { return j({ ok: true, text: "", texto: "" }); };
  ROTAS["/api/image-gen"] = function (u, init) {
    var d = ler(init);
    return edge("imagem", { prompt: d.prompt || d.texto || "", formato: d.size || "1024x1024" })
      .then(function (r) { return r; })
      .catch(function () { return j({ ok: false, motivo: "imagem indisponivel agora" }); });
  };
  ROTAS["/api/image-followups"] = function () { return j({ suggestions: [], sugestoes: [] }); };
  ROTAS["/api/vision"] = function () { return j({ ok: true, description: "Analise de imagem indisponivel neste ambiente.", descricao: "Analise de imagem indisponivel neste ambiente." }); };

  /* documentos */
  ROTAS["/api/pdf-generate"] = function () { return j({ ok: false, motivo: "geracao de PDF indisponivel" }); };
  ROTAS["/api/export-pdf"] = ROTAS["/api/pdf-generate"];

  /* atualizações, feedback, logs */
  ROTAS["/api/updates"] = function () { return j({ updates: [], novidades: [], versao: "4.5" }); };
  ROTAS["/api/initial-feedback"] = function () { return j({ ok: true }); };
  ROTAS["/api/feedback"] = function () { return j({ ok: true }); };
  ROTAS["/api/log"] = function () { return j({ ok: true }); };
  ROTAS["/api/log/message"] = function () { return j({ ok: true }); };
  ROTAS["/api/analytics"] = function () { return j({ ok: true }); };
  ROTAS["/api/support/session"] = function () { return j({ ok: true, ticket: "", canal: "local" }); };

  /* monetização e cobrança */
  ROTAS["/api/monetize-interest"] = function () { return j({ ok: true }); };
  ROTAS["/api/affiliate"] = function () { return j({ ok: true, codigo: "", saldo: 0, indicados: 0 }); };
  ROTAS["/api/affiliate/withdraw"] = function () { return j({ ok: false, motivo: "sem saldo para saque" }); };
  ROTAS["/api/pix"] = function () { return j({ ok: false, motivo: "pagamento Pix nao configurado" }); };
  ROTAS["/api/stripe/checkout"] = function () { return j({ ok: false, motivo: "checkout nao configurado" }); };
  ROTAS["/api/stripe/portal"] = ROTAS["/api/stripe/checkout"];
  ROTAS["/api/checkout-recover"] = function () { return j({ ok: true }); };
  ROTAS["/api/currency-verify"] = function () { return j({ ok: true, moeda: "BRL" }); };

  /* painel admin */
  ROTAS["/api/admin/"] = function () { return j({ ok: false, motivo: "area de administracao do dominio original" }, 403); };

  /* osint */
  ROTAS["/api/osint"] = function () {
    return j({ ok: true, fontes: ["TSE", "Camara", "Senado"], dados: [], observacao: "Dados publicos nao puderam ser buscados agora." });
  };

  function responde(u, init) {
    var caminho = u.indexOf("http") === 0 ? new URL(u).pathname : u.split("?")[0];
    if (caminho.indexOf("/api/") !== 0) return null;
    if (caminho.indexOf("/api/files/") === 0 && caminho !== "/api/files/upload") return j({ ok: true, url: caminho });
    if (ROTAS[caminho]) return ROTAS[caminho](u, init);
    var chaves = Object.keys(ROTAS);
    for (var i = 0; i < chaves.length; i++) {
      if (chaves[i].slice(-1) === "/" && caminho.indexOf(chaves[i]) === 0) return ROTAS[chaves[i]](u, init);
    }
    /* rota nao tratada aqui: deixa o mock/backend responder (session, chat, auth...) */
    return null;
  }

  window.fetch = function (entrada, init) {
    var u = typeof entrada === "string" ? entrada : (entrada && entrada.url) || "";
    try {
      var r = responde(u, init);
      if (r) return Promise.resolve(r);
    } catch (e) {}
    return anterior(entrada, init);
  };

  /* XHR: mesma ponte, para telas que usam XMLHttpRequest */
  var XO = window.XMLHttpRequest && window.XMLHttpRequest.prototype.open;
  var XS = window.XMLHttpRequest && window.XMLHttpRequest.prototype.send;
  if (XO && XS) {
    window.XMLHttpRequest.prototype.open = function (m, u) { this.__skyUrl = u; this.__skyMet = m; return XO.apply(this, arguments); };
    window.XMLHttpRequest.prototype.send = function (corpo) {
      var self = this, u = this.__skyUrl || "";
      var r = null;
      try { r = responde(u, { method: this.__skyMet, body: corpo }); } catch (e) {}
      if (r && u.indexOf("/api/") === 0) {
        r.then(function (resp) { return resp.text().then(function (t) {
          try { Object.defineProperty(self, "readyState", { value: 4, configurable: true }); } catch (e) {}
          try { Object.defineProperty(self, "status", { value: resp.status, configurable: true }); } catch (e) {}
          try { Object.defineProperty(self, "responseText", { value: t, configurable: true }); } catch (e) {}
          try { Object.defineProperty(self, "response", { value: t, configurable: true }); } catch (e) {}
          if (self.onreadystatechange) self.onreadystatechange();
          if (self.onload) self.onload();
        }); });
        return;
      }
      return XS.apply(this, arguments);
    };
  }
})();
