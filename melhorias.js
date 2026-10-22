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
  const btn = document.createElement("button"); btn.id = "sk-pro-btn"; btn.textContent = "PAINEL";
  document.body.appendChild(btn);

  function aplicarPro(semAnim) {
    document.body.classList.add("sk-pro");
    btn.textContent = "PAINEL"; btn.classList.add("ativo");
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
    btn.textContent = "PAINEL"; btn.classList.remove("ativo");
    try { localStorage.removeItem(CHAVE); } catch (e) {}
    toast("Modo PRO visual desligado.");
  }
  btn.addEventListener("click", () => { wrap.classList.toggle("aberto"); });
  try { if (localStorage.getItem(CHAVE) === "1") aplicarPro(true); } catch (e) {}
})();

/* ===== v4: seletor de modelo REAL (4.5 / 4.5 MAX) + provedor + voz ===== */
(() => {
  if (window.__skV4) return; window.__skV4 = true;

  // painel
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
    + '<a class="sk-opt sk-full" href="/dev-api/" style="text-decoration:none;display:block;text-align:center">MAPA DE API <small>todos os endpoints dev/admin extraídos</small></a>'
    + '</div>';
  document.body.appendChild(wrap);

  const st = { m: "base", p: "skynet", v: "tts" };
  try { Object.assign(st, JSON.parse(localStorage.getItem("sk-painel") || "{}")); } catch (e) {}

  function topbar() { return [...document.querySelectorAll("button, summary, span, div")].find(e => e.childElementCount === 0 && /SKYNETchat\s*4\.5/.test(e.textContent)); }

  function aplicarModelo(m, animar) {
    st.m = m; salvar();
    document.querySelectorAll("[data-sk-m]").forEach(b => b.classList.toggle("ativo", b.dataset.skM === m));
    const t = topbar();
    if (t) t.innerHTML = m === "max" ? 'SKYNETchat 4.5 <span class="sk-badge-max">MAX</span>' : "SKYNETchat 4.5";
    document.body.classList.toggle("sk-max", m === "max");
    if (m === "max") {
      if (animar) { const s = document.getElementById("sk-super"); if (s) { s.classList.remove("dispara"); void s.offsetWidth; s.classList.add("dispara"); } }
      toast("Modelo <b>4.5 MAX</b> com pesquisa profunda ativo — modo visual do espelho.");
    } else if (animar) toast("Modelo <b>SKYNETchat 4.5</b> padrão ativo.");
  }
  function salvar() { try { localStorage.setItem("sk-painel", JSON.stringify(st)); } catch (e) {} }

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

  // hook nos itens do seletor ORIGINAL do site
  document.addEventListener("click", e => {
    const t = e.target.closest("button, li, a, [role=\"menuitem\"]"); if (!t) return;
    const txt = t.textContent || "";
    if (/4\.5\s*MAX/i.test(txt)) { aplicarModelo("max", true); }
  }, true);

  document.addEventListener("click", e => { if (!e.target.closest("#sk-menu-wrap") && !e.target.closest("#sk-pro-btn")) wrap.classList.remove("aberto"); });

  // restaura estado salvo
  document.querySelectorAll("[data-sk-p]").forEach(x => x.classList.toggle("ativo", x.dataset.skP === st.p));
  document.querySelectorAll("[data-sk-v]").forEach(x => x.classList.toggle("ativo", x.dataset.skV === st.v));
  if (st.m === "max") setTimeout(() => aplicarModelo("max", false), 1500);
})();
