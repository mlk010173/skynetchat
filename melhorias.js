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
