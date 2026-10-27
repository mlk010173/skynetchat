/* Entrar direto: o formulario do site nao dispara sozinho sem o Turnstile.
   Assumimos o clique em ENTRAR (e o Enter) e fazemos o login pelo codigo de 12 digitos. */
(function () {
  var ocupado = false;

  function digitos(t) { return (t || "").replace(/\D/g, ""); }
  function base() { return location.pathname.indexOf("/skynetchat") === 0 ? "/skynetchat" : ""; }
  function aviso(msg) {
    var velho = document.getElementById("sky-entrar-aviso");
    if (velho) velho.remove();
    var d = document.createElement("div");
    d.id = "sky-entrar-aviso";
    d.textContent = msg;
    d.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:120px;z-index:99999;background:#161616;border:1px solid #3a3a3a;color:#eee;font:13px/1.4 ui-sans-serif,system-ui;padding:10px 14px;border-radius:10px;max-width:min(440px,92vw)";
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 5000);
  }
  function codigoNaTela() {
    var nos = document.querySelectorAll("input:not([type=hidden])");
    for (var i = 0; i < nos.length; i++) {
      var v = digitos(nos[i].value);
      if (v.length >= 12) return v.slice(0, 12);
    }
    return "";
  }
  function entrar(codigo) {
    if (ocupado) return;
    if (!codigo || codigo.length < 12) { aviso("Digite os 12 digitos do seu codigo de acesso."); return; }
    ocupado = true;
    if (localStorage.getItem("sky_session")) { location.href = base() + "/chat/"; return; }
    window.fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ numberId: codigo }) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) {
        if (localStorage.getItem("sky_session")) {
          try { localStorage.setItem("skynet:session-change:v1", String(Date.now())); } catch (e) {}
          location.href = base() + "/chat/";
          return;
        }
        ocupado = false;
        aviso((d && (d.error || d.message || d.motivo)) || "Codigo nao reconhecido.");
      })
      .catch(function () { ocupado = false; aviso("Nao consegui falar com o servidor agora."); });
  }
  function ehEntrar(el) {
    if (!el || !el.closest) return false;
    var b = el.closest("button,[role=button],input[type=submit],a");
    if (!b) return false;
    var t = ((b.textContent || "") + " " + (b.value || "") + " " + (b.getAttribute("aria-label") || "")).trim();
    return /entrar|acessar|login|continuar/i.test(t);
  }
  function pegar(ev) {
    if (!codigoNaTela()) return false;
    var alvo = ev.target;
    var entrarNoBotao = ehEntrar(alvo) || ev.type === "submit" || (ev.type === "keydown" && ev.key === "Enter");
    if (!entrarNoBotao) return false;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    entrar(codigoNaTela());
    return true;
  }
  document.addEventListener("click", pegar, true);
  document.addEventListener("submit", pegar, true);
  document.addEventListener("keydown", function (ev) { if (ev.key === "Enter") pegar(ev); }, true);
})();
