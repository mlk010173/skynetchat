/* Chat funcional na interface: assume o envio do composer e fala direto com o backend.
   Carregado depois do mock.js nas paginas de chat. */
(function () {
  var cfg = window.__SKY_LIVE || {};
  if (!cfg.url || !cfg.key) return;
  var enviando = false;

  function sessao() { try { return localStorage.getItem("sky_session") || ""; } catch (e) { return ""; } }
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

  async function enviar() {
    var texto = textoDoComposer();
    if (!texto || enviando) return;
    enviando = true;
    limparComposer();
    bolha("user", texto);
    var alvo = bolha("bot", "");
    var t0 = Date.now();
    var corpo = { content: texto, model: "auto" };
    if (conv()) corpo.conversationId = conv();
    var headers = { "Content-Type": "application/json", "apikey": cfg.key, "Authorization": "Bearer " + cfg.key };
    var s = sessao();
    if (s) headers["x-session"] = s;
    try {
      var r = await fetch(cfg.url + "/functions/v1/chat", { method: "POST", headers: headers, body: JSON.stringify(corpo) });
      if (!r.ok || !r.body) {
        var err = await r.text().catch(function () { return ""; });
        alvo.textContent = "Nao consegui falar com o servidor (HTTP " + r.status + ")." + (err ? " " + err.slice(0, 160) : "");
        return;
      }
      var reader = r.body.getReader(), dec = new TextDecoder(), buf = "", modelo = "", tentativas = [], completo = "";
      for (;;) {
        var x = await reader.read();
        if (x.done) break;
        buf += dec.decode(x.value, { stream: true });
        var partes = buf.split("\n\n");
        buf = partes.pop() || "";
        for (var i = 0; i < partes.length; i++) {
          var linha = partes[i].trim();
          if (linha.indexOf("data:") !== 0) continue;
          var dados;
          try { dados = JSON.parse(linha.slice(5).trim()); } catch (e) { continue; }
          if (dados.delta) { completo += dados.delta; alvo.textContent = completo; }
          if (dados.done) {
            modelo = dados.model || "";
            tentativas = dados.tentativas || [];
            if (dados.conversationId) guardarConv(dados.conversationId);
          }
          var tEl = document.querySelector("[data-sky-thread]");
          if (tEl) tEl.scrollTop = tEl.scrollHeight;
        }
      }
      if (!completo) alvo.textContent = "O servidor respondeu vazio. Tente de novo.";
      passos(Date.now() - t0, modelo, tentativas, "");
    } catch (e) {
      alvo.textContent = "Falha de conexao: " + (e && e.message ? e.message : "erro");
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

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", interceptar);
  else interceptar();
})();
