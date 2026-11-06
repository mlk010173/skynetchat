/* =====================================================================
   SKYNETchat — motor de artefatos (widgets dentro do chat)
   Transforma blocos ```artefato {json}``` em widgets nativos:
     noticias · clima (ao vivo) · fotos · tabela · grafico · html
   Sem backend, sem dependência externa.
   ===================================================================== */
(() => {
  'use strict';

  const KNOWN = new Set(['noticias', 'clima', 'fotos', 'tabela', 'grafico', 'html', 'videos', 'social', 'fontes']);
  const ALIAS = { news: 'noticias', weather: 'clima', gallery: 'fotos', table: 'tabela', chart: 'grafico', page: 'html', youtube: 'videos', video: 'videos', instagram: 'social', ig: 'social', sources: 'fontes', pesquisa: 'fontes' };
  const climaCache = new Map();

  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');
  const hostOf = (u) => { try { return new URL(String(u)).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };

  /* ------------------------------ ícones ----------------------------- */
  const P = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    cloud: '<path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.5A3.5 3.5 0 0 0 6.5 19Z"/>',
    suncloud: '<circle cx="8" cy="8" r="3"/><path d="M8 2v1.5M2 8h1.5M3.7 3.7l1 1M12.3 3.7l-1 1"/><path d="M16 20a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.4 1.3A3.4 3.4 0 0 0 6.6 20Z"/>',
    rain: '<path d="M17.5 15a4.5 4.5 0 0 0 0-9A6 6 0 0 0 5.9 7.5 3.5 3.5 0 0 0 6.5 15"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
    storm: '<path d="M18 14a4.5 4.5 0 0 0-1-8.9A6 6 0 0 0 5.8 6.4 3.5 3.5 0 0 0 6.5 14"/><path d="M12 12l-2 5h3l-1 4"/>',
    snow: '<path d="M17.5 15a4.5 4.5 0 0 0 0-9A6 6 0 0 0 5.9 7.5 3.5 3.5 0 0 0 6.5 15"/><path d="M8 18h.01M12 20h.01M16 18h.01"/>',
    fog: '<path d="M4 9h11a3 3 0 1 0-3-3"/><path d="M4 15h13M6 19h10"/>',
    file: '<path d="M14 3v5h5"/><path d="M19 21H5V3h9l5 5v13Z"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    photo: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.5-4.5L7 20"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5 16 12l-6 3.5Z"/>',
    ig: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  };
  const svg = (name, size = 18) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.file}</svg>`;

  /* ------------------------- códigos de tempo ------------------------ */
  const WMO = [
    [[0], 'Céu limpo', 'sun'],
    [[1, 2], 'Poucas nuvens', 'suncloud'],
    [[3], 'Nublado', 'cloud'],
    [[45, 48], 'Neblina', 'fog'],
    [[51, 53, 55, 56, 57], 'Garoa', 'rain'],
    [[61, 63, 65, 66, 67], 'Chuva', 'rain'],
    [[71, 73, 75, 77], 'Neve', 'snow'],
    [[80, 81, 82], 'Pancadas', 'rain'],
    [[85, 86], 'Neve forte', 'snow'],
    [[95], 'Trovoadas', 'storm'],
    [[96, 99], 'Trovoada com granizo', 'storm'],
  ];
  const tempo = (code) => {
    for (const [codes, label, icon] of WMO) if (codes.includes(Number(code))) return { label, icon };
    return { label: 'Tempo estável', icon: 'cloud' };
  };
  const diaSemana = (iso) => {
    const d = new Date(iso + 'T12:00:00');
    return ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d.getDay()] || '';
  };

  /* ----------------------------- moldura ---------------------------- */
  const KIND_LABEL = { noticias: 'Notícias', clima: 'Clima', fotos: 'Fotos', tabela: 'Tabela', grafico: 'Gráfico', html: 'Página', videos: 'Vídeos', social: 'Instagram', fontes: 'Fontes' };
  const KIND_ICON = { noticias: 'file', clima: 'suncloud', fotos: 'photo', tabela: 'chart', grafico: 'chart', html: 'file', videos: 'play', social: 'ig', fontes: 'search' };

  function shell(spec, body, opts = {}) {
    const kind = spec.type;
    return `<section class="art${opts.loading ? ' is-loading' : ''}" data-art="${esc(kind)}">
      <header class="art-head">
        <span class="art-ico">${svg(KIND_ICON[kind] || 'file', 16)}</span>
        <span class="art-titles">
          <strong>${esc(spec.titulo || KIND_LABEL[kind] || 'Artefato')}</strong>
          ${spec.subtitulo ? `<small>${esc(spec.subtitulo)}</small>` : ''}
        </span>
        <span class="art-kind">${esc(KIND_LABEL[kind] || kind)}</span>
      </header>
      <div class="art-body">${body}</div>
      <footer class="art-foot">
        <button type="button" data-art-copy>Copiar</button>
        <button type="button" data-art-save>Baixar</button>
        ${kind === 'html' ? '<button type="button" data-art-open>Abrir</button>' : ''}
      </footer>
    </section>`;
  }

  /* ---------------------------- notícias ---------------------------- */
  function renderNoticias(spec) {
    const itens = (spec.itens || spec.items || []).slice(0, 12);
    if (!itens.length) return shell(spec, '<p class="art-empty">Nenhuma notícia no artefato.</p>');
    const body = `<div class="art-news-list">${itens
      .map((n) => {
        const url = safeUrl(n.url || n.link);
        const meta = [n.fonte || n.source, n.data || n.date].filter(Boolean).join(' · ');
        const inner = `<span class="art-news-meta">${esc(meta)}</span>
          <b>${esc(n.titulo || n.title || '')}</b>
          ${n.resumo || n.summary ? `<span class="art-news-res">${esc(n.resumo || n.summary)}</span>` : ''}`;
        return url
          ? `<a class="art-news" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
          : `<div class="art-news">${inner}</div>`;
      })
      .join('')}</div>`;
    return shell(spec, body);
  }

  /* ----------------------------- vídeos ----------------------------- */
  function renderVideos(spec) {
    const itens = (spec.itens || spec.items || []).slice(0, 8);
    if (!itens.length) return shell(spec, '<p class="art-empty">Nenhum vídeo encontrado para essa busca.</p>');
    const body = `<div class="art-videos">${itens
      .map((v) => {
        const url = safeUrl(v.url || v.link) || 'https://www.youtube.com';
        const thumb = safeUrl(v.thumb || v.thumbnail);
        return `<a class="art-video" href="${esc(url)}" target="_blank" rel="noopener noreferrer">
          <span class="art-video-thumb">
            ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
            <span class="art-video-play">${svg('play', 26)}</span>
            ${v.duracao || v.duration ? `<em>${esc(v.duracao || v.duration)}</em>` : ''}
          </span>
          <span class="art-video-info">
            <b>${esc(v.titulo || v.title || '')}</b>
            <small>${esc(v.canal || v.channel || 'YouTube')}</small>
            ${v.meta ? `<small class="art-video-meta">${esc(v.meta)}</small>` : ''}
          </span>
        </a>`;
      })
      .join('')}</div>`;
    return shell(spec, body);
  }

  /* ---------------------------- instagram --------------------------- */
  function renderSocial(spec) {
    const itens = (spec.itens || spec.items || []).slice(0, 6);
    if (!itens.length) return shell(spec, '<p class="art-empty">Nenhum perfil ou post encontrado.</p>');
    const body = `<div class="art-social">${itens
      .map((it) => {
        const url = safeUrl(it.url);
        const user = String(it.usuario || it.usuario || '').replace(/^@/, '');
        const embed = safeUrl(it.embed);
        return `<article class="art-ig" data-ig="${esc(embed)}">
          <header class="art-ig-head">
            <span class="art-ig-avatar">${esc((user || 'IG').slice(0, 2).toUpperCase())}</span>
            <span class="art-ig-id">
              <b>${esc(user ? '@' + user : it.titulo || 'Instagram')}</b>
              <small>${esc(it.tipo === 'perfil' ? 'perfil' : it.tipo === 'reel' ? 'reel' : 'publicação')}</small>
            </span>
          </header>
          ${it.resumo ? `<p class="art-ig-res">${esc(it.resumo)}</p>` : ''}
          <div class="art-ig-embed"></div>
          <footer class="art-ig-foot">
            ${embed ? '<button type="button" data-ig-load>Ver no chat</button>' : ''}
            ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Abrir no Instagram</a>` : ''}
          </footer>
        </article>`;
      })
      .join('')}</div>`;
    return shell(spec, body);
  }

  /* ----------------------------- fontes ----------------------------- */
  function renderFontes(spec) {
    const itens = (spec.itens || spec.items || []).slice(0, 12);
    if (!itens.length) return shell(spec, '<p class="art-empty">Nenhuma fonte reunida.</p>');
    const body = `<ol class="art-src">${itens
      .map((f, i) => {
        const url = safeUrl(f.url || f.link);
        const inner = `<span class="art-src-n">${i + 1}</span>
          <span class="art-src-txt">
            <b>${esc(f.titulo || f.title || '')}</b>
            ${f.resumo || f.snippet ? `<small>${esc(f.resumo || f.snippet)}</small>` : ''}
            <em>${esc(f.fonte || f.domain || hostOf(url))}</em>
          </span>`;
        return url
          ? `<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${inner}</a></li>`
          : `<li>${inner}</li>`;
      })
      .join('')}</ol>`;
    return shell(spec, body);
  }

  /* ------------------------------ clima ----------------------------- */
  function climaBody(d) {
    const t = tempo(d.codigo);
    const prev = (d.previsao || [])
      .map((p) => {
        const pt = tempo(p.codigo);
        return `<div class="art-day"><small>${esc(p.dia)}</small>${svg(pt.icon, 20)}
          <b>${Math.round(p.max)}°</b><span>${Math.round(p.min)}°</span></div>`;
      })
      .join('');
    return `<div class="art-clima-hero">
        <div class="art-clima-main">${svg(t.icon, 34)}
          <div><b>${Math.round(d.temp)}°</b><small>${esc(t.label)}</small></div>
        </div>
        <div class="art-clima-meta">
          <span>Sensação <b>${Math.round(d.sensacao)}°</b></span>
          <span>Umidade <b>${Math.round(d.umidade)}%</b></span>
          <span>Vento <b>${Math.round(d.vento)} km/h</b></span>
        </div>
      </div>
      ${prev ? `<div class="art-forecast">${prev}</div>` : ''}
      <p class="art-src">${esc(d.local)} · Open-Meteo</p>`;
  }

  async function fetchClima(cidade) {
    const key = 'v1:' + String(cidade || '').toLowerCase();
    if (climaCache.has(key)) return climaCache.get(key);
    const g = await fetch(
      'https://geocoding-api.open-meteo.com/v1/search?count=1&language=pt&format=json&name=' + encodeURIComponent(cidade)
    ).then((r) => r.json());
    const c = (g && g.results && g.results[0]) || null;
    if (!c) throw new Error('cidade não encontrada');
    const u =
      `https://api.open-meteo.com/v1/forecast?latitude=${c.latitude}&longitude=${c.longitude}` +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=6';
    const f = await fetch(u).then((r) => r.json());
    const cur = f.current || {};
    const d = f.daily || {};
    const out = {
      local: [c.name, c.admin1, c.country].filter(Boolean).join(', '),
      temp: cur.temperature_2m,
      sensacao: cur.apparent_temperature,
      umidade: cur.relative_humidity_2m,
      vento: cur.wind_speed_10m,
      codigo: cur.weather_code,
      previsao: (d.time || []).map((iso, i) => ({
        dia: i === 0 ? 'hoje' : diaSemana(iso),
        max: d.temperature_2m_max[i],
        min: d.temperature_2m_min[i],
        codigo: d.weather_code[i],
      })),
    };
    climaCache.set(key, out);
    return out;
  }

  function renderClima(spec) {
    // dados já resolvidos dentro do spec
    if (spec.temp != null || (spec.atual && spec.atual.temp != null)) {
      const a = spec.atual && spec.atual.temp != null ? spec.atual : spec;
      return shell(
        spec,
        climaBody({
          local: spec.local || a.local || spec.cidade || '',
          temp: a.temp,
          sensacao: a.sensacao != null ? a.sensacao : a.temp,
          umidade: a.umidade || 0,
          vento: a.vento || 0,
          codigo: a.codigo != null ? a.codigo : 0,
          previsao: spec.previsao || a.previsao || [],
        })
      );
    }
    // modo ao vivo: pinta o esqueleto e hidrata depois de montado
    const cidade = spec.cidade || spec.local || 'São Paulo';
    return shell(spec, '<div class="art-skel" data-art-live="' + esc(cidade) + '"></div>', { loading: true });
  }

  function hydrateClima(el, spec, cidade) {
    const box = el.querySelector('[data-art-live]');
    if (!box) return;
    fetchClima(cidade)
      .then((d) => {
        el.classList.remove('is-loading');
        const sub = el.querySelector('.art-titles small');
        if (sub) sub.textContent = d.local;
        else if (el.querySelector('.art-titles')) {
          const sm = document.createElement('small');
          sm.textContent = d.local;
          el.querySelector('.art-titles').appendChild(sm);
        }
        el.querySelector('.art-body').innerHTML = climaBody(d);
      })
      .catch(() => {
        el.classList.remove('is-loading');
        el.querySelector('.art-body').innerHTML =
          '<p class="art-empty">Não consegui carregar o clima de <b>' + esc(cidade) + '</b> agora. ' +
          '<a href="https://www.google.com/search?q=clima+' + encodeURIComponent(cidade) + '" target="_blank" rel="noopener">ver no navegador</a>.</p>';
      });
  }

  /* ------------------------------ fotos ----------------------------- */
  function renderFotos(spec) {
    const imgs = (spec.imagens || spec.images || spec.fotos || []).slice(0, 12);
    const body = imgs.length
      ? `<div class="art-grid">${imgs
          .map((im, i) => {
            const src = safeUrl(im.url || im.src) || im.url || im.src || '';
            return `<figure class="art-fig" data-art-img="${i}">
              <button type="button" class="art-fig-btn" data-art-zoom="${i}">
                <img src="${esc(src)}" alt="${esc(im.legenda || im.caption || 'imagem')}" loading="lazy">
              </button>
              ${im.legenda || im.caption ? `<figcaption>${esc(im.legenda || im.caption)}</figcaption>` : ''}
            </figure>`;
          })
          .join('')}</div>`
      : '<p class="art-empty">Nenhuma imagem no artefato.</p>';
    return shell(spec, body);
  }

  /* ----------------------------- tabela ----------------------------- */
  function renderTabela(spec) {
    const cols = spec.colunas || spec.columns || [];
    const rows = spec.linhas || spec.rows || [];
    const body = `<div class="art-table-wrap"><table class="art-table">
      ${cols.length ? `<thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>` : ''}
      <tbody>${rows.map((r) => `<tr>${(Array.isArray(r) ? r : [r]).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
    return shell(spec, body);
  }

  /* ---------------------------- gráfico ----------------------------- */
  function renderGrafico(spec) {
    const series = (spec.series || spec.dados || []).slice(0, 14);
    if (!series.length) return shell(spec, '<p class="art-empty">Sem dados para o gráfico.</p>');
    const vals = series.map((s) => Number(s.valor != null ? s.valor : s.value) || 0);
    const max = Math.max(...vals, 1);
    const W = 100;
    const bars = series
      .map((s, i) => {
        const v = vals[i];
        const h = Math.max(2, (v / max) * 46);
        const x = (i + 0.5) * (W / Math.max(1, series.length));
        return `<g>
          <rect x="${(100 / series.length) * i + 1.2}" y="${52 - h}" width="${100 / series.length - 2.4}" height="${h}" rx="1.4" fill="currentColor"/>
          <text x="${x}" y="48.4" transform="rotate(-38 ${x} ${48.4})" class="art-bar-label">${esc(String(s.label || s.rotulo || s.nome || i + 1).slice(0, 14))}</text>
        </g>`;
      })
      .join('');
    const body = `<div class="art-chart"><svg viewBox="0 0 100 54" preserveAspectRatio="none" role="img" aria-label="${esc(spec.titulo || 'gráfico')}">
      <line x1="0" y1="52.2" x2="100" y2="52.2" class="art-axis"/>
      ${bars}
    </svg></div>
    <div class="art-legend">${series
      .map((s, i) => `<span>${esc(s.label || s.rotulo || s.nome || i + 1)} <b>${esc(s.valor != null ? s.valor : s.value)}</b></span>`)
      .join('')}</div>`;
    return shell(spec, body);
  }

  /* ------------------------------ html ------------------------------ */
  function renderHtml(spec) {
    const code = spec.codigo || spec.code || spec.html || '';
    const body = `<div class="art-frame">
      <iframe title="${esc(spec.titulo || 'artefato')}" sandbox="allow-scripts allow-forms allow-modals" srcdoc="${esc(code)}"></iframe>
    </div>`;
    return shell(spec, body);
  }

  /* ---------------------------- montagem ---------------------------- */
  const RENDER = {
    noticias: renderNoticias,
    videos: renderVideos,
    social: renderSocial,
    fontes: renderFontes,
    clima: renderClima,
    fotos: renderFotos,
    tabela: renderTabela,
    grafico: renderGrafico,
    html: renderHtml,
  };

  function normalize(spec) {
    if (!spec || typeof spec !== 'object') return null;
    const type = ALIAS[spec.type] || spec.type;
    if (!KNOWN.has(type)) return null;
    return { ...spec, type };
  }

  function mount(spec) {
    const html = RENDER[spec.type](spec);
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const el = tmp.firstElementChild;
    if (!el) return null;
    el.__artSpec = spec;
    const live = el.querySelector('[data-art-live]');
    if (live) hydrateClima(el, spec, live.getAttribute('data-art-live'));
    return el;
  }

  /* ------------------------- varredura do chat ---------------------- */
  function tryUpgrade(pre) {
    if (pre.closest('.art')) return;
    const raw = (pre.textContent || '').trim();
    if (!raw.startsWith('{')) return;
    let spec;
    try {
      spec = normalize(JSON.parse(raw));
    } catch (e) {
      return;
    }
    if (!spec) return;
    const box = pre.closest('.sk-code');
    const head = !box && pre.previousElementSibling && pre.previousElementSibling.classList.contains('sk-code-head')
      ? pre.previousElementSibling
      : null;
    const el = mount(spec);
    if (!el) return;
    const target = box || pre;
    target.replaceWith(el);
    if (head && head.parentNode) head.remove();
  }

  function scan(root) {
    const scope = root && root.querySelectorAll ? root : document;
    window.__artScans = (window.__artScans || 0) + 1;
    scope.querySelectorAll('pre').forEach(tryUpgrade);
  }

  /* ------------------------- ações dos widgets ---------------------- */
  document.addEventListener('click', (ev) => {
    const ig = ev.target.closest('[data-ig-load]');
    if (ig) {
      const card = ig.closest('.art-ig');
      const src = card && card.getAttribute('data-ig');
      const slot = card && card.querySelector('.art-ig-embed');
      if (src && slot && !slot.querySelector('iframe')) {
        slot.innerHTML = `<iframe src="${esc(src)}" loading="lazy" scrolling="no" allowtransparency="true" frameborder="0" title="Publicação do Instagram"></iframe>`;
        ig.textContent = 'Fechar prévia';
        ig.setAttribute('data-ig-close', '1');
      } else if (slot) {
        slot.innerHTML = '';
        ig.textContent = 'Ver no chat';
        ig.removeAttribute('data-ig-close');
      }
      return;
    }
    const btn = ev.target.closest('[data-art-copy], [data-art-save], [data-art-open], [data-art-zoom]');
    if (!btn) return;
    const art = btn.closest('.art');
    const spec = art && art.__artSpec;
    if (!spec) return;

    if (btn.hasAttribute('data-art-copy')) {
      const txt = JSON.stringify(spec, null, 2);
      copy(txt).then(() => flash(btn, 'Copiado'), () => flash(btn, 'Falhou'));
      return;
    }
    if (btn.hasAttribute('data-art-save')) {
      const isPage = spec.type === 'html';
      const code = isPage ? spec.codigo || spec.code || spec.html || '' : JSON.stringify(spec, null, 2);
      const blob = new Blob([code], { type: isPage ? 'text/html;charset=utf-8' : 'application/json;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (String(spec.titulo || 'artefato').toLowerCase().replace(/[^a-z0-9\u00c0-\u017f]+/gi, '-').replace(/^-|-$/g, '') || 'artefato') + (isPage ? '.html' : '.json');
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
      return;
    }
    if (btn.hasAttribute('data-art-open')) {
      const code = spec.codigo || spec.code || spec.html || '';
      const w = window.open('', '_blank');
      if (w) { w.document.write(code); w.document.close(); }
      return;
    }
    if (btn.hasAttribute('data-art-zoom')) {
      const imgs = (spec.imagens || spec.images || spec.fotos || []).map((i) => ({ url: i.url || i.src, legenda: i.legenda || i.caption }));
      if (window.SKYNMID && window.SKYNMID.open) window.SKYNMID.open(imgs, Number(btn.getAttribute('data-art-zoom')) || 0);
    }
  });

  function copy(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(txt).catch(() => copyLegacy(txt));
    }
    return copyLegacy(txt);
  }

  function copyLegacy(txt) {
    return new Promise((resolve, reject) => {
      try {
        const ta = document.createElement('textarea');
        ta.value = txt;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand && document.execCommand('copy');
        ta.remove();
        ok ? resolve() : reject(new Error('sem permissão'));
      } catch (e) { reject(e); }
    });
  }

  function flash(btn, msg) {
    const old = btn.textContent;
    btn.textContent = msg;
    setTimeout(() => (btn.textContent = old), 1200);
  }

  /* -------------------- gerador de artefatos (demo) ----------------- */
  const block = (spec) => '\n\n```artefato\n' + JSON.stringify(spec) + '\n```';

  const PESQ = window.SKYPESQ || null;
  const tema = (t) => String(t || '').replace(/\s+/g, ' ').trim();

  /* detecta o que a pessoa quer e devolve os dados reais */
  async function build(prompt, sources, files) {
    const bruto = String(prompt || '');
    const p = bruto.toLowerCase();
    const imgs = (files || []).filter((f) => f && f.dataUrl);

    /* 1. prints anexados */
    if (imgs.length) {
      const spec = {
        type: 'fotos',
        titulo: imgs.length > 1 ? `${imgs.length} imagens recebidas` : 'Imagem recebida',
        subtitulo: 'print enviado por você · amplie tocando',
        imagens: imgs.map((f, i) => ({ url: f.dataUrl, legenda: f.name || `imagem ${i + 1}` })),
      };
      return {
        text: `Recebi ${imgs.length > 1 ? 'as imagens' : 'a imagem'} e deixei em tamanho cheio no cartão acima. Toque para ampliar, ou peça o que quiser sobre o conteúdo: texto, layout, erro de tela, comparação.` + block(spec),
        sources: [],
      };
    }

    /* 2. clima ao vivo */
    if (/clima|temperatura|previs|chuva|frio|calor|tempo em/.test(p)) {
      const m = bruto.match(/\b(?:em|no|na|de|para)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’ ]{2,28})/i);
      const cidade = (m ? m[1] : 'São Paulo')
        .replace(/\b(agora|hoje|amanh[ãa]|nessa?\s+semana|por\s+favor|aqui|pra(ia)?)\b.*$/i, '')
        .trim()
        .replace(/[?!.,]+$/, '') || 'São Paulo';
      return {
        text: `Puxei o clima de **${cidade}** agora, com previsão dos próximos dias.` +
          block({ type: 'clima', titulo: `Clima · ${cidade}`, cidade, aoVivo: true }),
        sources: [],
      };
    }

    /* 3. vídeos do YouTube */
    if (/v[ií]deo|youtube|assistir|canal|aula|tutorial em v[ií]deo/.test(p)) {
      const q = tema(bruto.replace(/\b(v[ií]deos?|no youtube|do youtube|youtube)\b/gi, ' '));
      const itens = PESQ ? await PESQ.videos(q || bruto).catch(() => []) : [];
      if (itens.length) {
        return {
          text: `Achei ${itens.length} vídeos sobre **${tema(q) || tema(bruto)}** direto no YouTube. Cada cartão abre o vídeo no app.` +
            block({
              type: 'videos',
              titulo: `Vídeos · ${tema(q).slice(0, 46) || 'YouTube'}`,
              subtitulo: 'YouTube · resultados ao vivo',
              itens,
            }),
          sources: itens.slice(0, 5).map((v) => ({ title: v.titulo, url: v.url, domain: 'youtube.com' })),
        };
      }
      return {
        text: `Não consegui falar com o índice do YouTube agora, então deixei a busca pronta: [abrir resultados de “${tema(q) || tema(bruto)}” no YouTube](https://www.youtube.com/results?search_query=${encodeURIComponent(tema(q) || bruto)}).`,
        sources: [],
      };
    }

    /* 4. Instagram */
    if (/instagram|insta\b|reels?|perfil de|perfis de|post do|post da/.test(p)) {
      const q = tema(bruto.replace(/\b(instagram|insta|reels?|perfis?|perfil|posts?|postagens?)\b/gi, ' '));
      const itens = PESQ ? await PESQ.social(q || bruto).catch(() => []) : [];
      if (itens.length) {
        return {
          text: `Encontrei ${itens.length} ${itens.length > 1 ? 'resultados' : 'resultado'} no Instagram para **${tema(q) || tema(bruto)}**. Dá para abrir a prévia de cada post aqui no chat.` +
            block({
              type: 'social',
              titulo: `Instagram · ${tema(q).slice(0, 46) || 'resultados'}`,
              subtitulo: 'perfis e publicações públicas',
              itens,
            }),
          sources: itens.slice(0, 5).map((i) => ({ title: i.titulo || i.usuario, url: i.url, domain: 'instagram.com' })),
        };
      }
      return {
        text: `A busca pública do Instagram não devolveu resultados para **${tema(q) || tema(bruto)}** neste momento. O caminho direto: [explorar “${tema(q) || tema(bruto)}” no Instagram](https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(tema(q) || bruto)}).`,
        sources: [],
      };
    }

    /* 5. notícias de verdade */
    if (/not[ií]cia|manchete|jornal|aconteceu|últimas|hoje no|news/.test(p)) {
      const q = tema(bruto.replace(/(not[ií]cias?|manchetes?|últimas|ultimas|sobre|hoje|agora|quero|ver|me\s+mostre)/gi, ' ').replace(/\b(do|da|de|dos|das)\b/gi, ' '));
      const alvo = tema(q) || tema(bruto);
      const itens = PESQ ? await PESQ.noticias(alvo).catch(() => []) : [];
      if (itens.length) {
        const reais = itens.filter((i) => !i.fallback);
        return {
          text: `Levantei ${itens.length} publicações sobre **${alvo}**${reais.length ? ', com as mais recentes primeiro' : ''}. Cada linha abre a matéria no veículo.` +
            block({
              type: 'noticias',
              titulo: `Notícias · ${alvo}`.slice(0, 64),
              subtitulo: reais.length ? 'últimas publicações encontradas agora' : 'buscas atualizadas na fonte',
              itens: itens.map((n) => ({
                titulo: n.title || n.titulo,
                fonte: n.domain || n.fonte,
                resumo: n.snippet || n.resumo,
                url: n.url,
              })),
            }),
          sources: itens.slice(0, 6).map((n) => ({ title: n.title || n.titulo, url: n.url, domain: n.domain })),
        };
      }
    }

    /* 6. pesquisa aberta com fontes reais */
    if (/fonte|pesquis|busque|procure|quem [ée]|o que [ée]|como funciona|por que|quando|onde|compare|explica/.test(p)) {
      const lista = (sources && sources.length ? sources : PESQ ? await PESQ.web(bruto).catch(() => []) : []).slice(0, 8);
      const res = PESQ ? await PESQ.resumo(bruto).catch(() => null) : null;
      if (res || lista.length) {
        let texto = '';
        if (res) {
          texto += `**${res.titulo}**\n\n${res.texto}\n\n`;
        }
        texto += `Reuni ${lista.length} fontes para **${tema(bruto).slice(0, 70)}**. Abra cada uma para conferir o original.`;
        const spec = {
          type: 'fontes',
          titulo: `Fontes · ${tema(bruto).slice(0, 46)}`,
          subtitulo: 'leitura feita agora, no navegador',
          itens: lista.map((f) => ({
            titulo: f.title || f.titulo,
            resumo: f.snippet || f.resumo,
            fonte: f.domain,
            url: f.url,
          })),
        };
        return { text: texto + block(spec), sources: lista };
      }
    }

    return null;
  }

  /* versão síncrona antiga: só os casos que não dependem de rede */
  function demoText(prompt, sources, files) {
    const p = String(prompt || '').toLowerCase();
    const imgs = (files || []).filter((f) => f && f.dataUrl);
    if (imgs.length) {
      const spec = {
        type: 'fotos',
        titulo: imgs.length > 1 ? `${imgs.length} imagens recebidas` : 'Imagem recebida',
        subtitulo: 'print enviado por você · amplie tocando',
        imagens: imgs.map((f, i) => ({ url: f.dataUrl, legenda: f.name || `imagem ${i + 1}` })),
      };
      return `Recebi ${imgs.length > 1 ? 'as imagens' : 'a imagem'}. Toque para ampliar.` + block(spec);
    }
    if (/clima|temperatura|previs|chuva|frio|calor/.test(p)) {
      const m = prompt.match(/\b(?:em|no|na|de|para)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’ ]{2,28})/i);
      const cidade = (m ? m[1] : 'São Paulo')
        .replace(/\b(agora|hoje|amanh[ãa]|nessa?\s+semana|por\s+favor|aqui|pra(ia)?)\b.*$/i, '')
        .trim()
        .replace(/[?!.,]+$/, '') || 'São Paulo';
      return `Buscando o clima de **${cidade}** ao vivo.` +
        block({ type: 'clima', titulo: `Clima · ${cidade}`, cidade, aoVivo: true });
    }
    return null;
  }

  /* --------------------------- inicialização ------------------------ */
  /* O shell do clone anima elementos e atualiza créditos o tempo todo, então
     debounce puro nunca "assenta". Usamos throttle: no máximo uma varredura
     a cada ~140ms, sem cancelar a que já está agendada. */
  let timer = null;
  let lastRun = 0;

  function runScan() {
    timer = null;
    lastRun = Date.now();
    try { scan(document); } catch (e) { /* nunca derruba o chat */ }
  }

  function schedule() {
    if (timer) return;
    const wait = Math.max(0, 140 - (Date.now() - lastRun));
    timer = setTimeout(runScan, wait);
  }

  function start() {
    try { scan(document); } catch (e) {}

    try {
      const obs = new MutationObserver(schedule);
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
      window.__artObs = obs; // referência viva: sem isso o observador pode ser coletado
    } catch (e) {}

    // rede de segurança: re-render total da lista, streaming longo e blocos órfãos
    let last = '';
    const loop = () => {
      const host = document.querySelector('.chat-list') || document.body;
      const pres = host.querySelectorAll('pre').length;
      const arts = host.querySelectorAll('.art').length;
      const sig = host.textContent.length + ':' + pres + ':' + arts;
      if (sig !== last || pres > 0) { last = sig; schedule(); }
      setTimeout(loop, 700);
    };
    setTimeout(loop, 700);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.SKYNART = { scan, demoText, build, render: mount, KNOWN };
})();
