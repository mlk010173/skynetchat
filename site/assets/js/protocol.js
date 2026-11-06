/* ============================================================================
 * SKYNETchat — protocolo do chat extraído do site original (skynetchat.net)
 * ----------------------------------------------------------------------------
 * Este arquivo reproduz, sem backend, o MESMO contrato de streaming que o app
 * original usa: eventos SSE (`start`, `thinking-meta`, `step-start`,
 * `step-delta`, `step-end`, `thinking-complete`, `text-start`, `text-delta`,
 * `text-end`, `follow-ups`, `roleplay-state`, `finish`) e os MESMOS componentes
 * de interface (card "Trabalhou por Ns", bloco de busca com resultados,
 * pílulas de citação, gaveta de fontes, chip de artefato com download).
 *
 * Endpoints originais (documentados em EXTRACAO.md):
 *   V1 /api/chat · V2-fast /api/chat-V2-fast · V2-thinking /api/chat-V2-thinking
 *   V3 /api/chat-V3 · V3-thinking /api/chat-V3-thinking · V4 /api/chat-V4
 *   V4.5 /api/chat-V4.5 · MAX reaproveita o endpoint da versão com outro motor
 *   /api/classify-intent (token de decisão) · /api/session · /api/title
 * ==========================================================================*/
(() => {
  'use strict';

  const ENDPOINTS = {
    V1: '/api/chat',
    V2: '/api/chat-V2-fast',
    V2_THINKING: '/api/chat-V2-thinking',
    V3: '/api/chat-V3',
    V3_THINKING: '/api/chat-V3-thinking',
    V4: '/api/chat-V4',
    V4_MAX: '/api/chat-V4',
    V4_5: '/api/chat-V4.5',
    V4_5_MAX: '/api/chat-V4.5',
  };

  /* ---------------------------------------------------------------- helpers */
  const esc = (t) =>
    String(t == null ? '' : t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const fav = (domain, sz) => `https://www.google.com/s2/favicons?sz=${sz || 128}&domain=${domain}`;
  const hostOf = (u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch (e) {
      return '';
    }
  };
  const TLD = new Set(['com', 'org', 'net', 'gov', 'edu', 'io', 'ai', 'co', 'br', 'de', 'uk', 'info', 'dev', 'app', 'me', 'tv', 'news', 'blog', 'site']);
  const label = (domain) => {
    const parts = String(domain || '').replace(/^www\./, '').split('.').filter(Boolean);
    let rest = parts.filter((p) => !TLD.has(p));
    if (rest.length > 1 && rest[0].length <= 2) rest = rest.slice(1);
    return rest.slice(0, 2).join('.') || parts[0] || '';
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const uid = (n) =>
    Array.from({ length: n || 16 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 58)]).join('');

  /* ------------------------------------------------------------- SSE parser */
  // Aceita: linhas `data: {json}` (protocolo SKYNET) e partes do Vercel AI SDK.
  function parseSSE(chunkText) {
    const out = [];
    for (const line of String(chunkText).split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith(':')) continue;
      if (t.startsWith('data:')) {
        const raw = t.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          out.push(JSON.parse(raw));
        } catch (e) {
          out.push({ type: 'raw', value: raw });
        }
      }
    }
    return out;
  }

  async function readStream(response, onEvent, attach) {
    const reader = response.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    attach && attach(reader);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n');
      buf = parts.pop() || '';
      for (const ev of parseSSE(parts.join('\n'))) onEvent(ev);
    }
    if (buf.trim()) for (const ev of parseSSE(buf)) onEvent(ev);
  }

  /* -------------------------------------------------- markdown + citações */
  function citationRow(list) {
    const srcs = JSON.stringify(list);
    const pills = list
      .map(
        (s) => `<a class="citation-pill" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${esc(s.title)} · ${esc(s.domain)}">
        <span class="citation-pill-icon"><img src="${fav(s.domain, 64)}" alt="" width="14" height="14"></span>${esc(s.label || label(s.domain))}</a>`
      )
      .join('');
    return `<span class="citation-row"><span class="citation-group" data-sources="${encodeURIComponent(srcs).replace(/'/g, '%27')}" data-index="0">${pills}</span></span>`;
  }

  function inline(t, sources) {
    let s = esc(t);
    s = s.replace(/!\[([^\]]*)\]\((https?:[^)\s]+)\)/g, '<img class="sk-inline-img" src="$2" alt="$1" loading="lazy" style="max-width:min(100%,420px);border-radius:10px;border:1px solid rgba(255,255,255,.12);margin:8px 0;display:block">');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // marcadores de citação: [1] [1,2] [1][2]
    s = s.replace(/(?:\[(\d+(?:\s*,\s*\d+)*)\])+/g, (m) => {
      const nums = [...new Set((m.match(/\d+/g) || []).map(Number))].filter((n) => sources && sources[n - 1]);
      if (!nums.length) return m;
      return citationRow(nums.map((n) => sources[n - 1]));
    });
    return s;
  }

  function codeHead(lang) {
    return `<div class="sk-code-head"><span>${esc(lang || 'código')}</span><button data-copy-code>Copiar</button></div>`;
  }

  /* chip de artefato: igual ao original (ícone </>, título, "Código · HTML", Baixar) */
  function artifactChip(title, lang, code) {
    const name = (title || 'artefato').trim();
    return `<div class="my-1 flex items-center gap-3 rounded-xl px-3 py-3 w-full" data-artifact style="background: rgb(33,33,33); border: 1px solid rgba(255,255,255,0.1)">
      <button type="button" class="cursor-pointer flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-90 transition-opacity" data-artifact-open aria-label="Renderizar página">
        <div class="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08)">
          <span style="font-family: ui-monospace, monospace; font-size: 15px; color: rgb(153,153,153)">&lt;/&gt;</span>
        </div>
        <div class="flex flex-col min-w-0">
          <span class="font-semibold truncate text-[15px]" style="color: rgb(235,235,235)">${esc(name)}</span>
          <span class="text-xs" style="color: rgb(140,140,140)">Código · ${esc((lang || 'html').toUpperCase())}</span>
        </div>
      </button>
      <button type="button" class="cursor-pointer text-sm px-3 py-1.5 rounded-lg flex-shrink-0 hover:bg-white/10 transition-colors" data-artifact-download style="border: 1px solid rgba(255,255,255,0.14); color: rgb(209,209,209)">Baixar</button>
    </div>`;
  }

  function md(text, sources) {
    const src = text.replace(/\r/g, '');
    const out = [];
    const blocks = src.split(/```/);
    blocks.forEach((part, idx) => {
      if (idx % 2 === 1) {
        const nl = part.indexOf('\n');
        const lang = (nl > -1 ? part.slice(0, nl) : part).trim().toLowerCase();
        const code = (nl > -1 ? part.slice(nl + 1) : part).replace(/\n$/, '');
        const isPage = /^(html|htm)$/.test(lang) && code.length > 240;
        if (isPage) {
          const h = (code.match(/<title>([^<]+)<\/title>/i) || code.match(/<h1[^>]*>([^<]+)<\/h1>/i) || [])[1];
          out.push(artifactChip(h || 'Página HTML', 'HTML', code));
        } else {
          out.push(
            `<div class="sk-code">${codeHead(lang)}<pre class="sk-pre"><code>${esc(code)}</code></pre></div>`
          );
        }
        return;
      }
      for (const raw of part.split(/\n{2,}/)) {
        const b = raw.trim();
        if (!b) continue;
        if (/^###\s+/.test(b)) out.push(`<h3>${inline(b.replace(/^###\s+/, ''), sources)}</h3>`);
        else if (/^##\s+/.test(b)) out.push(`<h3>${inline(b.replace(/^##\s+/, ''), sources)}</h3>`);
        else if (/^#\s+/.test(b)) out.push(`<h3>${inline(b.replace(/^#\s+/, ''), sources)}</h3>`);
        else if (/^>\s?/.test(b))
          out.push(`<blockquote>${inline(b.replace(/^>\s?/gm, ''), sources)}</blockquote>`);
        else if (/^[-*]\s+/.test(b))
          out.push('<ul>' + b.split(/\n/).map((l) => `<li>${inline(l.replace(/^[-*]\s+/, ''), sources)}</li>`).join('') + '</ul>');
        else if (/^\d+[.)]\s+/.test(b))
          out.push('<ol>' + b.split(/\n/).map((l) => `<li>${inline(l.replace(/^\d+[.)]\s+/, ''), sources)}</li>`).join('') + '</ol>');
        else out.push(`<p>${inline(b, sources)}</p>`);
      }
    });
    return out.join('\n');
  }

  /* ------------------------------------------------- card de pensamento */
  const ICON_CARET =
    '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" class="text-white/60 svelte-wgb08k"><path d="M14.128 7.16482C14.3126 6.95983 14.6298 6.94336 14.835 7.12771C15.0402 7.31242 15.0567 7.62952 14.8721 7.83477L10.372 12.835L10.2939 12.9053C10.2093 12.9667 10.1063 13 9.99995 13C9.85833 12.9999 9.72264 12.9402 9.62788 12.835L5.12778 7.83477L5.0682 7.75273C4.95072 7.55225 4.98544 7.28926 5.16489 7.12771C5.34445 6.96617 5.60969 6.95939 5.79674 7.09744L5.87193 7.16482L9.99995 11.7519L14.128 7.16482Z"></path></svg>';
  const ICON_SEARCH =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path><path d="M11 8a3 3 0 0 1 3 3"></path></svg>';

  function iconStack(sources, active) {
    const uniq = [];
    for (const s of sources) {
      if (!uniq.includes(s.domain)) uniq.push(s.domain);
      if (uniq.length >= 8) break;
    }
    return (
      '<span class="site-icon-list svelte-wgb08k">' +
      uniq
        .map(
          (d, i) =>
            `<span class="site-icon-frame svelte-wgb08k${i === (active || 0) % Math.max(1, uniq.length) ? ' site-icon-active' : ''}"><img alt="" width="20" height="20" class="h-5 w-5 rounded-full svelte-wgb08k" src="${fav(d)}"></span>`
        )
        .join('') +
      '</span>'
    );
  }

  function trace(li, body, content) {
    const el = document.createElement('div');
    el.className = 'w-full mb-3 pl-2 pr-4 sm:pr-8 svelte-wgb08k';
    el.dataset.trace = '';
    el.innerHTML = `
      <button type="button" class="group flex items-center gap-2 pt-0 pb-1 text-[16px] transition-colors cursor-pointer w-full text-left hover:opacity-80 svelte-wgb08k" aria-expanded="true" data-trace-toggle>
        <span class="text-white/80 svelte-wgb08k" data-trace-label>Pensando</span>
        <span class="inline-flex transition-transform duration-200 shrink-0 rotate-0 svelte-wgb08k" data-trace-caret>${ICON_CARET}</span>
      </button>
      <div class="svelte-wgb08k" data-trace-wrap>
        <div class="pr-2 pb-3 svelte-wgb08k" data-preamble-wrap hidden>
          <p class="text-[15px] sm:text-base text-[#ffffff] whitespace-pre-wrap break-words leading-6 svelte-wgb08k" data-preamble></p>
        </div>
        <div class="svelte-wgb08k" data-steps></div>
        <button type="button" class="group flex items-center gap-2.5 pb-2 text-[16px] transition-colors cursor-pointer w-full text-left hover:opacity-80 svelte-wgb08k" aria-expanded="false" data-sources-toggle hidden>
          <span aria-hidden="true" class="site-icon-window inline-flex h-5 w-5 items-center justify-center rounded-full border text-white/60 shrink-0 svelte-wgb08k" style="border-color: rgba(255,255,255,0.14)" data-icon-window></span>
          <span class="text-white/60 relative overflow-hidden svelte-wgb08k" style="--title-shimmer-sheen: rgba(255,255,255,0.94)" data-sources-label>Pesquisou em 0 fontes</span>
        </button>
        <div class="mt-1.5 max-w-[620px] svelte-wgb08k" data-search-wrap hidden></div>
      </div>`;
    li.insertBefore(el, body);

    const $ = (s) => el.querySelector(s);
    const labelEl = $('[data-trace-label]');
    const caret = $('[data-trace-caret]');
    const wrap = $('[data-trace-wrap]');
    const preamble = $('[data-preamble]');
    const stepsEl = $('[data-steps]');
    const srcToggle = $('[data-sources-toggle]');
    const srcLabel = $('[data-sources-label]');
    const iconWin = $('[data-icon-window]');
    const searchWrap = $('[data-search-wrap]');

    $('[data-trace-toggle]').addEventListener('click', () => {
      const open = wrap.hasAttribute('hidden');
      if (open) wrap.removeAttribute('hidden');
      else wrap.setAttribute('hidden', '');
      el.querySelector('[data-trace-toggle]').setAttribute('aria-expanded', String(open));
      caret.style.transform = open ? 'rotate(0deg)' : 'rotate(-90deg)';
    });
    srcToggle.addEventListener('click', () => {
      const open = searchWrap.hasAttribute('hidden');
      if (open) searchWrap.removeAttribute('hidden');
      else searchWrap.setAttribute('hidden', '');
      srcToggle.setAttribute('aria-expanded', String(open));
    });

    const t0 = performance.now();
    let sources = [];
    let tick = setInterval(() => {
      const s = Math.round((performance.now() - t0) / 1000);
      labelEl.textContent = s < 4 ? 'Pensando' : `Trabalhando por ${s}s`;
    }, 500);

    const api = {
      el,
      sources: () => sources,
      /* evento cru do protocolo */
      event(ev) {
        switch (ev.type) {
          case 'thinking-meta':
            if (ev.summaryTitle) labelEl.textContent = ev.summaryTitle;
            break;
          case 'assistant-preamble':
          case 'step-delta':
            if (ev.type === 'assistant-preamble' || !stepsEl.children.length) {
              preamble.closest('[data-preamble-wrap]').removeAttribute('hidden');
              preamble.textContent = (ev.text || ev.delta || '').trim();
            }
            break;
          case 'step-start': {
            if (ev.stepType === 'search' && Array.isArray(ev.searchQueries)) {
              api.renderSearch({ queries: ev.searchQueries, sources: [] });
            }
            break;
          }
          case 'step-end': {
            if (ev.searchQueries || ev.discoveredSources) {
              if (ev.title) {
                const line = document.createElement('div');
                line.className = 'flex items-center gap-2 pb-2 text-[15px] text-white/60 svelte-wgb08k';
                line.innerHTML = `${ICON_SEARCH}<span>${esc(ev.title)}</span>`;
                stepsEl.appendChild(line);
              }
              if (ev.discoveredSources && ev.discoveredSources.length) api.sources_(ev.discoveredSources);
              api.renderSearch({ queries: ev.searchQueries || [], sources });
            } else if (ev.title) {
              const line = document.createElement('div');
              line.className = 'flex items-center gap-2 pb-2 text-[15px] text-white/60 svelte-wgb08k';
              line.innerHTML = `${ICON_SEARCH}<span>${esc(ev.title)}</span>`;
              stepsEl.appendChild(line);
            }
            break;
          }
          case 'thinking-complete':
          case 'start':
          default:
            break;
        }
      },
      sources_(list) {
        sources = list.map((s) => ({ ...s, domain: s.domain || hostOf(s.url), label: s.label || label(s.domain || hostOf(s.url)) }));
        srcToggle.removeAttribute('hidden');
        srcLabel.textContent = `Pesquisou em ${sources.length} fonte${sources.length === 1 ? '' : 's'}`;
        iconWin.innerHTML = iconStack(sources, 0);
        let i = 0;
        clearInterval(iconWin._timer);
        iconWin._timer = setInterval(() => {
          const frames = iconWin.querySelectorAll('.site-icon-frame');
          if (!frames.length) return;
          frames.forEach((f, k) => f.classList.toggle('site-icon-active', k === i % frames.length));
          i++;
        }, 900);
        api.renderSearch({ sources });
      },
      renderSearch({ queries, sources: list }) {
        const src = list && list.length ? list : sources;
        if (!src.length && !(queries && queries.length)) return;
        const stack = src.slice(0, 3);
        searchWrap.removeAttribute('hidden');
        searchWrap.innerHTML = `
          <div class="grok-search-block relative pb-3.5 svelte-wgb08k">
            <div class="flex min-w-0 items-start gap-2.5 pb-2.5 text-white/60 svelte-wgb08k">
              <div class="min-w-0 flex-1 svelte-wgb08k">${(queries || []).slice(0, 3).map((q) => `<div class="truncate text-xs svelte-wgb08k">“${esc(q)}”</div>`).join('')}</div>
              <div class="ml-auto flex shrink-0 items-center gap-2 pl-2 svelte-wgb08k">
                <span class="text-xs whitespace-nowrap svelte-wgb08k">${src.length} resultado${src.length === 1 ? '' : 's'}</span>
                <span class="flex items-center pl-1 svelte-wgb08k" aria-hidden="true">${stack
                  .map((s, i) => `<img alt="" width="18" height="18" src="${fav(s.domain)}" class="h-[18px] w-[18px] rounded-full border object-cover border-black svelte-wgb08k" style="margin-left:${i ? '-6px' : '0'};z-index:${3 - i}">`)
                  .join('')}</span>
              </div>
            </div>
            <div class="grok-results-panel ml-6 max-h-[300px] overflow-y-auto rounded-2xl border bg-white/5 border-white/10 svelte-wgb08k">
              ${src
                .map(
                  (s) => `<a target="_blank" rel="noopener noreferrer" href="${esc(s.url)}" class="grok-result-link block px-4 py-3 transition-colors hover:bg-white/[0.035] svelte-wgb08k">
                    <span class="block text-sm font-semibold leading-5 text-white/80 svelte-wgb08k">${esc(s.title)}</span>
                    <span class="mt-1.5 flex items-center gap-2 text-xs text-white/60 svelte-wgb08k"><img alt="" width="16" height="16" class="h-4 w-4 rounded-full object-cover svelte-wgb08k" src="${fav(s.domain, 64)}"><span class="svelte-wgb08k">${esc(s.domain)}</span></span>
                  </a>`
                )
                .join('')}
            </div>
          </div>`;
      },
      /* texto em streaming */
      text(acc) {
        content.innerHTML = md(acc, sources) + '<span class="sk-caret"></span>';
        autoScroll();
      },
      /* fim: rótulo final e texto definitivo */
      done(acc) {
        clearInterval(tick);
        clearInterval(iconWin._timer);
        if (sources.length) {
          const upBtn = li.querySelector('[data-act="up"]');
          const row = upBtn && upBtn.parentElement;
          if (row && !row.querySelector('[data-sources-chip]')) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.dataset.sourcesChip = '';
            chip.setAttribute('aria-label', `Ver ${sources.length} fontes`);
            chip.className =
              'inline-flex items-center h-6 rounded-full px-2 gap-1 text-white/40 hover:text-white/80 hover:bg-white/10 transition-all duration-300 cursor-pointer';
            const uniq = [];
            for (const s of sources) {
              if (!uniq.includes(s.domain)) uniq.push(s.domain);
              if (uniq.length >= 4) break;
            }
            chip.innerHTML =
              '<span class="flex shrink-0 items-center gap-0.5">' +
              uniq
                .map(
                  (d) =>
                    `<img alt="" width="14" height="14" class="rounded-full shrink-0" style="width:14px;height:14px" src="${fav(d)}">`
                )
                .join('') +
              `</span><span class="text-xs font-normal whitespace-nowrap">${sources.length} fontes</span>`;
            chip.addEventListener('click', (e) => {
              e.stopPropagation();
              openSources(sources);
            });
            row.insertBefore(chip, row.firstChild);
          }
        }
        const secs = Math.max(1, Math.round((performance.now() - t0) / 1000));
        labelEl.textContent = acc ? `Trabalhou por ${secs}s` : 'Trabalho concluído';
        content.innerHTML = md(acc || '_(sem resposta)_', sources);
        autoScroll();
      },
      abort() {
        clearInterval(tick);
        clearInterval(iconWin._timer);
      },
    };
    return api;
  }

  let autoScroll = () => {};
  if (typeof window !== 'undefined') {
    autoScroll = () => {
      const list = document.querySelector('.chat-list');
      if (list) list.scrollTop = list.scrollHeight;
    };
  }

  /* ------------------------------------------------- chips de follow-up */
  function followUps(host, questions, onPick) {
    if (!questions || !questions.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'flex flex-wrap items-center gap-2 mt-3 pl-3 svelte-76r9u1';
    wrap.innerHTML = questions
      .map(
        (q) => `<button type="button" class="chip-btn primary-chip flex items-center justify-center gap-2 h-9 px-3 rounded-full text-[13px]">${esc(q)}</button>`
      )
      .join('');
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) onPick && onPick(b.textContent.trim());
    });
    host.appendChild(wrap);
  }

  /* --------------------------------------------------- gaveta de fontes */
  function openSources(sources) {
    if (!sources || !sources.length) return;
    const back = document.createElement('div');
    back.className = 'fixed inset-0 z-[99] bg-black/50';
    const panel = document.createElement('div');
    panel.className =
      'fixed z-[100] bottom-0 left-0 right-0 max-h-[75vh] sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[60vw] sm:max-w-[420px] flex flex-col text-clip sources-panel-black rounded-t-2xl sm:rounded-none shadow-2xl overflow-hidden svelte-1qhowmm';
    panel.style.transform = 'translateY(100%)';
    panel.style.transition = 'transform 240ms cubic-bezier(0.32,0.72,0,1)';
    panel.innerHTML = `
      <div class="sm:hidden flex justify-center py-3 svelte-1qhowmm"><div class="w-10 h-1 rounded-full bg-white/20 svelte-1qhowmm"></div></div>
      <div class="px-4 h-14 flex items-center gap-3 border-b border-white/10 shrink-0 svelte-1qhowmm">
        <span class="text-white text-base font-medium flex-1 min-w-0 truncate svelte-1qhowmm">${sources.length} fontes</span>
        <button class="inline-flex items-center justify-center h-8 w-8 rounded-full text-white/40 hover:text-white/80 hover:bg-white/10 svelte-1qhowmm" aria-label="Fechar">✕</button>
      </div>
      <div class="flex-1 overflow-y-auto overflow-x-hidden sources-drawer-scroll">
        <div class="px-5 py-4 flex flex-col items-start gap-4 svelte-1qhowmm">
          <div class="flex flex-col gap-6 w-full svelte-1qhowmm">
            ${sources
              .map(
                (s) => `<a target="_blank" rel="noopener noreferrer" class="flex gap-2.5 -m-2 p-2 rounded-xl hover:bg-white/5 transition-colors select-none svelte-1qhowmm" href="${esc(s.url)}">
                  <div class="shrink-0 svelte-1qhowmm" style="transform: translateY(2px)">
                    <div class="relative shrink-0 overflow-hidden flex items-center justify-center rounded-full svelte-1qhowmm" style="width:16px;height:16px">
                      <img width="16" height="16" class="relative block svelte-1qhowmm" alt="${esc(s.domain)} favicon" src="${fav(s.domain)}">
                      <div class="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-full svelte-1qhowmm"></div>
                    </div>
                  </div>
                  <div class="flex flex-col flex-1 min-w-0 svelte-1qhowmm">
                    <span class="text-white/40 text-xs line-clamp-1 svelte-1qhowmm">${esc(s.domain)}</span>
                    <span class="text-white text-sm font-medium line-clamp-2 svelte-1qhowmm">${esc(s.title)}</span>
                  </div>
                </a>`
              )
              .join('')}
          </div>
        </div>
      </div>`;
    document.body.appendChild(back);
    document.body.appendChild(panel);
    requestAnimationFrame(() => (panel.style.transform = 'translateY(0)'));
    const close = () => {
      panel.style.transform = 'translateY(100%)';
      back.remove();
      setTimeout(() => panel.remove(), 260);
    };
    back.addEventListener('click', close);
    panel.querySelector('[aria-label="Fechar"]').addEventListener('click', close);
  }

  /* --------------------------------------------------- download artefato */
  function downloadArtifact(name, code) {
    const safe = (name || 'pagina').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pagina';
    const blob = new Blob([code], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = /\.html?$/.test(safe) ? safe : safe + '.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* =========================================================== motor demo
   * Emite exatamente a mesma sequência de eventos do backend original, com
   * fontes reais (busca na API pública da Wikipédia, liberada por CORS) e
   * links de busca nos domínios de notícia para o restante da lista.
   * ===================================================================== */
  const NEWS_DOMAINS = [
    ['g1.globo.com', (q) => `https://g1.globo.com/busca/?q=${encodeURIComponent(q)}`],
    ['tecmundo.com.br', (q) => `https://www.tecmundo.com.br/busca?q=${encodeURIComponent(q)}`],
    ['olhardigital.com.br', (q) => `https://olhardigital.com.br/?s=${encodeURIComponent(q)}`],
    ['cnnbrasil.com.br', (q) => `https://www.cnnbrasil.com.br/?s=${encodeURIComponent(q)}`],
    ['canaltech.com.br', (q) => `https://canaltech.com.br/busca/?q=${encodeURIComponent(q)}`],
  ];

  async function wikiSearch(q) {
    try {
      const url =
        'https://pt.wikipedia.org/w/api.php?action=query&format=json&origin=*&list=search&srlimit=4&srsearch=' +
        encodeURIComponent(q);
      const r = await fetch(url);
      const j = await r.json();
      return (j.query && j.query.search) || [];
    } catch (e) {
      return [];
    }
  }

  async function discoveredSources(q) {
    const P = window.SKYPESQ;
    if (P) {
      try {
        const lista = await P.web(q);
        if (lista && lista.length) return lista;
      } catch (e) {}
    }
    // sem rede: mantém as duas fontes enciclopédicas que respondem por CORS
    try {
      const j = await fetch(
        'https://pt.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=4&srsearch=' +
          encodeURIComponent(String(q).slice(0, 120))
      ).then((r) => r.json());
      return ((j.query && j.query.search) || []).map((w) => ({
        title: w.title,
        url: 'https://pt.wikipedia.org/wiki/' + encodeURIComponent(w.title.replace(/ /g, '_')),
        domain: 'pt.wikipedia.org',
      }));
    } catch (e) {
      return [];
    }
  }

  const PLAN = {
    quick: ['Entendendo o pedido', 'Montando a resposta'],
    research: ['Próximo passo', 'Pesquisa web', 'Análise'],
    code: ['Próximo passo', 'Montando o código', 'Revisão'],
    image: ['Próximo passo', 'Preparando a descrição'],
  };

  function pickPlan(prompt, mode) {
    const p = (prompt || '').toLowerCase();
    if (mode === 'Pesquisa' || /\b(pesquis|busque|procure|not[ií]cia|hoje|atual|fonte|quem [ée]|quando|v[ií]deo|youtube|instagram|insta|reels?|canal)\b/.test(p)) return 'research';
    if (/\b(c[oó]digo|program|html|css|javascript|script|site|p[aá]gina|fun[çc][aã]o)\b/.test(p)) return 'code';
    if (/\b(imagem|foto|desenh|arte)\b/.test(p)) return 'image';
    return 'quick';
  }

  function answerFromSources(prompt, sources) {
    const q = prompt.trim().replace(/\s+/g, ' ').slice(0, 120);
    const head = `Sobre **${esc(q)}**, reuni ${sources.length} referências e organizei o essencial:`;
    const body = sources
      .slice(0, 4)
      .map((s, i) => `**${i + 1}. ${esc(s.title)}**\n\n${esc(s.domain)} · fonte consultada agora. [${i + 1}]`)
      .join('\n\n');
    const tail = '\n\nClique nas pílulas de citação para abrir cada fonte, ou use o botão de fontes para ver a lista completa.';
    return `${head}\n\n${body}${tail}`;
  }

  async function demoStream(prompt, mode, h) {
    const onEvent = h.onEvent || (() => {});
    const onText = h.onText || (() => {});
    const onSources = h.onSources || (() => {});
    const emit = (o) => onEvent(o);
    const plan = pickPlan(prompt, mode);

    emit({ type: 'start', messageId: uid(16), messageMetadata: { presentationIntent: 'PLAIN' } });
    await wait(160);
    emit({
      type: 'thinking-meta',
      summaryTitle:
        plan === 'research' ? 'Recuperando e validando informações recentes'
        : plan === 'code' ? 'Montando o código'
        : 'Preparando a resposta',
    });

    let i = 0;
    const preambles = {
      research: 'Vou consultar fontes relevantes e separar o que está confirmado do que ainda precisa de contexto antes de responder.',
      code: 'Vou montar a solução em etapas, comentar o essencial e entregar o arquivo pronto para baixar.',
      image: 'Vou descrever a cena e preparar os parâmetros da imagem.',
      quick: 'Vou direto ao ponto e organizar a resposta em blocos curtos.',
    };
    const stepId = () => uid(16);

    const s0 = stepId();
    emit({ type: 'step-start', stepId: s0, stepIndex: i++, stepType: 'preamble' });
    const pre = preambles[plan];
    for (const w of pre.match(/\S+\s*/g) || [pre]) {
      emit({ type: 'step-delta', stepId: s0, delta: w });
      await wait(16 + Math.random() * 24);
    }
    emit({ type: 'step-end', stepId: s0, title: 'Próximo passo' });

    let sources = [];
    if (plan === 'research') {
      const queries = [prompt.slice(0, 60), `${prompt.slice(0, 40)} 2026`, `${prompt.slice(0, 40)} fontes`]
        .filter(Boolean)
        .map((q) => q.replace(/\s+/g, ' ').trim());
      const s1 = stepId();
      emit({ type: 'step-start', stepId: s1, stepIndex: i++, stepType: 'search', searchQueries: queries });
      sources = await discoveredSources(prompt);
      if (h.isCancelled && h.isCancelled()) return { text: '' };
      onSources(sources);
      emit({ type: 'step-end', stepId: s1, title: 'Pesquisa web', searchQueries: queries, discoveredSources: sources });

      const s2 = stepId();
      emit({ type: 'step-start', stepId: s2, stepIndex: i++, stepType: 'thinking' });
      await wait(700);
      emit({ type: 'step-end', stepId: s2, title: 'Análise' });
    } else if (plan === 'code') {
      const s1 = stepId();
      emit({ type: 'step-start', stepId: s1, stepIndex: i++, stepType: 'thinking' });
      await wait(650);
      emit({ type: 'step-end', stepId: s1, title: 'Montando o código' });
    }
    emit({ type: 'thinking-complete', totalSteps: i });

    const q = String(prompt || '').replace(/\s+/g, ' ').trim();
    const pergunta = /\?|\b(quem|o que|como|por que|porque|quando|onde|qual|quais|quanto|explica|defina)\b/i.test(q) && q.length > 8;
    const resumoRapido = plan === 'quick' && pergunta && window.SKYPESQ ? await window.SKYPESQ.resumo(q).catch(() => null) : null;

    let text =
      plan === 'code'
        ? `Aqui está uma página pronta para o seu pedido:\n\n\`\`\`html\n<!doctype html>\n<html lang="pt-BR">\n<title>${esc(prompt.slice(0, 40))}</title>\n<body style="font-family:system-ui;background:#0b0b0b;color:#f5f5f5;display:grid;place-items:center;height:100vh;margin:0">\n  <main style="text-align:center">\n    <h1 style="font-weight:600">${esc(prompt.slice(0, 60))}</h1>\n    <p id="out">0</p>\n    <button onclick="document.getElementById('out').textContent=+document.getElementById('out').textContent+1" style="padding:12px 20px;border-radius:12px;border:1px solid #333;background:#171717;color:#fff;cursor:pointer">Clique</button>\n  </main>\n</body>\n</html>\n\`\`\`\n\nBaixe o arquivo no cartão acima, abra no navegador e edite o que quiser.`
        : resumoRapido
        ? `**${esc(resumoRapido.titulo)}**\n\n${esc(resumoRapido.texto)}\n\nQuer que eu aprofunde com fontes, vídeos ou notícias sobre isso?`
        : plan === 'research'
        ? answerFromSources(prompt, sources)
        : `Sobre **${esc(q.slice(0, 90))}**: me diga o recorte que interessa (notícias de hoje, vídeos, perfis no Instagram, fontes técnicas) e eu busco na hora, sem intermediário.`;

    // artefatos com dados reais (clima, prints, vídeos, Instagram, notícias, fontes)
    if (window.SKYNART && window.SKYNART.build && plan !== 'code') {
      const art = await window.SKYNART.build(prompt, sources, h.files);
      if (art && art.text) {
        text = art.text;
        if (art.sources && art.sources.length) {
          sources = art.sources.map((s2) => ({ ...s2, domain: s2.domain || hostOf(s2.url) }));
          onSources(sources);
          const sid = stepId();
          emit({ type: 'step-start', stepId: sid, stepIndex: i++, stepType: 'search', searchQueries: [q.slice(0, 60)] });
          emit({ type: 'step-end', stepId: sid, title: 'Resultados ao vivo', searchQueries: [q.slice(0, 60)], discoveredSources: sources });
        }
      }
    }

    emit({ type: 'text-start', id: uid(16), providerMetadata: { skynet: { replaceable: true } } });
    const chunks = text.match(/\s*\S+|\s+/g) || [text];
    let acc = '';
    for (const ch of chunks) {
      if (h.isCancelled && h.isCancelled()) break;
      acc += ch;
      emit({ type: 'text-delta', delta: ch });
      onText(ch);
      await wait(6 + Math.random() * 16);
    }
    emit({ type: 'text-end', id: uid(16) });
    emit({
      type: 'follow-ups',
      questions:
        plan === 'research'
          ? ['Resumir em 5 tópicos', 'Só as fontes em português', 'Comparar com a semana passada']
          : ['Explicar melhor', 'Gerar outra versão', 'Transformar em código'],
    });
    emit({ type: 'roleplay-state', isRoleplay: false });
    emit({ type: 'finish' });
    return { text: acc, sources };
  }

  /* ====================================================== motor API real
   * Usa o MESMO contrato do original. Configure em "Configurar IA":
   *   endpoint  ex.: https://skynetchat.net  (ou seu próprio backend)
   *   version   V4_5 | V4_5_MAX | V3 | V3_THINKING | V2_FAST | V1
   *   key       opcional (Bearer)
   * ===================================================================== */
  async function apiStream(messages, opts) {
    const base = String(opts.settings.endpoint || '').replace(/\/+$/, '');
    const map = { MAX: 'V4_5_MAX', '4.5': 'V4_5', '4.5 MAX': 'V4_5_MAX', '3': 'V3', Rápido: 'V4_5' };
    const version = opts.settings.version || map[opts.mode] || 'V4_5';
    const url = base + (ENDPOINTS[version] || ENDPOINTS.V4_5);
    const headers = { 'content-type': 'application/json' };
    if (opts.settings.key) headers.authorization = 'Bearer ' + opts.settings.key;
    const last = messages[messages.length - 1];
    const parts = [{ type: 'text', text: last.content }];
    for (const img of (opts.images || []).slice(0, 4)) {
      if (!img) continue;
      const m = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(img);
      parts.push({ type: 'file', mediaType: m ? m[1] : 'image/jpeg', url: img });
    }
    const body = {
      id: uid(16),
      messages: [{ parts, id: uid(16), role: 'user' }],
      trigger: 'submit-message',
      historyExcludedMessageIds: [],
      conversationId: uid(6) + '-' + uid(6),
      hasGeneratedImage: false,
    };
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: opts.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let sources = [];
    await readStream(
      res,
      (ev) => {
        if (ev.type === 'step-end' && ev.discoveredSources) {
          sources = ev.discoveredSources.map((s) => ({ ...s, domain: s.domain || hostOf(s.url) }));
          opts.onSources && opts.onSources(sources);
        }
        if (ev.type === 'text-delta' && ev.delta) opts.onText && opts.onText(ev.delta);
        opts.onEvent && opts.onEvent(ev);
      },
      (r) => (opts.attach ? opts.attach(r) : null)
    );
    return { sources };
  }

  window.SKYN = {
    ENDPOINTS,
    parseSSE,
    readStream,
    md,
    trace,
    followUps,
    openSources,
    downloadArtifact,
    demoStream,
    apiStream,
    fav,
    hostOf,
  };
})();
