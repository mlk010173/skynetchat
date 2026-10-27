/* Guarda de papel: ninguem vira administrador pela interface.
   - le a sessao real (x-session) e define window.__SKY_ROLE
   - esconde e bloqueia atalhos de administracao para quem nao e admin
   - alinha a persona da interface com a conta real (sem inventar PRO) */
(function () {
  var cfg = window.__SKY_LIVE || {};
  var role = "guest";
  var conta = null;

  function sessao() { try { return localStorage.getItem("sky_session") || ""; } catch (e) { return ""; } }

  function aviso(msg) {
    var velho = document.getElementById("skynet-guarda-aviso");
    if (velho) velho.remove();
    var d = document.createElement("div");
    d.id = "skynet-guarda-aviso";
    d.textContent = msg;
    d.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:88px;z-index:9999;background:#1b1b1b;border:1px solid #3a3a3a;color:#e8e8e8;font:13px/1.4 ui-sans-serif,system-ui;padding:10px 14px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.5);max-width:min(420px,90vw)";
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 4200);
  }

  function ehAdmin() { return role === "admin"; }
  function alvoAdmin(el) {
    var t = ((el.textContent || "") + " " + (el.getAttribute && (el.getAttribute("aria-label") || el.getAttribute("title")) || "")).trim();
    var href = (el.getAttribute && el.getAttribute("href")) || "";
    return /^(administra|admin|painel do admin|painel admin)/i.test(t) || /\/dev(\/|$)|\/admin|\/dev\/security/i.test(href);
  }

  function aplicar() {
    window.__SKY_ROLE = role;
    if (ehAdmin()) return;
    var nos = document.querySelectorAll("a,button,[role=menuitem]");
    for (var i = 0; i < nos.length; i++) {
      if (alvoAdmin(nos[i])) {
        nos[i].style.display = "none";
        nos[i].setAttribute("data-sky-bloqueado", "1");
        nos[i].setAttribute("aria-disabled", "true");
      }
    }
  }

  document.addEventListener("click", function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest("a,button,[role=menuitem]") : null;
    if (!el) return;
    if (alvoAdmin(el) && !ehAdmin()) {
      ev.preventDefault(); ev.stopImmediatePropagation();
      aviso(role === "guest" ? "Entre na sua conta para ver essa area." : "Area de administracao: so para administradores.");
      aplicar();
    }
  }, true);

  function persona(mock) {
    if (!conta) return mock;
    var c = conta;
    return {
      user: {
        id: c.id, numberId: c.number_id || c.numberId, email: c.email || "", nickname: c.nickname || (mock && mock.user && mock.user.nickname) || "Voce",
        isPro: !!c.is_pro, isAdmin: c.role === "admin", isBetaTester: false, isInfluencer: false,
        hasStripeSubscription: false, hasStripeCustomer: false, subscriptionExpired: false, currentPlan: c.is_pro ? "pro" : "free",
        messageQuota: c.message_quota || (c.is_pro ? 400 : 40), messagesUsed: 0, memoryEnabled: true,
        canPublish: true, shouldShowRecoveryPrompt: false, shouldShowInitialFeedback: false,
        referralPromoTestMode: false, recoveryEmail: null, role: c.role || "user"
      }
    };
  }

  function carregar() {
    var s = sessao();
    if (!s || !cfg.url) { role = "guest"; aplicar(); return; }
    fetch(cfg.url + "/functions/v1/auth?action=session", {
      headers: { apikey: cfg.key, Authorization: "Bearer " + cfg.key, "x-session": s }
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var c = (d && (d.account || d.conta || d)) || null;
      if (!c || !c.id) { role = "guest"; conta = null; }
      else { conta = c; role = c.role === "admin" ? "admin" : "user"; }
      if (conta) window.__sky_persona = function () { return persona(null); };
      aplicar();
    }).catch(function () { role = "guest"; aplicar(); });
  }

  function rotaBloqueada() {
    // /dev e /admin nao podem ser abertos direto por quem nao e admin
    var p = location.pathname.replace(/^\/skynetchat/, "");
    if (!/^\/(dev|admin)(\/|$)/.test(p)) return false;
    if (ehAdmin()) return false;
    var base = location.pathname.indexOf("/skynetchat") === 0 ? "/skynetchat" : "";
    try { sessionStorage.setItem("sky_rota_bloqueada", "1"); } catch (e) {}
    location.replace(base + "/chat/");
    return true;
  }

  function iniciar() {
    carregar();
    setTimeout(rotaBloqueada, 700);
    try {
      new MutationObserver(function () { if (!ehAdmin()) aplicar(); })
        .observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();

})();
