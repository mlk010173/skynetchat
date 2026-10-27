/* Ponte de autenticação no DOM.
   O espelho é estático: os formulários do site original chamam o servidor do SvelteKit
   (que não existe aqui). Este script liga os três fluxos ao backend real:
   /login/ (entrar com código), /sign-up/ (gerar código) e /recovery/ (recuperar por e-mail). */
(function () {
  var cfg = window.__SKY_AUTH;
  if (!cfg) return;
  window.__SKY_UI = "2";

  /* ---------- utilidades ---------- */
  function toast(msg, erro) {
    var el = document.getElementById("sky-auth-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "sky-auth-toast";
      el.style.cssText =
        "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:99999;" +
        "max-width:min(92vw,520px);padding:12px 16px;border-radius:12px;font:14px/1.45 ui-sans-serif,system-ui;" +
        "box-shadow:0 12px 40px rgba(0,0,0,.55);transition:opacity .18s";
      document.body.appendChild(el);
    }
    el.style.background = erro ? "#2a1113" : "#101a12";
    el.style.color = erro ? "#ff8b8b" : "#bfe9c8";
    el.style.border = "1px solid " + (erro ? "#5c1f24" : "#204a2b");
    el.textContent = msg;
    el.style.opacity = "1";
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.opacity = "0"; }, 6500);
  }

  function sessao(t) {
    try { if (t) localStorage.setItem("sky_session", t); } catch (e) {}
  }
  function token() {
    try { return localStorage.getItem("sky_session") || ""; } catch (e) { return ""; }
  }

  function api(acao, corpo) {
    var h = { "Content-Type": "application/json", apikey: cfg.key, Authorization: "Bearer " + cfg.key };
    var t = token();
    if (t) h["x-session"] = t;
    return fetch(cfg.url + "/functions/v1/auth?action=" + acao, {
      method: "POST",
      headers: h,
      body: JSON.stringify(corpo || {}),
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: "resposta inválida" }; });
    });
  }

  /* ---------- código de 12 dígitos ---------- */
  function digitos(txt) { return String(txt || "").replace(/\D/g, "").slice(0, 12); }
  function formata(d) {
    d = digitos(d);
    var p = [d.slice(0, 4), d.slice(4, 8), d.slice(8, 12)].filter(Boolean);
    return p.join("-");
  }

  function campoCodigo() {
    var ins = [].slice.call(document.querySelectorAll("input"));
    for (var i = 0; i < ins.length; i++) {
      var ph = ins[i].getAttribute("placeholder") || "";
      if (/0{4}/.test(ph) || ins[i].type === "tel" || ins[i].inputMode === "numeric") return ins[i];
    }
    return null;
  }
  function campoEmail() {
    var ins = [].slice.call(document.querySelectorAll("input"));
    for (var i = 0; i < ins.length; i++) {
      if ((ins[i].type || "").toLowerCase() === "email") return ins[i];
      if (/@/.test(ins[i].getAttribute("placeholder") || "")) return ins[i];
    }
    return null;
  }

  /* ---------- overlay do código gerado ---------- */
  function mostrarCodigo(codigo) {
    var old = document.getElementById("sky-code-card");
    if (old) old.remove();
    var box = document.createElement("div");
    box.id = "sky-code-card";
    box.style.cssText =
      "position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;" +
      "background:rgba(0,0,0,.82);font:15px/1.6 ui-sans-serif,system-ui;color:#f2f2f2;padding:20px";
    box.innerHTML =
      '<div style="max-width:460px;width:100%;background:#0d0d0f;border:1px solid #232327;border-radius:16px;padding:24px">' +
      '<div style="font-size:12px;letter-spacing:.14em;color:#8b8b93;margin-bottom:10px">CONTA CRIADA</div>' +
      '<div style="font-size:14px;color:#c9c9d1;margin-bottom:6px">Este é o seu código secreto de acesso. Ele é a chave da conta:</div>' +
      '<div id="sky-code-val" style="font:600 26px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.06em;color:#fff;background:#15151a;border:1px solid #26262c;border-radius:12px;padding:14px;text-align:center;margin:14px 0">' +
      codigo +
      "</div>" +
      '<div style="font-size:12.5px;color:#9a9aa4;margin-bottom:16px">Guarde agora. Ele fica cifrado em AES-256 no servidor e só pode ser recuperado pelo e-mail de recuperação.</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
      '<button id="sky-code-copy" style="flex:1 1 140px;padding:11px 14px;border-radius:10px;border:1px solid #2c2c33;background:#17171c;color:#e8e8ee;cursor:pointer">Copiar</button>' +
      '<button id="sky-code-go" style="flex:1 1 140px;padding:11px 14px;border-radius:10px;border:0;background:#e2373f;color:#fff;font-weight:600;cursor:pointer">Entrar agora</button>' +
      "</div></div>";
    document.body.appendChild(box);

    document.getElementById("sky-code-copy").onclick = function () {
      navigator.clipboard.writeText(codigo).then(
        function () { toast("Código copiado."); },
        function () { toast("Não deu para copiar. Selecione o código na tela.", true); },
      );
    };
    document.getElementById("sky-code-go").onclick = function () { entrar(codigo); };
  }

  /* ---------- ações ---------- */
  function entrar(codigo) {
    var d = digitos(codigo);
    if (d.length !== 12) return toast("O código tem 12 dígitos.", true);
    toast("Entrando...");
    return api("login", { code: d }).then(function (r) {
      if (r && r.ok && r.session) {
        sessao(r.session);
        toast("Código aceito. Abrindo o chat...");
        location.href = "/chat/";
        return true;
      }
      toast((r && (r.error || r.message)) || "Código não encontrado.", true);
      return false;
    });
  }

  function criarConta() {
    toast("Gerando seu código secreto...");
    return api("access-code", { termsAccepted: true, ageConfirmed: true }).then(function (r) {
      if (r && r.ok && r.code) {
        sessao(r.session);
        mostrarCodigo(r.code);
        return true;
      }
      toast((r && (r.error || r.error?.message)) || "Não consegui criar a conta agora.", true);
      return false;
    });
  }

  function recuperar(email) {
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(email || "").trim())) {
      return toast("Digite um e-mail válido.", true);
    }
    toast("Pedindo o código por e-mail...");
    return api("recovery-request", { email: String(email).trim() }).then(function (r) {
      if (r && r.ok) {
        toast(r.aviso || "Se este e-mail estiver cadastrado, o código chega em instantes.");
      } else {
        toast((r && r.error) || "Não consegui pedir agora.", true);
      }
      return true;
    });
  }

  /* ---------- ligação com a interface ---------- */
  var rota = location.pathname;
  function texto(el) { return (el && (el.innerText || el.textContent) || "").trim().toUpperCase(); }

  function botaoPorTexto(...alvos) {
    var bs = [].slice.call(document.querySelectorAll("button,[role=button],a"));
    for (var i = 0; i < bs.length; i++) {
      var t = texto(bs[i]);
      for (var j = 0; j < alvos.length; j++) if (t === alvos[j] || t.indexOf(alvos[j]) === 0) return bs[i];
    }
    return null;
  }

  document.addEventListener(
    "click",
    function (ev) {
      var b = ev.target.closest && ev.target.closest("button,[role=button],a");
      if (!b) return;
      var t = texto(b);

      if (/^\s*ENTRAR/.test(t) && rota.indexOf("/login") === 0) {
        ev.preventDefault();
        ev.stopPropagation();
        var c = campoCodigo();
        entrar(c ? c.value : "");
        return;
      }
      var criaConta = t.indexOf("CRIAR CONTA") === 0 || t.indexOf("CADASTRAR") === 0 ||
        /GERAR C[OÓ]DIGO/.test(t) || /GERAR ACESSO/.test(t) || /CRIAR MINHA CONTA/.test(t);
      if (criaConta && rota.indexOf("/sign-up") === 0) {
        ev.preventDefault();
        ev.stopPropagation();
        criarConta();
        return;
      }
      if (/ENVIAR|RECUPERAR|SOLICITAR|GERAR/.test(t) && rota.indexOf("/recovery") === 0) {
        var mail = campoEmail();
        if (mail) {
          ev.preventDefault();
          ev.stopPropagation();
          recuperar(mail.value);
        }
      }
    },
    true,
  );

  /* Enter no campo de código entra direto */
  document.addEventListener(
    "keydown",
    function (ev) {
      if (ev.key !== "Enter") return;
      var c = campoCodigo();
      if (!c || document.activeElement !== c) return;
      if (rota.indexOf("/login") !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      entrar(c.value);
    },
    true,
  );


  /* O site original só libera os botões depois do Cloudflare Turnstile.
     No espelho estático não existe challenge, então liberamos os botões de acesso. */
  function liberarBotoes() {
    var bs = [].slice.call(document.querySelectorAll("button"));
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      var t = texto(b);
      var alvo = /GERAR C[OÓ]DIGO/.test(t) || /^ENTRAR/.test(t) || /^RECUPERAR/.test(t) ||
        /^ENVIAR/.test(t) || /^CRIAR/.test(t);
      if (!alvo) continue;
      if (b.disabled) { b.disabled = false; b.removeAttribute("disabled"); }
      if (b.getAttribute("aria-disabled") === "true") b.setAttribute("aria-disabled", "false");
      b.style.pointerEvents = "auto";
      b.style.opacity = "1";
    }
  }
  liberarBotoes();
  setInterval(liberarBotoes, 600);
  document.addEventListener("DOMContentLoaded", liberarBotoes);

  /* máscara 0000-0000-0000 enquanto digita */
  document.addEventListener(
    "input",
    function (ev) {
      var el = ev.target;
      if (!el || el.tagName !== "INPUT") return;
      var ph = el.getAttribute("placeholder") || "";
      if (!/0{4}/.test(ph) && el.type !== "tel") return;
      var d = digitos(el.value);
      var f = formata(d);
      if (f !== el.value) {
        el.value = f;
        el.dispatchEvent(new Event("input", { bubbles: false }));
      }
    },
    true,
  );
})();
