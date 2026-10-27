/* Entrar direto: se o formulario do site nao disparar sozinho (Turnstile removido),
   a ponte faz o login pelo codigo de 12 digitos e abre o chat. */
(function () {
  var ocupado = false;

  function digitos(txt) { return (txt || "").replace(/\D/g, ""); }
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
    var nos = document.querySelectorAll("input");
    for (var i = 0; i < nos.length; i++) {
      var v = digitos(nos[i].value);
      if (v.length >= 12) return v.slice(0, 12);
    }
    var m = (document.body.innerText.match(/\d{4}[\s-]?\d{4}[\s-]?\d{4}/) || [])[0];
    return m ? digitos(m) : "";
  }
  function entrar(codigo) {
    if (ocupado || !codigo || codigo.length < 12) return;
    ocupado = true;
    if (localStorage.getItem("sky_session")) { location.href = base() + "/chat/"; return; }
    window.fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ numberId: codigo, code: codigo }) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) {
        if (localStorage.getItem("sky_session")) {
          location.href = base() + "/chat/";
          return;
        }
        ocupado = false;
        aviso((d && (d.error || d.message || d.motivo)) || "Codigo nao reconhecido. Gere um novo em Criar conta.");
      })
      .catch(function () { ocupado = false; aviso("Nao consegui falar com o servidor agora."); });
  }

  function tentar(ev) {
    var codigo = codigoNaTela();
    if (!codigo) return;
    var alvo = ev && ev.target && ev.target.closest ? ev.target.closest("button,form,input") : null;
    var clicouEntrar = alvo && /entrar|acessar|login/i.test((alvo.textContent || "") + " " + (alvo.getAttribute && (alvo.getAttribute("aria-label") || "") || ""));
    var enter = ev && ev.key === "Enter";
    if (!clicouEntrar && !enter && ev && ev.type === "click") return;
    setTimeout(function () {
      if (localStorage.getItem("sky_session")) return;
      entrar(codigo);
    }, 700);
  }

  document.addEventListener("submit", tentar, true);
  document.addEventListener("click", tentar, true);
  document.addEventListener("keydown", function (ev) { if (ev.key === "Enter") tentar(ev); }, true);
})();
