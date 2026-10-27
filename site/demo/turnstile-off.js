/* Turnstile desligado: o site entra direto no modo demo, sem widget da Cloudflare. */
(function () {
  window.__TURNSTILE_DEMO = true;
  function token() { return "demo-sem-turnstile"; }
  window.turnstile = {
    render: function (el, opcoes) {
      if (opcoes && typeof opcoes.callback === "function") setTimeout(function () { try { opcoes.callback(token()); } catch (e) {} }, 50);
      return "ts-demo";
    },
    reset: function () {},
    remove: function () {},
    getResponse: token,
    execute: function (el, opcoes) {
      if (opcoes && typeof opcoes.callback === "function") setTimeout(function () { try { opcoes.callback(token()); } catch (e) {} }, 50);
      return Promise.resolve(token());
    },
    isExpired: function () { return false; },
    ready: function (cb) { try { cb(); } catch (e) {} }
  };
  // remove qualquer iframe/caixa do widget que consiga carregar
  function limpar() {
    var sel = ['iframe[src*="challenges.cloudflare.com"]', '.cf-turnstile', '[data-sitekey]', '#cf-turnstile'];
    for (var i = 0; i < sel.length; i++) {
      var nos = document.querySelectorAll(sel[i]);
      for (var j = 0; j < nos.length; j++) nos[j].remove();
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", limpar);
  else limpar();
  try { new MutationObserver(limpar).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
})();
