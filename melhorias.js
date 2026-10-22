/* ===== melhorias sitejack v2 — API honesta + aviso de espelho =====
   Neste espelho estático as chamadas de API do site original não funcionam
   (elas apontam pro servidor dele). Em vez de falhar em silêncio no console,
   esta camada responde com um JSON honesto e avisa o visitante uma vez. */
(() => {
  if (window.__skMelhorias) return; window.__skMelhorias = true;

  const AVISO = "Este site é um *espelho estático*: chamadas de API não funcionam fora do servidor original.";
  let ultimoAviso = 0;

  function toast(msg) {
    const agora = Date.now();
    if (agora - ultimoAviso < 30000) return;
    ultimoAviso = agora;
    const el = document.createElement("div");
    el.id = "sk-toast";
    el.innerHTML = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.style.transition = "opacity .4s"; el.style.opacity = "0"; setTimeout(() => el.remove(), 450); }, 4200);
  }

  const apiOriginal = window.fetch ? window.fetch.bind(window) : null;
  if (!apiOriginal) return;

  window.fetch = (url, opts) => {
    let u = null;
    try { u = new URL(String(url), location.href); } catch (e) { return apiOriginal(url, opts); }
    const ehApi = u.origin === location.origin && u.pathname.startsWith("/api/");
    if (!ehApi) return apiOriginal(url, opts);
    toast(AVISO);
    return Promise.resolve(new Response(
      JSON.stringify({ ok: false, espelho: true, aviso: "Chamadas de API não funcionam neste espelho estático — ele serve apenas os arquivos capturados do frontend." }),
      { status: 501, statusText: "Not Implemented (espelho estático)", headers: { "Content-Type": "application/json; charset=utf-8" } }
    ));
  };
})();

/* ===== v3: logo animado + modo PRO com super animação ===== */
(() => {
  if (window.__skV3) return; window.__skV3 = true;

  function logoAlvo() {
    return document.querySelector('header img, nav img, a[href="/"] img, img[alt*="SKYNET" i], img[src*="logo" i]');
  }
  function animarLogo() {
    const l = logoAlvo(); if (l) l.classList.add("sk-logo");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", animarLogo); else animarLogo();
  // re-tenta pós-hidratação do SvelteKit
  setTimeout(animarLogo, 1200); setTimeout(animarLogo, 3000);

  // modo PRO visual do espelho (persistente, honesto: o real é validado no servidor original)
  const CHAVE = "sk-modo-pro";
  const super_ = document.createElement("div"); super_.id = "sk-super";
  super_.innerHTML = '<div class="onda"></div><div class="clarao"></div>';
  document.body.appendChild(super_);
  const btn = document.createElement("button"); btn.id = "sk-pro-btn"; btn.textContent = "PRO";
  document.body.appendChild(btn);

  function aplicarPro(semAnim) {
    document.body.classList.add("sk-pro");
    btn.textContent = "SAIR DO PRO"; btn.classList.add("ativo");
    try { localStorage.setItem(CHAVE, "1"); } catch (e) {}
    if (!semAnim) {
      super_.classList.remove("dispara"); void super_.offsetWidth; super_.classList.add("dispara");
      toast("Modo <b>PRO</b> visual do espelho liberado — no site original a assinatura é validada no servidor.");
      document.querySelectorAll('[class*="card"], [class*="Card"]').forEach(c => c.classList.remove("sk-unlock"));
    }
    document.querySelectorAll('[class*="badge" i]').forEach(() => {});
  }
  function tirarPro() {
    document.body.classList.remove("sk-pro");
    btn.textContent = "PRO"; btn.classList.remove("ativo");
    try { localStorage.removeItem(CHAVE); } catch (e) {}
    toast("Modo PRO visual desligado.");
  }
  btn.addEventListener("click", () => {
    if (document.body.classList.contains("sk-pro")) tirarPro(); else aplicarPro(false);
  });
  try { if (localStorage.getItem(CHAVE) === "1") aplicarPro(true); } catch (e) {}
})();
