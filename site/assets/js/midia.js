/* =====================================================================
   SKYNETchat — mídia: prints, zoom e galeria (lightbox)
   - qualquer imagem do chat abre ampliada
   - prints colados recebem nome legível
   ===================================================================== */
(() => {
  'use strict';

  let box = null;
  let items = [];
  let idx = 0;

  function build() {
    box = document.createElement('div');
    box.className = 'sk-lightbox';
    box.innerHTML = `
      <div class="lb-backdrop" data-lb-close></div>
      <div class="lb-stage" role="dialog" aria-modal="true" aria-label="Imagem ampliada">
        <img alt="" data-lb-img>
        <div class="lb-bar">
          <span data-lb-cap></span>
          <span class="lb-count" data-lb-count></span>
          <span class="lb-actions">
            <a data-lb-download download>Baixar</a>
            <button type="button" data-lb-close aria-label="Fechar">✕</button>
          </span>
        </div>
        <button type="button" class="lb-nav lb-prev" data-lb-prev aria-label="Anterior">‹</button>
        <button type="button" class="lb-nav lb-next" data-lb-next aria-label="Próxima">›</button>
      </div>`;
    document.body.appendChild(box);
  }

  function paint() {
    const it = items[idx] || {};
    box.querySelector('[data-lb-img]').src = it.url || '';
    box.querySelector('[data-lb-img]').alt = it.legenda || 'imagem';
    box.querySelector('[data-lb-cap]').textContent = it.legenda || '';
    box.querySelector('[data-lb-count]').textContent = items.length > 1 ? `${idx + 1} / ${items.length}` : '';
    const dl = box.querySelector('[data-lb-download]');
    if (/^data:/.test(it.url || '') || /^https?:/.test(it.url || '')) dl.href = it.url;
    else dl.removeAttribute('href');
    box.querySelectorAll('.lb-nav').forEach((b) => (b.style.display = items.length > 1 ? '' : 'none'));
  }

  function open(list, start) {
    items = (list || []).filter((i) => i && i.url);
    if (!items.length) return;
    idx = Math.max(0, Math.min(Number(start) || 0, items.length - 1));
    if (!box) build();
    box.classList.add('is-open');
    document.documentElement.style.overflow = 'hidden';
    paint();
  }

  function close() {
    if (!box) return;
    box.classList.remove('is-open');
    document.documentElement.style.overflow = '';
  }

  function step(d) {
    if (items.length < 2) return;
    idx = (idx + d + items.length) % items.length;
    paint();
  }

  document.addEventListener('click', (ev) => {
    if (box && box.classList.contains('is-open')) {
      if (ev.target.closest('[data-lb-close]')) return close();
      if (ev.target.closest('[data-lb-prev]')) return step(-1);
      if (ev.target.closest('[data-lb-next]')) return step(1);
    }
    const img = ev.target.closest('.chat-list img, .user-message-row img, .sk-msg-files img');
    if (!img || img.closest('.art-fig-btn') || img.closest('[data-lb-img]')) return;
    const host = img.closest('li') || img.closest('.sk-msg-files') || document;
    const all = Array.from(host.querySelectorAll('img')).filter((i) => !i.closest('.art-fig-btn'));
    const list = all.map((i) => ({ url: i.currentSrc || i.src, legenda: i.alt || '' }));
    const start = Math.max(0, all.indexOf(img));
    if (list[start] && list[start].url) {
      ev.preventDefault();
      open(list, start);
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (!box || !box.classList.contains('is-open')) return;
    if (ev.key === 'Escape') close();
    if (ev.key === 'ArrowLeft') step(-1);
    if (ev.key === 'ArrowRight') step(1);
  });

  window.SKYNMID = { open, close };
})();
