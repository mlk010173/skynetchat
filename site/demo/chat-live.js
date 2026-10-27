/* Chat funcional na interface: assume o envio do composer e fala direto com o backend.
   Carregado depois do mock.js nas paginas de chat. */
(function () {
  var cfg = window.__SKY_LIVE || {};
  if (!cfg.url || !cfg.key) return;
  var enviando = false;
  var BASE_PAGINAS = location.pathname.indexOf("/skynetchat") === 0 ? "/skynetchat" : "";

  function sessao() { try { return localStorage.getItem("sky_session") || ""; } catch (e) { return ""; } }
  function convDaUrl() {
    try {
      var q = new URLSearchParams(location.search);
      return (q.get("conv") || q.get("c") || "").trim();
    } catch (e) { return ""; }
  }
  function slugAtual() { var m = location.pathname.replace(BASE_PAGINAS, "").match(/^\/chat\/([^/?#]+)/); return m ? m[1] : convDaUrl(); }
  function mapa() { try { return JSON.parse(localStorage.getItem("sky_conv_map") || "{}"); } catch (e) { return {}; } }
  function guardarMapa(slug, id) { try { if (!slug || !id) return; var m = mapa(); m[slug] = id; localStorage.setItem("sky_conv_map", JSON.stringify(m)); } catch (e) {} }
  function apiBase() { return cfg.url + "/functions/v1/"; }
  function cabecalhos() {
    var h = { "Content-Type": "application/json", "apikey": cfg.key, "Authorization": "Bearer " + cfg.key };
    var s = sessao(); if (s) h["x-session"] = s;
    return h;
  }
  function conv() { try { return sessionStorage.getItem("sky_conv_id") || ""; } catch (e) { return ""; } }
  function guardarConv(id) { try { if (id) sessionStorage.setItem("sky_conv_id", id); } catch (e) {} }

  function estilo(el, css) { el.style.cssText = css; return el; }

  function garantirThread() {
    var t = document.querySelector("[data-sky-thread]");
    if (t) return t;
    var host = document.querySelector(".app-content") || document.body;
    t = document.createElement("div");
    t.setAttribute("data-sky-thread", "1");
    estilo(t, "position:fixed;left:0;right:0;top:56px;bottom:104px;overflow-y:auto;padding:18px 16px 8px;z-index:30;display:flex;flex-direction:column;gap:14px;pointer-events:auto;scrollbar-width:thin");
    var inner = document.createElement("div");
    inner.style.cssText = "width:100%;max-width:780px;margin:0 auto;display:flex;flex-direction:column;gap:14px";
    inner.setAttribute("data-thread-inner", "1");
    t.appendChild(inner);
    host.appendChild(t);
    return t;
  }

  function bolha(quem, texto) {
    var t = garantirThread();
    var inner = t.querySelector("[data-thread-inner]");
    var b = document.createElement("div");
    var user = quem === "user";
    estilo(b, "max-width:88%;padding:11px 14px;border-radius:14px;font:14px/1.55 ui-sans-serif,system-ui;white-space:pre-wrap;word-break:break-word;" +
      (user ? "align-self:flex-end;background:#1f6feb;color:#fff;border-bottom-right-radius:5px" : "align-self:flex-start;background:#141414;color:#eaeaea;border:1px solid #262626;border-bottom-left-radius:5px"));
    b.textContent = texto;
    inner.appendChild(b);
    t.scrollTop = t.scrollHeight;
    return b;
  }

  function passos(ms, modelo, tentativas, aviso) {
    var t = garantirThread();
    var inner = t.querySelector("[data-thread-inner]");
    var box = document.createElement("div");
    estilo(box, "align-self:flex-start;max-width:88%;font:12px/1.5 ui-sans-serif,system-ui;color:#9a9a9a");
    var cab = document.createElement("div");
    estilo(cab, "display:flex;align-items:center;gap:8px;cursor:pointer;color:#dcdcdc;padding:2px 0");
    var qtd = 2 + (tentativas && tentativas.length ? 1 : 0);
    cab.innerHTML = '<span style="color:#2ea043">\u25CF</span> Pensou por ' + (ms / 1000).toFixed(1).replace(".", ",") + "s \u00B7 " + qtd + " etapas";
    var corpo = document.createElement("div");
    estilo(corpo, "display:none;border-left:1px solid #2b2b2b;margin-left:5px;padding:4px 0 2px 12px");
    var linhas = [
      ["Pedido recebido", "O backend escolhe o modelo sozinho, olhando disponibilidade e latencia."],
      ["Modelo escolhido", modelo || "auto"]
    ];
    if (tentativas && tentativas.length) linhas.push(["Tentativas", tentativas.join(" \u2192 ")]);
    if (aviso) linhas.push(["Observacao", aviso]);
    linhas.forEach(function (l) {
      var d = document.createElement("div");
      d.style.cssText = "padding:3px 0;display:flex;gap:8px";
      d.innerHTML = '<span style="color:#2ea043">\u2713</span><div><div style="color:#dcdcdc">' + l[0] + '</div><div style="color:#8a8a8a">' + l[1] + "</div></div>";
      corpo.appendChild(d);
    });
    cab.onclick = function () { corpo.style.display = corpo.style.display === "none" ? "block" : "none"; };
    box.appendChild(cab);
    box.appendChild(corpo);
    inner.appendChild(box);
    t.scrollTop = t.scrollHeight;
    return box;
  }

  function textoDoComposer() {
    var ta = document.querySelector("textarea");
    return ta ? (ta.value || "").trim() : "";
  }
  function limparComposer() {
    var ta = document.querySelector("textarea");
    if (ta) { ta.value = ""; ta.dispatchEvent(new Event("input", { bubbles: true })); }
  }



  /* ---------- voz no chat ---------- */
  var autoFalar = true;
  function montarVoz() {
    if (!window.SKYVoz || document.querySelector("[data-sky-voz]")) return;
    var box = document.createElement("div");
    box.setAttribute("data-sky-voz", "1");
    box.style.cssText = "position:fixed;right:14px;bottom:112px;z-index:40;display:flex;gap:8px";

    var mic = document.createElement("button");
    mic.type = "button"; mic.textContent = "🎙"; mic.title = "Falar em vez de digitar";
    var fal = document.createElement("button");
    fal.type = "button"; fal.textContent = "🔊"; fal.title = "Falar as respostas";
    [mic, fal].forEach(function (b) {
      b.style.cssText = "width:40px;height:40px;border-radius:50%;border:1px solid #2b2b2b;background:#141414;color:#e6e6e6;font-size:17px;cursor:pointer";
    });

    var rec = null, ouvindo = false;
    mic.onclick = function () {
      if (!window.SKYVoz.suportaMicrofone()) { alert("Este navegador não faz reconhecimento de voz. Use o Chrome ou o Edge."); return; }
      if (ouvindo) { try { rec && rec.stop(); } catch (e) {} ouvindo = false; mic.style.borderColor = "#2b2b2b"; return; }
      window.SKYVoz.parar();
      ouvindo = true; mic.style.borderColor = "#ef4444"; mic.style.background = "#241414";
      var dito = "";
      rec = window.SKYVoz.ouvir({
        onTexto: function (parcial, final) {
          var ta = document.querySelector("textarea");
          if (ta) { ta.value = (final || parcial); ta.dispatchEvent(new Event("input", { bubbles: true })); }
          if (final) dito = final;
        },
        onFim: function () {
          ouvindo = false; mic.style.borderColor = "#2b2b2b"; mic.style.background = "#141414";
          if (dito && dito.trim()) enviar();
        },
        onErro: function () { ouvindo = false; mic.style.borderColor = "#2b2b2b"; mic.style.background = "#141414"; }
      });
      if (!rec) { ouvindo = false; mic.style.borderColor = "#2b2b2b"; }
    };

    fal.onclick = function () {
      autoFalar = !autoFalar;
      fal.textContent = autoFalar ? "🔊" : "🔇";
      fal.style.opacity = autoFalar ? "1" : ".6";
      if (!autoFalar) window.SKYVoz.parar();
    };

    var studio = document.createElement("a");
    studio.href = "/voz/"; studio.textContent = "🎧"; studio.title = "Abrir o Studio de Voz";
    studio.style.cssText = "width:40px;height:40px;border-radius:50%;border:1px solid #2b2b2b;background:#141414;color:#e6e6e6;font-size:17px;display:grid;place-items:center;text-decoration:none";

    box.appendChild(mic); box.appendChild(fal); box.appendChild(studio);
    document.body.appendChild(box);
    window.__skyAutoFalar = function () { return autoFalar; };
  }

  /* ---------- historico ---------- */
  function limparThread() {
    var t = document.querySelector("[data-sky-thread]");
    if (!t) return;
    var inner = t.querySelector("[data-thread-inner]");
    if (inner) inner.innerHTML = "";
  }

  function renderMensagens(lista) {
    limparThread();
    (lista || []).forEach(function (m) {
      if (!m || !m.content) return;
      var quem = m.role === "user" ? "user" : "bot";
      var b = bolha(quem, m.content);
      if (quem === "bot" && m.model) {
        var tag = document.createElement("div");
        tag.style.cssText = "font:11px/1.4 ui-sans-serif,system-ui;color:#7a7a7a;margin-top:-6px";
        tag.textContent = m.model;
        b.parentElement.appendChild(tag);
      }
    });
  }

  function quando(iso) {
    try {
      var d = new Date(iso), hoje = new Date();
      var dias = Math.floor((hoje - d) / 86400000);
      if (dias <= 0) return "hoje " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      if (dias === 1) return "ontem";
      if (dias < 7) return dias + " dias";
      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    } catch (e) { return ""; }
  }

  async function carregarConversa(id) {
    try {
      var r = await fetch(apiBase() + "conversations?id=" + encodeURIComponent(id), { headers: cabecalhos() });
      var d = await r.json();
      if (!d || !d.ok) return false;
      renderMensagens(d.messages);
      return true;
    } catch (e) { return false; }
  }

  function montarHistorico() { return;
    if (document.querySelector("[data-sky-hist-btn]")) return;
    var b = document.createElement("button");
    b.setAttribute("data-sky-hist-btn", "1");
    b.type = "button";
    b.textContent = "Histórico";
    b.style.cssText = "position:fixed;left:12px;bottom:14px;z-index:30;font:12px/1 ui-sans-serif,system-ui;padding:8px 11px;border-radius:9px;border:1px solid #2b2b2b;background:#141414;color:#dcdcdc;cursor:pointer";
    var painel = document.createElement("div");
    painel.setAttribute("data-sky-hist-panel", "1");
    painel.style.cssText = "position:fixed;left:12px;bottom:52px;z-index:31;width:min(330px,88vw);max-height:60vh;overflow-y:auto;display:none;background:#111;border:1px solid #2b2b2b;border-radius:12px;padding:8px;box-shadow:0 12px 34px rgba(0,0,0,.55)";
    b.onclick = async function () {
      if (painel.style.display === "block") { painel.style.display = "none"; return; }
      painel.style.display = "block";
      painel.innerHTML = '<div style="font:12px ui-sans-serif;color:#8a8a8a;padding:6px 8px">Carregando…</div>';
      try {
        var r = await fetch(apiBase() + "conversations", { headers: cabecalhos() });
        var d = await r.json();
        var lista = (d && d.conversations) || [];
        painel.innerHTML = "";
        if (!lista.length) {
          painel.innerHTML = '<div style="font:12px ui-sans-serif;color:#8a8a8a;padding:8px">Nenhuma conversa ainda.</div>';
          return;
        }
        lista.forEach(function (c) {
          var item = document.createElement("button");
          item.type = "button";
          item.style.cssText = "display:block;width:100%;text-align:left;padding:8px 9px;border:0;border-radius:8px;background:transparent;color:#dcdcdc;cursor:pointer;font:13px/1.35 ui-sans-serif,system-ui";
          item.onmouseenter = function () { item.style.background = "#1c1c1c"; };
          item.onmouseleave = function () { item.style.background = "transparent"; };
          var titulo = document.createElement("div");
          titulo.textContent = c.title || "Conversa sem título";
          titulo.style.cssText = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
          var meta = document.createElement("div");
          meta.textContent = quando(c.updated_at);
          meta.style.cssText = "font-size:11px;color:#7a7a7a;margin-top:2px";
          item.appendChild(titulo); item.appendChild(meta);
          item.onclick = async function () {
            painel.style.display = "none";
            guardarConv(c.id); guardarMapa(slugAtual(), c.id);
            var ok = await carregarConversa(c.id);
            if (!ok) alert("Não consegui abrir essa conversa agora.");
          };
          painel.appendChild(item);
        });
      } catch (e) {
        painel.innerHTML = '<div style="font:12px ui-sans-serif;color:#e33;padding:8px">Falha ao carregar o histórico.</div>';
      }
    };
    document.body.appendChild(b);
    document.body.appendChild(painel);
  }

  async function restaurarAoAbrir() {
    if (!sessao()) return;
    var id = mapa()[slugAtual()] || conv() || (convDaUrl() && /^[0-9a-f-]{8,}$/i.test(convDaUrl()) ? convDaUrl() : "");
    if (!id) return;
    guardarConv(id);
    await carregarConversa(id);
  }

  /* ---- painel de pensamento ao vivo (streaming) ---- */
  function criarPainel() {
    var t = garantirThread();
    var inner = t.querySelector("[data-thread-inner]");
    var box = document.createElement("div");
    estilo(box, "align-self:flex-start;max-width:88%;font:12px/1.5 ui-sans-serif,system-ui;color:#9a9a9a");
    box.setAttribute("data-sky-pensar", "1");
    var cab = document.createElement("div");
    estilo(cab, "display:flex;align-items:center;gap:8px;cursor:pointer;color:#dcdcdc;padding:2px 0");
    var ponto = document.createElement("span");
    estilo(ponto, "color:#d29922;font-size:9px;line-height:1");
    ponto.textContent = "\u25CF";
    var rotulo = document.createElement("span");
    rotulo.textContent = "Pensando\u2026";
    var contador = document.createElement("span");
    estilo(contador, "color:#6e6e6e");
    cab.appendChild(ponto); cab.appendChild(rotulo); cab.appendChild(contador);
    var corpo = document.createElement("div");
    estilo(corpo, "display:block;border-left:1px solid #2b2b2b;margin-left:5px;padding:4px 0 2px 12px;max-height:220px;overflow:auto");
    box.appendChild(cab); box.appendChild(corpo);
    inner.appendChild(box);
    t.scrollTop = t.scrollHeight;

    var etapas = [], raciocinio = null, modelo = "", tentativas = [], aberto = true;
    function rolar() { t.scrollTop = t.scrollHeight; }
    function linha(icone, cor, titulo, detalhe) {
      var d = document.createElement("div");
      d.style.cssText = "padding:3px 0;display:flex;gap:8px";
      var i = document.createElement("span"); i.style.color = cor; i.textContent = icone;
      var c = document.createElement("div");
      var a = document.createElement("div"); a.style.color = "#dcdcdc"; a.textContent = titulo;
      c.appendChild(a);
      if (detalhe) { var b = document.createElement("div"); b.style.color = "#8a8a8a"; b.textContent = detalhe; c.appendChild(b); }
      d.appendChild(i); d.appendChild(c);
      corpo.appendChild(d); rolar();
      return { caixa: d, detalhe: c };
    }
    cab.onclick = function () {
      aberto = !aberto;
      corpo.style.display = aberto ? "block" : "none";
    };
    return {
      etapa: function (p) {
        var titulo = p.titulo || p.ferramenta || "Ferramenta";
        var chave = p.ferramenta || titulo;
        var atual = null;
        for (var i = 0; i < etapas.length; i++) if (etapas[i].chave === chave) { atual = etapas[i]; break; }
        if (p.estado === "executando") {
          if (!atual) { atual = linha("\u25CB", "#d29922", titulo, "executando\u2026"); atual.chave = chave; etapas.push(atual); }
          else { atual.caixa.querySelector("span").style.color = "#d29922"; }
          ponto.style.color = "#d29922";
          return;
        }
        var ok = p.estado !== "falhou";
        var detalhe = ok ? (p.fontes && p.fontes.length ? "fontes: " + p.fontes.length : "concluida") : (p.erro || "falhou");
        if (!atual) { atual = linha(ok ? "\u2713" : "\u2715", ok ? "#2ea043" : "#f85149", titulo, detalhe); atual.chave = chave; etapas.push(atual); }
        else {
          atual.caixa.querySelector("span").textContent = ok ? "\u2713" : "\u2715";
          atual.caixa.querySelector("span").style.color = ok ? "#2ea043" : "#f85149";
          var det = atual.detalhe.querySelector("div");
          if (!det) { det = document.createElement("div"); det.style.color = "#8a8a8a"; atual.detalhe.appendChild(det); }
          det.textContent = detalhe;
        }
        contador.textContent = "\u00B7 " + etapas.length + " etapa" + (etapas.length > 1 ? "s" : "");
        rolar();
      },
      modelo: function (m, tt) {
        modelo = m || "auto"; tentativas = tt || [];
        linha("\u2713", "#2ea043", "Modelo escolhido", modelo + (tentativas.length > 1 ? " \u2190 tentativas: " + tentativas.join(" \u2192 ") : ""));
        contador.textContent = "\u00B7 " + (etapas.length + 1) + " etapas";
      },
      raciocinio: function (txt) {
        if (!raciocinio) {
          raciocinio = linha("\u2026", "#58a6ff", "Racioc\u00EDnio", "");
          raciocinio.texto = "";
        }
        raciocinio.texto += txt;
        var det = raciocinio.detalhe.querySelector("div");
        if (!det) { det = document.createElement("div"); det.style.cssText = "color:#8a8a8a;white-space:pre-wrap"; raciocinio.detalhe.appendChild(det); }
        det.textContent = raciocinio.texto.length > 400 ? "\u2026" + raciocinio.texto.slice(-400) : raciocinio.texto;
        contador.textContent = "\u00B7 " + (etapas.length + (modelo ? 1 : 0) + 1) + " etapas";
        rolar();
      },
      finalizar: function (ms, erro) {
        aberto = false;
        corpo.style.display = "none";
        ponto.style.color = erro ? "#f85149" : "#2ea043";
        var qtd = etapas.length + (modelo ? 1 : 0) + (raciocinio ? 1 : 0);
        rotulo.textContent = "Pensou por " + (ms / 1000).toFixed(1).replace(".", ",") + "s";
        contador.textContent = "\u00B7 " + qtd + " etapa" + (qtd === 1 ? "" : "s");
        if (erro) { linha("\u2715", "#f85149", "Falhou", erro); corpo.style.display = "none"; }
        rolar();
      }
    };
  }

  async function enviar() {
    var texto = textoDoComposer();
    if (!texto || enviando) return;
    enviando = true;
    limparComposer();
    bolha("user", texto);
    var alvo = bolha("bot", "");
    var cursor = document.createElement("span");
    cursor.textContent = "\u258F";
    cursor.style.cssText = "opacity:.6";
    alvo.appendChild(cursor);
    var painel = criarPainel();
    var t0 = Date.now();
    var corpo = { content: texto, model: "auto", stream: true };
    if (conv()) corpo.conversationId = conv();
    var falha = "";
    try {
      var r = await fetch(cfg.url + "/functions/v1/chat", { method: "POST", headers: cabecalhos(), body: JSON.stringify(corpo) });
      if (!r.ok || !r.body) {
        var err = await r.text().catch(function () { return ""; });
        falha = "HTTP " + r.status + (err ? " " + err.slice(0, 160) : "");
        alvo.textContent = "Nao consegui falar com o servidor (" + falha + ").";
        painel.finalizar(Date.now() - t0, falha);
        return;
      }
      var meta = {};
      var completo = await window.SKYStream.ler(r, {
        onTexto: function (txt) { alvo.textContent = txt; alvo.appendChild(cursor); var t = document.querySelector("[data-sky-thread]"); if (t) t.scrollTop = t.scrollHeight; },
        onDado: function (p) {
          if (!p) return;
          if (p.tipo === "etapa") painel.etapa(p);
          else if (p.tipo === "modelo") painel.modelo(p.modelo, p.tentativas);
          else if (p.tipo === "raciocinio") painel.raciocinio(p.texto || "");
        },
        onErro: function (m) { falha = m || "erro"; },
        onFim: function (d) { meta = d || {}; }
      });
      if (cursor.parentNode) cursor.remove();
      if (!completo) alvo.textContent = falha ? "Erro: " + falha : "O servidor respondeu vazio. Tente de novo.";
      if (meta.conversationId) { guardarConv(meta.conversationId); guardarMapa(slugAtual(), meta.conversationId); }
      painel.finalizar(Date.now() - t0, falha);
      if (!falha && completo && autoFalar && window.SKYVoz) { try { window.SKYVoz.falar(completo, { onProgresso: function () {} }); } catch (e) {} }
    } catch (e) {
      if (cursor.parentNode) cursor.remove();
      falha = e && e.message ? e.message : "erro";
      alvo.textContent = "Falha de conexao: " + falha;
      painel.finalizar(Date.now() - t0, falha);
    } finally {
      enviando = false;
    }
  }

  function interceptar() {
    document.addEventListener("submit", function (ev) {
      var f = ev.target;
      if (!f || !f.querySelector || !f.querySelector("textarea")) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      enviar();
    }, true);
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" || ev.shiftKey || ev.ctrlKey || ev.altKey) return;
      var alvo = ev.target;
      if (!alvo || alvo.tagName !== "TEXTAREA") return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      enviar();
    }, true);
    document.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('[aria-label="Enviar mensagem"]') : null;
      if (!b) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      enviar();
    }, true);
  }

  function iniciar() {
    interceptar();
    montarVoz();
    /* painel flutuante de historico removido: o site usa o item da barra lateral */
    setTimeout(restaurarAoAbrir, 700);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
