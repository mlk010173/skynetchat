/* ===== melhorias sitejack — camada unificada v2+v3+v4 (escopo unico) =====
   API honesta + toast + logo animado + modo PRO + seletor de modelo + painel
   (modelo cerebro / provedor / voz). Tudo visual, tudo honesto. */
(() => {
  if (window.__skMelhorias) return; window.__skMelhorias = true;

  /* --- autolimpeza: mata qualquer service worker antigo preso no navegador --- */
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(rs => {
      rs.forEach(r => r.unregister().then(() => console.log("[sk] service worker antigo removido")));
    }).catch(() => {});
  }
  if (window.caches) {
    caches.keys().then(ks => ks.forEach(k => caches.delete(k))).catch(() => {});
  }

  /* --- toast (usado por todas as secoes) --- */
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

  /* --- API honesta: /api/* do espelho responde 501 com aviso em vez de falhar mudo --- */
  const apiOriginal = window.fetch ? window.fetch.bind(window) : null;
  if (apiOriginal) {
    window.fetch = (url, opts) => {
      let u = null;
      try { u = new URL(String(url), location.href); } catch (e) { return apiOriginal(url, opts); }
      if (!(u.origin === location.origin && u.pathname.startsWith("/api/"))) return apiOriginal(url, opts);
      toast("Este site é um *espelho estático*: chamadas de API não funcionam fora do servidor original.");
      return Promise.resolve(new Response(
        JSON.stringify({ ok: false, espelho: true, aviso: "Chamadas de API não funcionam neste espelho estático — ele serve apenas os arquivos capturados do frontend." }),
        { status: 501, statusText: "Not Implemented (espelho estático)", headers: { "Content-Type": "application/json; charset=utf-8" } }
      ));
    };
  }

  /* --- logo com brilho vermelho respirando --- */
  function animarLogo() {
    const l = document.querySelector('header img, nav img, a[href="/"] img, img[alt*="SKYNET" i], img[src*="logo" i]');
    if (l) l.classList.add("sk-logo");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", animarLogo); else animarLogo();
  setTimeout(animarLogo, 1200); setTimeout(animarLogo, 3000);

  /* --- overlay da SUPER animacao + botao PAINEL --- */
  const super_ = document.createElement("div"); super_.id = "sk-super";
  super_.innerHTML = '<div class="onda"></div><div class="clarao"></div>';
  document.body.appendChild(super_);
  function dispararSuper() {
    super_.classList.remove("dispara"); void super_.offsetWidth; super_.classList.add("dispara");
  }
  const btn = document.createElement("button"); btn.id = "sk-pro-btn"; btn.textContent = "PAINEL";
  document.body.appendChild(btn);

  /* --- modo PRO visual --- */
  function aplicarPro(semAnim) {
    document.body.classList.add("sk-pro");
    btn.classList.add("ativo");
    try { localStorage.setItem("sk-modo-pro", "1"); } catch (e) {}
    if (!semAnim) {
      dispararSuper();
      toast("Modo <b>PRO</b> visual do espelho liberado — no site original a assinatura é validada no servidor.");
    }
  }
  function tirarPro() {
    document.body.classList.remove("sk-pro");
    btn.classList.remove("ativo");
    try { localStorage.removeItem("sk-modo-pro"); } catch (e) {}
    toast("Modo PRO visual desligado.");
  }

  /* --- painel: modelo cerebro / provedor / voz / extras --- */
  const wrap = document.createElement("div"); wrap.id = "sk-menu-wrap";
  wrap.innerHTML = '<div id="sk-menu">'
    + '<div class="sk-m-t">MODELO CÉREBRO</div>'
    + '<div class="sk-opts">'
    + '<button class="sk-opt" data-sk-m="base">SKYNETchat 4.5<small>padrão · /api/chat-V4.5</small></button>'
    + '<button class="sk-opt" data-sk-m="max">4.5 MAX<small>pesquisa profunda</small></button></div>'
    + '<div class="sk-m-t">PROVEDOR</div>'
    + '<div class="sk-opts">'
    + '<button class="sk-opt" data-sk-p="skynet">SKYNETchat<small>nativo</small></button>'
    + '<button class="sk-opt" data-sk-p="openai">OpenAI<small>referenciado no cliente</small></button></div>'
    + '<div class="sk-m-t">VOZ</div>'
    + '<div class="sk-opts">'
    + '<button class="sk-opt" data-sk-v="tts">Padrão<small>/api/tts</small></button>'
    + '<button class="sk-opt" data-sk-v="eleven">ElevenLabs<small>/api/tts-eleven</small></button></div>'
    + '<div class="sk-m-t">EXTRAS</div>'
    + '<button class="sk-opt sk-full" id="sk-m-pro">LIBERAR MODO PRO</button>'
    + '<a class="sk-opt sk-full" href="/perfil/" style="text-decoration:none;display:block;text-align:center">MEU PERFIL <small>plano · tema · conta</small></a>'
    + '<a class="sk-opt sk-full" href="/dev-api/" style="text-decoration:none;display:block;text-align:center">MAPA DE API <small>todos os endpoints dev/admin extraídos</small></a>'
    + '</div>';
  document.body.appendChild(wrap);
  btn.addEventListener("click", () => wrap.classList.toggle("aberto"));
  document.addEventListener("click", e => {
    if (!e.target.closest("#sk-menu-wrap") && !e.target.closest("#sk-pro-btn")) wrap.classList.remove("aberto");
  });

  /* --- seletor de modelo 4.5 / 4.5 MAX --- */
  const st = { m: "base", p: "skynet", v: "tts" };
  try { Object.assign(st, JSON.parse(localStorage.getItem("sk-painel") || "{}")); } catch (e) {}
  function salvar() { try { localStorage.setItem("sk-painel", JSON.stringify(st)); } catch (e) {} }
  function topbar() {
    return [...document.querySelectorAll("button, summary, span, div")].find(e =>
      e.childElementCount === 0 && /SKYNETchat\s*4\.5/.test(e.textContent));
  }
  function aplicarModelo(m, animar) {
    st.m = m; salvar();
    document.querySelectorAll("[data-sk-m]").forEach(b => b.classList.toggle("ativo", b.dataset.skM === m));
    const t = topbar();
    if (t) t.innerHTML = m === "max" ? 'SKYNETchat 4.5 <span class="sk-badge-max">MAX</span>' : "SKYNETchat 4.5";
    document.body.classList.toggle("sk-max", m === "max");
    if (m === "max") {
      if (animar) dispararSuper();
      toast("Modelo <b>4.5 MAX</b> com pesquisa profunda ativo — modo visual do espelho.");
    } else if (animar) toast("Modelo <b>SKYNETchat 4.5</b> padrão ativo.");
  }

  wrap.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.skM) aplicarModelo(b.dataset.skM, true);
    if (b.dataset.skP) { st.p = b.dataset.skP; salvar();
      document.querySelectorAll("[data-sk-p]").forEach(x => x.classList.toggle("ativo", x === b));
      toast("Provedor <b>" + (st.p === "openai" ? "OpenAI" : "SKYNETchat") + "</b> selecionado — preferência local do espelho."); }
    if (b.dataset.skV) { st.v = b.dataset.skV; salvar();
      document.querySelectorAll("[data-sk-v]").forEach(x => x.classList.toggle("ativo", x === b));
      toast("Voz <b>" + (st.v === "eleven" ? "ElevenLabs" : "padrão") + "</b> selecionada — preferência local do espelho."); }
    if (b.id === "sk-m-pro") { wrap.classList.remove("aberto");
      if (document.body.classList.contains("sk-pro")) tirarPro(); else aplicarPro(false); }
  });

  /* hook na opcao MAX do seletor ORIGINAL do site */
  document.addEventListener("click", e => {
    const t = e.target.closest('button, li, a, [role="menuitem"]'); if (!t) return;
    if (/4\.5\s*MAX/i.test(t.textContent || "")) aplicarModelo("max", true);
  }, true);

  /* restaura estado salvo */
  document.querySelectorAll("[data-sk-p]").forEach(x => x.classList.toggle("ativo", x.dataset.skP === st.p));
  document.querySelectorAll("[data-sk-v]").forEach(x => x.classList.toggle("ativo", x.dataset.skV === st.v));
  try { if (localStorage.getItem("sk-modo-pro") === "1") aplicarPro(true); } catch (e) {}
  if (st.m === "max") setTimeout(() => aplicarModelo("max", false), 1500);
})();
