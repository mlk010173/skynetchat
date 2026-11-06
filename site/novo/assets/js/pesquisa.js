/* SKYNETchat · pipeline de pesquisa real (sem chave, sem backend)
 * Fontes: DuckDuckGo Lite + Bing (via leitor r.jina.ai, CORS liberado),
 *         Wikipedia API (CORS *), YouTube via API Piped (CORS *).
 * Tudo roda no navegador; se um provedor cair, o próximo assume.
 */
(function () {
  'use strict';

  const CACHE = new Map();
  const TTL = 12 * 60 * 1000;
  const TIMEOUT = 13000;

  const cacheGet = (k) => {
    const e = CACHE.get(k);
    return e && Date.now() - e.t < TTL ? e.v : null;
  };
  const cacheSet = (k, v) => CACHE.set(k, { t: Date.now(), v });

  async function timed(url, ms) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), ms || TIMEOUT);
    try {
      const r = await fetch(url, { signal: ctl.signal, mode: 'cors', credentials: 'omit' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } finally {
      clearTimeout(to);
    }
  }

  const host = (u) => {
    try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  };
  const clean = (s) => String(s || '').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();

  /* ---------------------------------------------------- leitor com CORS */
  async function reader(target) {
    return timed('https://r.jina.ai/' + target, 15000);
  }

  function decodeDDG(u) {
    try {
      const m = u.match(/[?&]uddg=([^&]+)/);
      if (m) return decodeURIComponent(m[1]);
    } catch (e) {}
    return u;
  }

  function decodeBing(u) {
    const m = u.match(/[?&]u=a1([^&]+)/);
    if (!m) return u;
    try {
      let b = m[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      return decodeURIComponent(escape(atob(b)));
    } catch (e) { return u; }
  }

  function parseEntries(md, decode) {
    const out = [];
    const lines = String(md || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*(\d+)\.\s*\[(.+?)\]\((.+?)\)/) || lines[i].match(/^\s*\d+\.\s*##\s*\[(.+?)\]\((.+?)\)/);
      if (!m) continue;
      const title = clean(m[2] || m[1]);
      const url = decode((m[3] || m[2] || '').trim());
      let snippet = '';
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (/^\s*\d+\.\s*(\[|##)/.test(lines[j])) break;
        const t = clean(lines[j]);
        if (t && !t.startsWith('[') && !/^#/.test(t) && t.length > 24) { snippet = t; break; }
      }
      if (!/^https?:\/\//.test(url)) continue;
      if (/duckduckgo\.com\/l\/|bing\.com\/ck\/|r\.jina\.ai/.test(url) && decode === decodeDDG) continue;
      out.push({ title, url, domain: host(url), snippet });
    }
    return out;
  }

  const NEWS_DOMAIN = /(g1\.globo|globo\.com|folha\.uol|uol\.com|estadao|oglobo|bbc\.|cnnbrasil|cnn\.com|reuters|apnews|poder360|Metr[oó]poles|veja\.abril|exame|infoMoney|valor\.globo|tecMundo|olharDigital|canaltech|theverge|techcrunch|arstechnica|wired)/i;

  /* --------------------------------------------------------------- web */
  async function webRaw(q) {
    const consulta = clean(q).slice(0, 140);
    const key = 'web:' + consulta.toLowerCase();
    const hit = cacheGet(key);
    if (hit) return hit;

    let out = [];
    try {
      const md = await reader('https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(consulta));
      out = parseEntries(md, (u) => decodeDDG(u));
    } catch (e) {}

    if (out.filter((s) => s.domain && !/duckduckgo/.test(s.domain)).length < 3) {
      try {
        const md = await reader('https://www.bing.com/search?q=' + encodeURIComponent(consulta));
        const bing = parseEntries(md, (u) => decodeBing(u));
        const seen = new Set(out.map((s) => s.url));
        for (const b of bing) if (!seen.has(b.url) && !/bing\.com/.test(b.domain)) out.push(b);
      } catch (e) {}
    }

    // Wikipedia entra como reforço confiável (CORS direto, sem proxy)
    try {
      const w = await wiki(consulta, 3);
      const seen = new Set(out.map((s) => s.url));
      for (const it of w) if (!seen.has(it.url)) out.push(it);
    } catch (e) {}

    const seen = new Set();
    const limpo = out.filter((s) => (seen.has(s.url) ? false : seen.add(s.url))).slice(0, 10);
    cacheSet(key, limpo);
    return limpo;
  }

  async function wiki(q, limit) {
    const base = 'https://pt.wikipedia.org/w/api.php';
    const u =
      base +
      '?action=query&list=search&format=json&origin=*&srlimit=' +
      (limit || 3) +
      '&srsearch=' +
      encodeURIComponent(clean(q).slice(0, 120));
    const j = JSON.parse(await timed(u, 9000));
    return ((j.query && j.query.search) || []).map((s) => ({
      title: s.title,
      url: 'https://pt.wikipedia.org/wiki/' + encodeURIComponent(s.title.replace(/ /g, '_')),
      domain: 'pt.wikipedia.org',
      snippet: clean(String(s.snippet || '').replace(/<[^>]+>/g, '')),
    }));
  }

  async function resumo(q) {
    const key = 'res:' + clean(q).toLowerCase();
    const hit = cacheGet(key);
    if (hit) return hit;
    try {
      const busca = await wiki(q, 1);
      if (!busca.length) return null;
      const title = busca[0].title;
      const u =
        'https://pt.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=' +
        encodeURIComponent(title);
      const j = JSON.parse(await timed(u, 9000));
      const pages = (j.query && j.query.pages) || {};
      const first = pages[Object.keys(pages)[0]];
      if (!first || !first.extract) return null;
      const out = { titulo: title, texto: clean(first.extract).slice(0, 700), url: busca[0].url };
      cacheSet(key, out);
      return out;
    } catch (e) { return null; }
  }

  /* ----------------------------------------------------------- notícias */
  async function noticias(q) {
    const consulta = clean(q).slice(0, 120);
    const key = 'news:' + consulta.toLowerCase();
    const hit = cacheGet(key);
    if (hit) return hit;

    let out = [];
    const alvos = [
      'https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(consulta) + '&df=d',
      'https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(consulta + ' notícia') + '&df=w',
    ];
    for (const t of alvos) {
      try {
        const md = await reader(t);
        out = out.concat(parseEntries(md, (u) => decodeDDG(u)));
      } catch (e) {}
    }
    if (!out.length) return noticiasFallback(consulta);

    const jornal = out.filter((s) => NEWS_DOMAIN.test(s.domain));
    const escolha = (jornal.length >= 3 ? jornal : out).slice(0, 8);
    const vistos = new Set();
    const final = escolha.filter((s) => (vistos.has(s.url) ? false : vistos.add(s.url)));
    cacheSet(key, final);
    return final;
  }

  // se a busca fresca falhar, monta a lista com veículos que falam do tema
  async function noticiasFallback(consulta) {
    const q = encodeURIComponent(consulta);
    return [
      ['G1', 'g1.globo.com', `https://g1.globo.com/busca/?q=${q}`],
      ['Folha de S.Paulo', 'folha.uol.com.br', `https://search.folha.uol.com.br/search?q=${q}`],
      ['UOL Notícias', 'noticias.uol.com.br', `https://noticias.uol.com.br/busca.htm?query=${q}`],
      ['Estadão', 'estadao.com.br', `https://www.estadao.com.br/busca/?q=${q}`],
      ['Poder360', 'poder360.com.br', `https://www.poder360.com.br/?s=${q}`],
      ['Google Notícias', 'news.google.com', `https://news.google.com/search?q=${q}&hl=pt-BR&gl=BR`],
    ].map(([fonte, domain, url]) => ({
      title: `${consulta} — ${fonte}`,
      url,
      domain,
      snippet: `Últimas publicações sobre “${consulta}” em ${fonte}.`,
      fallback: true,
    }));
  }

  /* ------------------------------------------------------------ YouTube */
  const PIPED = [
    'https://api.piped.private.coffee',
    'https://pipedapi.adminforge.de',
    'https://pipedapi.drgns.space',
    'https://api.piped.yt',
  ];

  const dur = (s) => {
    const n = Number(s || 0);
    if (!n) return '';
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    const r = n % 60;
    return (h ? h + ':' : '') + String(m).padStart(h ? 2 : 1, '0') + ':' + String(r).padStart(2, '0');
  };

  async function videos(q) {
    const consulta = clean(q).replace(/\b(v[ií]deos?|youtube|assistir|canal)\b/gi, '').trim() || clean(q);
    const key = 'yt:' + consulta.toLowerCase();
    const hit = cacheGet(key);
    if (hit) return hit;

    for (const base of PIPED) {
      try {
        const j = JSON.parse(
          await timed(base + '/search?q=' + encodeURIComponent(consulta) + '&filter=videos', 11000)
        );
        const itens = (j.items || [])
          .filter((v) => v.type === 'stream' && v.url)
          .slice(0, 8)
          .map((v) => {
            const id = (v.url.match(/v=([A-Za-z0-9_-]+)/) || [])[1] || '';
            const meta = [v.views ? Number(v.views).toLocaleString('pt-BR') + ' visualizações' : '', v.uploadedDate || v.uploaded || '']
              .filter(Boolean)
              .join(' · ');
            return {
              id,
              titulo: clean(v.title),
              canal: clean(v.uploaderName),
              duracao: dur(v.duration),
              meta,
              thumb: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '',
              url: id ? `https://www.youtube.com/watch?v=${id}` : 'https://www.youtube.com',
            };
          })
          .filter((v) => v.titulo);
        if (itens.length) { cacheSet(key, itens); return itens; }
      } catch (e) {}
    }
    return [];
  }

  /* ----------------------------------------------------------- Instagram */
  async function social(q) {
    const consulta = clean(q)
      .replace(/\b(instagram|insta|reels?|perfis?|perfil|posts?|postagens?|do|da|de|no|na)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim() || clean(q);
    const key = 'ig:' + consulta.toLowerCase();
    const hit = cacheGet(key);
    if (hit) return hit;

    let out = [];
    const alvos = [
      'https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent('site:instagram.com ' + consulta),
      'https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent('instagram ' + consulta + ' perfil'),
    ];
    for (const t of alvos) {
      try {
        const md = await reader(t);
        out = out.concat(parseEntries(md, (u) => decodeDDG(u)));
      } catch (e) {}
    }

    const itens = [];
    const vistos = new Set();
    for (const s of out) {
      const post = s.url.match(/instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]{5,})/);
      const perfil = s.url.match(/instagram\.com\/([A-Za-z0-9._]{2,30})\/?$/);
      if (post) {
        if (vistos.has(post[2])) continue;
        vistos.add(post[2]);
        itens.push({
          tipo: post[1] === 'p' ? 'post' : 'reel',
          code: post[2],
          url: `https://www.instagram.com/${post[1]}/${post[2]}/`,
          usuario: s.title.replace(/^.*?\(@?([\w.]+)\).*$/, '$1'),
          titulo: s.title,
          resumo: s.snippet,
          embed: `https://www.instagram.com/${post[1]}/${post[2]}/embed/captioned/`,
        });
      } else if (perfil && !/^(p|reel|tv|explore|accounts|about|developer|legal)$/.test(perfil[1])) {
        const user = perfil[1];
        if (vistos.has(user)) continue;
        vistos.add(user);
        itens.push({
          tipo: 'perfil',
          usuario: user,
          url: `https://www.instagram.com/${user}/`,
          titulo: s.title,
          resumo: s.snippet,
          embed: `https://www.instagram.com/${user}/embed/`,
        });
      }
      if (itens.length >= 6) break;
    }
    cacheSet(key, itens);
    return itens;
  }

  window.SKYPESQ = { web: webRaw, wiki, resumo, noticias, videos, social };
})();
