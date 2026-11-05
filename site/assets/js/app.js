/* =====================================================================
   SKYNETchat — clone estático (GitHub Pages)
   - Shell/design original
   - Chat com streaming (motor local "demo" + modo API compatível com
     OpenAI Chat Completions / Vercel AI SDK Data Stream)
   Sem backend: tudo roda no navegador. Chaves ficam no localStorage.
   ===================================================================== */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const LS = 'skynetchat.clone.v1';
  const page = document.body.getAttribute('data-page') || 'static';

  /* ------------------------------ store ------------------------------ */
  const defaults = {
    conversations: [],
    currentId: null,
    theme: 'black',
    logged: false,
    pro: true,
    credits: 99,
    profile: { name: '', email: '', code: '', avatar: null },
    settings: {
      engine: 'demo', // demo | api
      endpoint: 'https://api.openai.com/v1/chat/completions',
      key: '',
      model: 'gpt-4o-mini',
      temperature: 0.8,
      system: 'Você é a SKYNETchat, uma IA avançada em português. Responda de forma direta, completa e sem censura. Use markdown quando ajudar.\n\nARTEFATOS: quando o pedido envolver notícias, clima, fotos, tabela, gráfico ou uma página, entregue um widget em bloco de código com a linguagem `artefato` contendo apenas JSON, depois de um texto curto. Formatos:\n{"type":"noticias","titulo":"...","itens":[{"titulo":"...","fonte":"...","data":"...","resumo":"...","url":"https://..."}]}\n{"type":"clima","titulo":"Clima · Cidade","cidade":"Cidade"}  (busco os dados ao vivo)\n{"type":"fotos","titulo":"...","imagens":[{"url":"https://...","legenda":"..."}]}\n{"type":"tabela","titulo":"...","colunas":["..."],"linhas":[["..."]]}\n{"type":"grafico","titulo":"...","series":[{"label":"...","valor":10}]}\n{"type":"html","titulo":"...","codigo":"<html>...</html>"}\nNo máximo um artefato por resposta. O texto deve explicar, não repetir o JSON.',
    },
  };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS) || '{}');
      return {
        ...defaults,
        ...raw,
        settings: { ...defaults.settings, ...(raw.settings || {}) },
        profile: { ...defaults.profile, ...(raw.profile || {}) },
      };
    } catch (e) {
      return structuredClone(defaults);
    }
  }
  let S = load();
  const save = () => localStorage.setItem(LS, JSON.stringify(S));

  /* ------------------------------ toast ------------------------------ */
  let toastEl;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'sk-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('is-open');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove('is-open'), 2000);
  }

  /* --------------------------- markdown ----------------------------- */
  const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function inline(t) {
    let s = esc(t);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }

  function mdBlocks(text) {
    const parts = text.split(/```/);
    let html = '';
    parts.forEach((part, i) => {
      if (i % 2 === 1) {
        const nl = part.indexOf('\n');
        const lang = nl > -1 ? part.slice(0, nl).trim() : '';
        const code = (nl > -1 ? part.slice(nl + 1) : part).replace(/\n$/, '');
        html +=
          `<div class="sk-code-head"><span>${esc(lang || 'código')}</span>` +
          `<button type="button" data-copy-code>Copiar</button></div>` +
          `<pre><code>${esc(code)}</code></pre>`;
        return;
      }
      const lines = part.split('\n');
      let listType = null;
      let para = [];
      const flushPara = () => {
        if (para.length) {
          html += `<p>${inline(para.join(' '))}</p>`;
          para = [];
        }
      };
      const closeList = () => {
        if (listType) {
          html += `</${listType}>`;
          listType = null;
        }
      };
      lines.forEach((raw) => {
        const line = raw.replace(/\s+$/, '');
        if (!line.trim()) {
          flushPara();
          closeList();
          return;
        }
        const h = line.match(/^(#{1,3})\s+(.*)$/);
        if (h) {
          flushPara();
          closeList();
          html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
          return;
        }
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
          flushPara();
          closeList();
          html += '<hr>';
          return;
        }
        const ul = line.match(/^\s*[-*+]\s+(.*)$/);
        const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
        if (ul || ol) {
          flushPara();
          const want = ul ? 'ul' : 'ol';
          if (listType !== want) {
            closeList();
            html += `<${want}>`;
            listType = want;
          }
          html += `<li>${inline((ul ? ul[1] : ol[1]))}</li>`;
          return;
        }
        if (line.startsWith('>')) {
          flushPara();
          closeList();
          html += `<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`;
          return;
        }
        closeList();
        para.push(line.trim());
      });
      flushPara();
      closeList();
    });
    return html;
  }

  /* --------------------------- demo engine -------------------------- */
  const DEMO = {
    greet: [
      `**Seja muito bem-vindo!** 👋\n\nSou a **SKYNETchat**, sua IA em português. Posso:\n\n- **Pesquisar** e resumir informação atualizada\n- **Escrever** textos, e-mails, roteiros e códigos\n- **Analisar** documentos e explicar temas difíceis\n- **Gerar imagens** e ajudar em projetos\n\nO que você quer resolver agora?`,
    ],
    code: [
      `Aqui está um exemplo de função com *streaming* no navegador, do jeito que uso internamente:\n\n\`\`\`javascript\nasync function streamChat(prompt, onDelta) {\n  const res = await fetch('/api/chat', {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json' },\n    body: JSON.stringify({ prompt }),\n  });\n\n  const reader = res.body.getReader();\n  const decoder = new TextDecoder();\n\n  while (true) {\n    const { done, value } = await reader.read();\n    if (done) break;\n    onDelta(decoder.decode(value, { stream: true }));\n  }\n}\n\`\`\`\n\n**Como funciona:**\n\n1. A resposta chega em pedaços (\`chunks\`) via \`ReadableStream\`.\n2. Cada pedaço é decodificado e pintado na tela na hora.\n3. O usuário vê o texto surgindo em tempo real, sem esperar o fim.\n\nQuer que eu adapte isso para React, Svelte ou para o seu backend?`,
    ],
    image: [
      `**Geração de imagens** funciona assim:\n\n- Descreva a cena com **estilo**, **luz** e **enquadramento**.\n- Quanto mais específico, melhor o resultado.\n\n**Exemplo de prompt:**\n\n> retrato cinematográfico de um astronauta em uma estação abandonada, luz vermelha de emergência, poeira suspensa no ar, lente 35mm, alto contraste\n\nMe diga o tema e eu monto o prompt completo para você.`,
    ],
    research: [
      `Vou organizar a pesquisa em três frentes:\n\n**1. O que já se sabe**\nOs pontos consolidados e as fontes mais confiáveis sobre o tema.\n\n**2. O que está em disputa**\nOnde os dados divergem e por quê.\n\n**3. O que fazer com isso**\nA recomendação prática, com os riscos de cada caminho.\n\nMe diga o recorte exato (tema, período, região) e eu aprofundo.`,
    ],
    generic: [
      `Entendi: **{q}**.\n\nVou responder em camadas, do essencial ao detalhe:\n\n**Resumo direto**\nEsse é um tema que rende mais quando você separa o objetivo prático do contexto teórico.\n\n**Pontos principais**\n- **Contexto:** o que está em jogo e por que agora.\n- **Alternativas:** os caminhos possíveis, com custo e retorno de cada um.\n- **Risco:** o que costuma dar errado nesse tipo de decisão.\n\n**Próximo passo**\nSe você me disser o resultado que espera, eu transformo isso em um plano com etapas e prazos.`,
      `Boa pergunta. Sobre **{q}**:\n\n**1.** O ponto central é entender *o que você quer no final* — texto pronto, decisão tomada ou aprendizado.\n\n**2.** Com isso claro, consigo:\n   - levantar os fatos relevantes;\n   - apontar as armadilhas comuns;\n   - entregar a versão final no formato que você precisar.\n\n**3.** Se quiser, já começo pelo rascunho e você ajusta em cima.`,
    ],
  };

  function demoReply(prompt) {
    const p = (prompt || '').toLowerCase();
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    if (/^(oi|ola|olá|bom dia|boa tarde|boa noite|e ai|e aí|hey|teste)\b/.test(p)) return pick(DEMO.greet);
    if (/c[oó]digo|program|javascript|python|api|fun[çc][aã]o|react|svelte|html|css/.test(p)) return pick(DEMO.code);
    if (/imagem|foto|desenh|arte|ilustr/.test(p)) return pick(DEMO.image);
    if (/pesquis|buscar|fonte|not[ií]cia|dado|estat[ií]stica/.test(p)) return pick(DEMO.research);
    const clean = prompt.trim().replace(/\s+/g, ' ').slice(0, 90);
    return pick(DEMO.generic).replace('{q}', clean);
  }


  /* ------------------------ log de pensamento ----------------------- */
  function buildSteps(prompt, mode) {
    const p = (prompt || '').toLowerCase();
    const steps = [];
    steps.push({ label: 'entrada', text: `"${prompt.trim().slice(0, 90)}"` });
    steps.push({ label: 'analisar', text: /c[oó]digo|program|api|fun[çc][aã]o|script/.test(p) ? 'intenção: código / implementação' : /pesquis|fonte|not[ií]cia|quem|quando/.test(p) ? 'intenção: pesquisa factual' : /imagem|foto|arte/.test(p) ? 'intenção: geração visual' : 'intenção: resposta direta' });
    steps.push({ label: 'contexto', text: `histórico: ${Math.max(0, (currentConv()?.messages.length || 1) - 1)} mensagens · idioma: pt-BR` });
    steps.push({ label: 'modo', text: mode === 'Pesquisa' ? 'pesquisa na web + síntese' : mode === 'MAX' ? '4.5 MAX · raciocínio profundo' : '4.5 Rápido · resposta direta' });
    if (mode === 'Pesquisa') steps.push({ label: 'buscar', text: 'consultando índice e cruzando fontes' });
    if (/c[oó]digo|program|api|fun[çc][aã]o|script/.test(p)) steps.push({ label: 'plano', text: 'esboçar snippet mínimo, comentar e testar o fluxo de dados' });
    steps.push({ label: 'compor', text: 'estruturar resposta em markdown' });
    steps.push({ label: 'revisar', text: 'checar coerência, tamanho e tom' });
    return steps;
  }

  function traceEl() {
    const wrap = document.createElement('div');
    wrap.className = 'sk-trace open';
    wrap.innerHTML = `
      <button type="button" class="sk-trace-head" data-trace-toggle>
        <span class="sk-trace-arrow">▾</span>
        <span>Pensamento</span>
        <span class="sk-trace-meta" data-trace-meta>0 passos</span>
        <span class="sk-trace-tag">${S.settings.engine === 'api' ? 'API' : 'demo'}</span>
      </button>
      <div class="sk-trace-body" data-trace-body></div>`;
    wrap.querySelector('[data-trace-toggle]').addEventListener('click', () => {
      wrap.classList.toggle('open');
      wrap.querySelector('.sk-trace-arrow').textContent = wrap.classList.contains('open') ? '▾' : '▸';
    });
    return wrap;
  }

  function traceLine(label, text) {
    const d = document.createElement('div');
    d.className = 'sk-trace-line';
    d.innerHTML = `<span class="sk-dot"></span><b>${esc(label)}</b><span>${esc(text)}</span>`;
    return d;
  }

  function sourcesBlock(prompt) {
    const q = encodeURIComponent(prompt.trim().slice(0, 120));
    const links = [
      ['Busca web', 'https://duckduckgo.com/?q=' + q],
      ['Google', 'https://www.google.com/search?q=' + q],
      ['Notícias', 'https://news.google.com/search?q=' + q + '&hl=pt-BR'],
      ['Wikipédia', 'https://pt.wikipedia.org/w/index.php?search=' + q],
    ];
    return '**Fontes consultadas (abrir para conferir)**\n\n' +
      links.map(([n, u]) => `- [${n}](${u})`).join('\n') +
      '\n\n> A busca acima é executada no seu navegador. Para respostas sintetizadas com fontes ao vivo, ative o modo **API** em *Configurar IA*.';
  }

  /* --------------------------- chat UI ------------------------------ */
  const CHAT_LIST_CLASSES =
    'chat-list space-y-3 overflow-y-auto overflow-x-hidden text-sm no-h-pan min-w-0 max-w-full svelte-76r9u1';
  let listEl = null;

  function ensureList() {
    if (listEl && document.body.contains(listEl)) return listEl;
    listEl = $('.chat-list');
    if (!listEl) {
      const host = $('.app-content') || $('main');
      listEl = document.createElement('ul');
      listEl.className = CHAT_LIST_CLASSES;
      listEl.style.cssText =
        'height:calc(100svh - var(--headerH,44px) - var(--form-space,140px));padding-top:20px;padding-bottom:var(--form-space,140px);overflow-anchor:auto;touch-action:pan-y;contain:content;';
      host.appendChild(listEl);
    }
    return listEl;
  }

  function hideWelcome() {
    const w = $('.welcome-screen');
    if (w) w.style.display = 'none';
  }

  function showWelcome() {
    const w = $('.welcome-screen');
    if (w) w.style.display = '';
  }

  function currentConv() {
    return S.conversations.find((c) => c.id === S.currentId) || null;
  }

  function newConv() {
    const c = { id: 'c' + Date.now().toString(36), title: 'Novo chat', messages: [], updated: Date.now() };
    S.conversations.unshift(c);
    S.currentId = c.id;
    save();
    return c;
  }

  function attachCardsHtml(files) {
    if (!files || !files.length) return '';
    return `<div class="sk-msg-files">${files.map((f) => `
      <div class="sk-msg-file">
        ${f.dataUrl ? `<img src="${f.dataUrl}" alt="${esc(f.name)}">` : `<span class="sk-attach-ico">${esc((f.name.split('.').pop() || 'arq').slice(0, 4).toUpperCase())}</span>`}
        <div class="sk-msg-file-meta"><strong>${esc(f.name)}</strong><small>${humanSize(f.size)}</small></div>
      </div>`).join('')}</div>`;
  }

  function bubbleUser(text, files) {
    const li = document.createElement('li');
    li.setAttribute('data-user-message', 'true');
    li.className = 'user-message-row flex flex-col items-end gap-1 svelte-1onn9rm';
    li.innerHTML = `
      <div class="user-message-width-container flex justify-end w-full">
        <div class="user-message-bubble theme-bg-black theme-text-black max-w-[70%] message-glow-black border theme-border-black break-words whitespace-normal px-4 py-3 text-sm leading-relaxed svelte-1onn9rm">
          <div class="user-message-collapse-root svelte-1onn9rm">
            <div class="user-message-content svelte-1onn9rm"><div class="!m-0 [&_*]:!m-0">${text ? `<p>${esc(text).replace(/\n/g, '<br>')}</p>` : ''}${attachCardsHtml(files)}</div></div>
          </div>
        </div>
      </div>
      <div class="user-message-controls mr-1 svelte-1onn9rm">
        <div role="menu" aria-label="Ações da mensagem" class="user-message-actions flex h-8 items-center gap-1 actions-theme-dark svelte-1onn9rm">
          <button data-act="copy" aria-label="Copiar" class="user-message-action inline-flex items-center justify-center w-8 h-8 rounded-full p-0 text-white/70 hover:text-white hover:bg-white/15 transition-all cursor-pointer svelte-1onn9rm" title="Copiar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
        </div>
      </div>`;
    li.querySelector('[data-act="copy"]').addEventListener('click', () => {
      navigator.clipboard.writeText(text || (files || []).map((f) => f.name).join(', ')).then(() => toast('Copiado'));
    });
    return li;
  }

  function bubbleAssistant() {
    const li = document.createElement('li');
    li.className = 'flex flex-col items-start group relative w-full min-w-0 max-w-full !mt-1 sm:!mt-0 svelte-76r9u1';
    li.innerHTML = `
      <div class="ai-message markdown-v45 pt-1 bg-none rounded-2xl pl-3 pr-4 pb-3 prose prose-base ai-text-black prose-invert prose-p:leading-7 prose-p:mb-4 prose-p:last:mb-0 prose-headings:font-semibold prose-pre:rounded-lg prose-pre:my-4 prose-pre:p-4 svelte-76r9u1" data-ai-body>
        <div data-ai-content></div>
      </div>
      <div class="w-full mt-2 px-1 min-w-0 max-w-full overflow-x-hidden opacity-0 transition-opacity duration-300" data-ai-actions>
        <div class="flex items-center justify-between min-w-0">
          <div class="-ml-1 flex shrink-0 items-center gap-0.5">
            <button aria-label="Compartilhar" data-act="share" class="inline-flex items-center justify-center h-8 rounded-full aspect-[9/8] p-0 text-white/40 hover:text-white/80 hover:bg-white/10 transition-all cursor-pointer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg></button>
            <button aria-label="Ouvir" data-act="speak" class="inline-flex items-center justify-center h-8 rounded-full aspect-[9/8] p-0 text-white/40 hover:text-white/80 hover:bg-white/10 transition-all cursor-pointer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M11 5 6 9H2v6h4l5 4z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M19 5a9 9 0 0 1 0 14"></path></svg></button>
            <button aria-label="Copiar" data-act="copy" class="inline-flex items-center justify-center h-8 rounded-full aspect-[9/8] p-0 text-white/40 hover:text-white/80 hover:bg-white/10 transition-all cursor-pointer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
            <button aria-label="Reescrever" data-act="regen" class="inline-flex items-center justify-center h-8 rounded-full aspect-square p-0 text-white/40 hover:text-white/80 hover:bg-white/10 transition-all cursor-pointer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg></button>
          </div>
          <div class="flex shrink-0 items-center gap-0.5">
            <button aria-label="Útil" data-act="up" class="inline-flex items-center justify-center h-8 rounded-full aspect-[9/8] p-0 text-white/40 hover:text-white/80 hover:bg-white/10 transition-all cursor-pointer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg></button>
            <button aria-label="Não útil" data-act="down" class="inline-flex items-center justify-center h-8 rounded-full aspect-[9/8] p-0 text-white/40 hover:text-white/80 hover:bg-white/10 transition-all cursor-pointer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path></svg></button>
          </div>
        </div>
      </div>`;
    return li;
  }

  function scrollToEnd() {
    if (!listEl) return;
    listEl.scrollTop = listEl.scrollHeight;
  }


  /* --------------------------- anexos ------------------------------- */
  let pendingFiles = [];
  let fileInput = null;

  function humanSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

  function resizeImage(file, max = 360) {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        const fr = new FileReader();
        fr.onload = () => {
          img.onload = () => {
            const c = document.createElement('canvas');
            const sc = Math.min(1, max / Math.max(img.width, img.height));
            c.width = Math.round(img.width * sc);
            c.height = Math.round(img.height * sc);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/jpeg', 0.82));
          };
          img.onerror = () => resolve(null);
          img.src = fr.result;
        };
        fr.onerror = () => resolve(null);
        fr.readAsDataURL(file);
      } catch (e) { resolve(null); }
    });
  }

  async function readAttachments(fileList) {
    const files = Array.from(fileList || []).slice(0, 6);
    for (const f of files) {
      if (f.size > 12 * 1048576) { toast(`${f.name}: maior que 12 MB`); continue; }
      let dataUrl = null;
      if (/^image\//.test(f.type) && f.size <= 4 * 1048576) dataUrl = await resizeImage(f);
      const autoName = !f.name || /^(image|blob|paste|clipboard)[-.\w]*$/i.test(f.name);
      const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '-');
      const fileName = autoName ? `print-${stamp}.png` : f.name;
      pendingFiles.push({ name: fileName, size: f.size, type: f.type || 'arquivo', dataUrl });
    }
    renderAttachChips();
    if (files.length) toast(`${files.length} arquivo(s) anexado(s)`);
  }

  function renderAttachChips() {
    const host = $('[data-attach-chips]');
    if (!host) return;
    host.innerHTML = pendingFiles.length
      ? pendingFiles.map((f, i) => `
        <div class="sk-attach-chip" title="${esc(f.name)}">
          ${f.dataUrl ? `<img src="${f.dataUrl}" alt="">` : `<span class="sk-attach-ico">${esc((f.name.split('.').pop() || 'arq').slice(0, 4).toUpperCase())}</span>`}
          <span class="sk-attach-name">${esc(f.name)}</span>
          <span class="sk-attach-size">${humanSize(f.size)}</span>
          <button type="button" data-rm-file="${i}" aria-label="Remover anexo">✕</button>
        </div>`).join('')
      : '';
    $$('[data-rm-file]', host).forEach((b) =>
      b.addEventListener('click', () => {
        pendingFiles.splice(Number(b.getAttribute('data-rm-file')), 1);
        renderAttachChips();
      })
    );
    document.documentElement.style.setProperty('--attach-h', pendingFiles.length ? '52px' : '0px');
  }

  function initAttachments(form) {
    fileInput = form.querySelector('input[type=file]');
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.multiple = true;
      fileInput.className = 'hidden';
      form.appendChild(fileInput);
    }
    fileInput.setAttribute('multiple', 'multiple');

    const chips = document.createElement('div');
    chips.setAttribute('data-attach-chips', '1');
    chips.className = 'sk-attach-row';
    form.insertBefore(chips, form.firstChild);

    const attachBtn = form.querySelector('[aria-label="Anexar arquivo"]');
    if (attachBtn) attachBtn.addEventListener('click', (e) => { e.preventDefault(); if (window.__skInit) window.__skInit.attach(); });
    fileInput.addEventListener('change', () => { readAttachments(fileInput.files); fileInput.value = ''; });

    // arrastar e soltar / colar imagem
    const zone = form.closest('.app-content') || document.body;
    ['dragover', 'drop'].forEach((ev) =>
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        if (ev === 'drop' && e.dataTransfer?.files?.length) readAttachments(e.dataTransfer.files);
      })
    );
    document.addEventListener('paste', (e) => {
      const items = [...(e.clipboardData?.items || [])];
      const files = items.filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter(Boolean);
      if (files.length) { e.preventDefault(); readAttachments(files); }
    });
    return chips;
  }

  /* ------------------------- generation ----------------------------- */
  let generating = false;
  let abortCtrl = null;

  async function send(text) {
    const prompt = (text || '').trim();
    const files = pendingFiles.slice();
    if ((!prompt && !files.length) || generating) return;
    if (!S.logged) {
      if ((S.guestUsed || 0) >= 3) {
        try { localStorage.setItem('skynet-draft', prompt); } catch (err) {}
        toast('Limite de convidado. Crie sua conta para continuar');
        setTimeout(() => (location.href = 'login.html'), 900);
        return;
      }
      S.guestUsed = (S.guestUsed || 0) + 1;
      save();
      toast('Modo convidado: ' + (3 - S.guestUsed) + ' restante(s)');
    }
    if (S.logged && !S.pro && S.credits <= 0) {
      openPanel('pro');
      return;
    }

    hideWelcome();
    ensureList();
    let conv = currentConv();
    if (!conv) conv = newConv();
    if (conv.title === 'Novo chat') conv.title = (prompt || (files[0] && files[0].name) || 'Arquivos').slice(0, 48);
    conv.messages.push({ role: 'user', content: prompt, files, ts: Date.now() });
    conv.updated = Date.now();
    save();
    pendingFiles = [];
    renderAttachChips();

    const enginePrompt = prompt + (files.length ? `\n\n[anexos: ${files.map((f) => f.name).join(', ')}]` : '');
    listEl.appendChild(bubbleUser(prompt, files));
    scrollToEnd();

    const li = bubbleAssistant();
    listEl.appendChild(li);
    const content = li.querySelector('[data-ai-content]');
    const actions = li.querySelector('[data-ai-actions]');
    const body = li.querySelector('[data-ai-body]');
    content.innerHTML = '<span class="sk-thinking"><i></i><i></i><i></i></span>';

    let mode = ($('.composer-mode-label') || {}).textContent?.trim() || 'Rápido';
    if (mode === 'Rápido' && /^\s*(pesquis|busque|procure|pesquisa)/i.test(prompt)) mode = 'Pesquisa';
    if (mode === 'Rápido' && /\b(max|profund|detalhad)\b/i.test(prompt)) mode = 'MAX';
    const proto = window.SKYN;
    const t0 = performance.now();
    let acc = '';
    const ctrl = proto.trace(li, body, content);
    scrollToEnd();

    generating = true;
    abortCtrl = new AbortController();
    setComposerBusy(true);
    if (!S.pro && S.logged) S.credits = Math.max(0, S.credits - 1);
    renderCredits();

    const onText = (t) => { acc += t; ctrl.text(acc); };
    const onEvent = (ev) => {
      ctrl.event(ev);
      if (ev.type === 'follow-ups') proto.followUps(li, ev.questions, (q) => send(q));
    };

    try {
      if (S.settings.engine === 'api' && S.settings.endpoint) {
        const msgs = conv.messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role, content: m.content + (m.files && m.files.length ? `\n[anexos: ${m.files.map((f) => f.name).join(', ')}]` : '') }));
        await proto.apiStream(msgs, { mode, settings: S.settings, signal: abortCtrl.signal, onText, onEvent, images: files.map((f) => f.dataUrl).filter(Boolean) });
      } else {
        await proto.demoStream(enginePrompt || 'arquivos anexados', mode, {
          onText,
          onEvent,
          files,
          isCancelled: () => !generating,
        });
      }
      if (!acc) throw new Error('Resposta vazia');
    } catch (err) {
      acc += `\n\n> ⚠️ Falha ao falar com a API (${String(err.message || err).slice(0, 160)}).\n> Abra **Configurar IA** e verifique endpoint, modelo e chave. O modo demo continua funcionando.`;
    }

    const convSources = ctrl.sources();
    ctrl.done(acc);
    actions.style.opacity = '1';
    actions.style.pointerEvents = 'auto';
    body.classList.remove('is-streaming');

    // artefatos HTML: baixar / pré-visualizar
    li.querySelectorAll('[data-artifact]').forEach((card) => {
      if (card.dataset.wired) return;
      card.dataset.wired = '1';
      const getCode = () => (acc.match(/```(?:html|htm)\n([\s\S]*?)```/) || [])[1] || '';
      const nameEl = card.querySelector('.font-semibold');
      card.querySelector('[data-artifact-download]').addEventListener('click', () => {
        proto.downloadArtifact(nameEl ? nameEl.textContent : 'pagina', getCode());
      });
      card.querySelector('[data-artifact-open]').addEventListener('click', () => {
        const w = window.open('', '_blank');
        if (w) { w.document.write(getCode()); w.document.close(); }
      });
    });

    conv.messages.push({ role: 'assistant', content: acc, trace: [], sources: convSources, ts: Date.now() });
    conv.updated = Date.now();
    save();
    renderHistory();

    if (convSources.length) {
      const am = conv.messages[conv.messages.length - 1];
      am.sources = true;
      save();
    }

    generating = false;
    abortCtrl = null;
    setComposerBusy(false);
    scrollToEnd();

    // ações
    actions.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      if (act === 'copy') navigator.clipboard.writeText(acc).then(() => toast('Copiado'));
      if (act === 'speak') speak(acc);
      if (act === 'share') {
        if (navigator.share) navigator.share({ title: 'SKYNETchat', text: acc.slice(0, 400) }).catch(() => {});
        else navigator.clipboard.writeText(acc).then(() => toast('Copiado'));
      }
      if (act === 'up' || act === 'down') toast(act === 'up' ? 'Valeu pelo feedback' : 'Anotado, obrigado');
      if (act === 'regen') {
        li.remove();
        const lastUser = [...conv.messages].reverse().find((m) => m.role === 'user');
        if (conv.messages[conv.messages.length - 1]?.role === 'assistant') conv.messages.pop();
        save();
        send(lastUser ? lastUser.content : prompt);
      }
    });
    content.addEventListener('click', (ev) => {
      const c = ev.target.closest('[data-copy-code]');
      if (!c) return;
      const pre = c.closest('.sk-code-head')?.nextElementSibling;
      if (pre) navigator.clipboard.writeText(pre.innerText).then(() => toast('Código copiado'));
    });
  }

  function speak(text) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[*`#>]/g, '').slice(0, 3000));
      u.lang = 'pt-BR';
      speechSynthesis.speak(u);
      toast('Reproduzindo áudio');
    } catch (e) {
      toast('Áudio não suportado neste navegador');
    }
  }

  /* --------------------------- composer ----------------------------- */
  const PLACEHOLDERS = [
    'Pesquise sem censura...',
    'Pergunte o que quiser...',
    'Escreva um e-mail profissional...',
    'Explique um tema difícil...',
    'Gere um prompt de imagem...',
    'Programe uma função...',
  ];

  function initComposer() {
    const form = $$('form').find((f) => f.querySelector('textarea'));
    if (!form) return;
    const ta = form.querySelector('textarea');
    // ao focar, garante que o composer fique visível com o teclado aberto
    ta.addEventListener('focus', () => {
      setTimeout(() => { try { ta.scrollIntoView({ block: 'end', behavior: 'smooth' }); } catch (e) {} }, 280);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        if (document.activeElement === ta) { try { ta.scrollIntoView({ block: 'end' }); } catch (e) {} }
      });
    }
    try {
      const draft = localStorage.getItem('skynet-draft');
      if (draft) { ta.value = draft; localStorage.removeItem('skynet-draft'); }
    } catch (err) {}
    initAttachments(form);
    const sendBtn = form.querySelector('[aria-label="Enviar"], .composer-action, [aria-label="Voz"]');
    const micBtn = form.querySelector('[aria-label="Gravar áudio"]');
    const attachBtn = form.querySelector('[aria-label="Anexar arquivo"]');
    const placeholderEl = form.querySelector('.composer-placeholder');

    const counter = form.querySelector('.composer-counter') || null;

    const grow = () => {
      ta.style.height = 'auto';
      const h = Math.min(180, Math.max(32, ta.scrollHeight));
      ta.style.height = h + 'px';
      ta.style.lineHeight = h > 40 ? '1.5' : '32px';
      if (placeholderEl) placeholderEl.style.opacity = ta.value ? '0' : '0.4';
      document.documentElement.style.setProperty('--form-space', Math.max(60, h + 52) + 'px');
    };
    ta.addEventListener('input', grow);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });
    const submit = () => {
      const v = ta.value;
      if (!v.trim() && !pendingFiles.length) return;
      ta.value = '';
      grow();
      send(v);
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submit();
    });
    if (sendBtn) sendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!ta.value.trim() && !pendingFiles.length) return toast('Escreva, dite ou anexe algo');
      submit();
    });
    if (micBtn) micBtn.addEventListener('click', (e) => { e.preventDefault(); toast('Ditado por voz chega em breve'); });


    // typewriter placeholder
    if (placeholderEl) {
      const textNode = placeholderEl.childNodes[0];
      let pi = 0, ci = 0, del = false;
      setInterval(() => {
        if (ta.value) return;
        const target = PLACEHOLDERS[pi];
        if (!del) {
          ci++;
          if (ci > target.length + 10) { del = true; ci = target.length; }
        } else {
          ci -= 2;
          if (ci <= 0) { del = false; ci = 0; pi = (pi + 1) % PLACEHOLDERS.length; }
        }
        if (textNode) textNode.nodeValue = target.slice(0, Math.max(0, ci));
      }, 85);
    }

    grow();
  }

  function setComposerBusy(busy) {
    const form = $$('form').find((f) => f.querySelector('textarea'));
    const sendBtn = form ? form.querySelector('[aria-label="Enviar"], .composer-action, [aria-label="Voz"]') : null;
    if (sendBtn) {
      sendBtn.classList.toggle('sk-stop', busy);
      sendBtn.style.opacity = busy ? '0.75' : '';
    }
    document.documentElement.style.setProperty('--composer-busy', busy ? '1' : '0');
  }

  /* --------------------------- credits ------------------------------ */
  function renderCredits() {
    const el = $$('span, div').find((e) => /^\s*\d+\/\d+\s*$/.test(e.textContent || '') && e.children.length === 0);
    const safe = Math.max(0, Math.min(5, Number.isFinite(S.credits) ? S.credits : 5));
    if (el) el.textContent = `${safe}/5`;
  }

  /* --------------------------- panels ------------------------------- */
  const PANELS = {};

  function overlay(id) {
    let ov = document.querySelector(`.sk-overlay[data-panel="${id}"]`);
    if (ov) return ov;
    ov = document.createElement('div');
    ov.className = 'sk-overlay';
    ov.setAttribute('data-panel', id);
    ov.innerHTML = `<div class="sk-panel" role="dialog" aria-modal="true">
      <div class="sk-panel-head">
        <div><div class="sk-eyebrow" data-eyebrow></div><h2 data-title></h2></div>
        <button class="sk-close" aria-label="Fechar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="sk-panel-body" data-body></div>
    </div>`;
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.closest('.sk-close')) closePanel(id);
    });
    document.body.appendChild(ov);
    return ov;
  }

  function openPanel(id) {
    const def = PANELS[id];
    if (!def) return;
    const ov = overlay(id);
    $('[data-eyebrow]', ov).textContent = def.eyebrow || 'SKYNETchat';
    $('[data-title]', ov).textContent = def.title || '';
    const body = $('[data-body]', ov);
    body.innerHTML = '';
    def.render(body, ov);
    ov.classList.add('is-open');
  }

  function closePanel(id) {
    const ov = document.querySelector(`.sk-overlay[data-panel="${id}"]`);
    if (ov) ov.classList.remove('is-open');
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $$('.sk-overlay.is-open').forEach((o) => o.classList.remove('is-open'));
  });

  /* ---- painel: atualizações ---- */
  PANELS.updates = {
    eyebrow: 'Atualizações',
    title: 'SKYNETchat 4.5',
    render(body) {
      body.innerHTML = `
        <span class="sk-tag">24 de agosto · Admin</span>
        <h3>Apresentamos a SKYNETchat 4.5</h3>
        <p>Nas últimas semanas, trabalhamos nos pontos que vocês mais cobraram: <strong>contexto</strong>, <strong>imagens</strong>, <strong>pesquisa</strong>, <strong>velocidade</strong> e <strong>código</strong>.</p>
        <p>A 4.5 entende melhor o que veio antes na conversa, lê imagens sem quebrar o contexto, entra no site que você enviou e mostra o código enquanto ele está sendo criado.</p>
        <p>Também simplificamos o chat. Agora existem apenas duas versões:</p>
        <ul>
          <li><strong>⚡ 4.5 Rápida</strong> — completa e veloz, ideal para o dia a dia.</li>
          <li><strong>🧠 4.5 MAX</strong> — raciocínio profundo, respostas longas e código complexo.</li>
        </ul>
        <h3>O que muda na prática</h3>
        <ul>
          <li>Memória de conversa mais longa e coerente.</li>
          <li>Leitura de imagens dentro do contexto do chat.</li>
          <li>Pesquisa na web mais profunda, com mais fontes.</li>
          <li>Streaming mais fluido, com código aparecendo em tempo real.</li>
        </ul>`;
    },
  };

  /* ---- painel: imagens ---- */
  PANELS.images = {
    eyebrow: 'BETA',
    title: 'Imagens',
    render(body) {
      body.innerHTML = `
        <p><strong>Gere e explore imagens com IA.</strong> Descreva a cena, escolha o estilo e receba variações em segundos.</p>
        <div class="sk-field"><label>Prompt</label><textarea rows="3" data-img-prompt placeholder="ex: retrato cinematográfico de um astronauta em uma estação abandonada, luz vermelha, lente 35mm"></textarea></div>
        <div class="sk-field"><label>Estilo</label>
          <select data-img-style>
            <option>Fotorrealista</option><option>Cinematográfico</option><option>Ilustração 3D</option><option>Anime</option><option>Minimalista</option>
          </select>
        </div>
        <button class="sk-btn" data-img-go>Gerar imagem</button>
        <div data-img-out style="margin-top:14px"></div>`;
      $('[data-img-go]', body).addEventListener('click', () => {
        const p = $('[data-img-prompt]', body).value.trim();
        if (!p) return toast('Descreva a imagem');
        $('[data-img-out]', body).innerHTML =
          `<div class="sk-hint">Prompt montado (cole em <strong>Programar → modo imagem</strong> da sua instância com API):</div>
           <pre style="white-space:pre-wrap;background:#101010;border:1px solid var(--sk-line);border-radius:10px;padding:10px;font-size:12px;margin-top:8px">${esc(p)} — estilo ${esc($('[data-img-style]', body).value)}, alta qualidade, iluminação dramática, 4:3</pre>`;
      });
    },
  };

  /* ---- painel: projetos ---- */
  PANELS.projects = {
    eyebrow: 'NOVO',
    title: 'Projetos',
    render(body) {
      body.innerHTML = `
        <p>Organize conversas, arquivos e entregas por projeto.</p>
        <div class="sk-list">
          <div class="sk-item"><div class="sk-item-title"><strong>Como usar o SKYNETchat</strong><br><small>Projeto de exemplo que serve também como guia rápido.</small></div></div>
          <div class="sk-item"><div class="sk-item-title"><strong>Conteúdo e copy</strong><br><small>Roteiros, posts e e-mails.</small></div></div>
          <div class="sk-item"><div class="sk-item-title"><strong>Código e automações</strong><br><small>Scripts, integrações e deploys.</small></div></div>
        </div>
        <button class="sk-btn ghost" style="margin-top:14px" data-new-proj>+ Novo projeto</button>`;
      $('[data-new-proj]', body).addEventListener('click', () => toast('Projetos ficam salvos no seu navegador neste clone'));
    },
  };

  /* ---- painel: histórico ---- */
  PANELS.history = {
    eyebrow: 'CONVERSAS',
    title: 'Histórico',
    render(body) {
      renderHistory(body);
    },
  };

  function renderHistory(body) {
    const host = body || ($('.sk-overlay[data-panel="history"] [data-body]') || null);
    if (!host) return;
    const items = S.conversations.filter((c) => c.messages.length);
    host.innerHTML = `
      <div class="sk-search-row">
        <input type="search" placeholder="Buscar nas conversas..." data-hist-q>
        <button class="sk-btn ghost" data-export title="Exportar JSON">⤓</button>
      </div>
      <div data-hist-list></div>`;
    const list = $('[data-hist-list]', host);
    const paint = (q) => {
      const f = items.filter((c) => !q || (c.title + ' ' + c.messages.map((m) => m.content).join(' ')).toLowerCase().includes(q));
      if (!f.length) { list.innerHTML = '<div class="sk-empty">Nenhuma conversa encontrada.</div>'; return; }
      list.innerHTML = `<div class="sk-list">${f.map((c) => `<div class="sk-item" data-row="${c.id}">
        <button class="sk-item-title" data-open="${c.id}" style="background:none;border:0;color:inherit;text-align:left;cursor:pointer;padding:0;font:inherit">
          <strong>${esc(c.title)}</strong><br><small>${c.messages.length} msgs · ${new Date(c.updated).toLocaleString('pt-BR')}</small>
        </button>
        <button class="sk-close" data-del="${c.id}" title="Apagar" style="width:24px;height:24px">✕</button>
      </div>`).join('')}</div>`;
      $$('[data-open]', list).forEach((b) => b.addEventListener('click', () => { loadConv(b.getAttribute('data-open')); closePanel('history'); }));
      $$('[data-del]', list).forEach((b) => b.addEventListener('click', () => {
        S.conversations = S.conversations.filter((c) => c.id !== b.getAttribute('data-del'));
        save(); renderHistory(host); toast('Conversa apagada');
      }));
    };
    paint('');
    const q = $('[data-hist-q]', host);
    if (q) q.addEventListener('input', () => paint(q.value.toLowerCase().trim()));
    const ex = $('[data-export]', host);
    if (ex) ex.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(S.conversations, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'skynetchat-conversas.json';
      a.click();
      toast('Backup exportado');
    });
  }

  /* ---- painel: prompts ---- */
  PANELS.prompts = {
    eyebrow: 'BIBLIOTECA',
    title: 'Prompts úteis',
    render(body) {
      const prompts = [
        ['Pesquisa profunda', 'Pesquise sobre [tema] e me entregue: fatos confirmados, o que está em disputa e as fontes.'],
        ['Copy que vende', 'Escreva 3 variações de copy para [produto], com tom direto, prova social e CTA.'],
        ['Explicar difícil', 'Explique [tema] para alguém leigo, com uma analogia e um exemplo prático.'],
        ['Revisar código', 'Revise este código, aponte bugs, riscos de segurança e proponha a versão corrigida.'],
        ['Roteiro de vídeo', 'Crie um roteiro de 60s sobre [tema], com gancho nos 3 primeiros segundos.'],
        ['Plano de 7 dias', 'Monte um plano de 7 dias para [objetivo], com tarefas diárias de até 30 minutos.'],
      ];
      body.innerHTML = `<div class="sk-list">${prompts
        .map(
          ([t, p], i) => `<button class="sk-item" data-p="${i}">
            <span class="sk-item-title"><strong>${t}</strong><br><small>${esc(p)}</small></span>
          </button>`
        )
        .join('')}</div>`;
      const demoBtn = document.createElement('button');
      demoBtn.className = 'sk-btn ghost';
      demoBtn.style.marginTop = '12px';
      demoBtn.textContent = 'Ver conversa de exemplo (com log)';
      demoBtn.addEventListener('click', () => {
        closePanel('prompts');
        seedExample();
      });
      body.appendChild(demoBtn);
      $$('[data-p]', body).forEach((b) =>
        b.addEventListener('click', () => {
          const p = prompts[Number(b.getAttribute('data-p'))][1];
          const ta = $('form textarea');
          if (ta) {
            ta.value = p;
            ta.dispatchEvent(new Event('input'));
            ta.focus();
          }
          closePanel('prompts');
        })
      );
    },
  };

  /* ---- painel: suporte ---- */
  PANELS.support = {
    eyebrow: 'ATENDIMENTO',
    title: 'Suporte SKYNETchat',
    render(body) {
      body.innerHTML = `<div data-support-log></div>
        <div class="sk-quick">
          <button data-q="Recuperar minha conta">Recuperar conta</button>
          <button data-q="Como assinar o PRO?">Assinar o PRO</button>
          <button data-q="Minha conta sai sozinha">Sessão caindo</button>
          <button data-q="Formas de pagamento">Pagamento</button>
        </div>`;
      const log = $('[data-support-log]', body);
      const add = (text, me) => {
        const row = document.createElement('div');
        row.className = 'sk-bubble-row';
        row.innerHTML = `<div class="sk-bubble ${me ? 'me' : ''}">${esc(text)}</div>`;
        log.appendChild(row);
        log.scrollTop = log.scrollHeight;
      };
      add('Oi! 👋 Sou o suporte do SKYNETchat. Como posso te ajudar? (conta, planos, pagamento, acesso...)');
      const answers = {
        'Recuperar minha conta': 'Para recuperar o acesso, informe o e-mail usado no cadastro e o código de ativação de 12 dígitos. Se você perdeu o código, abrimos a verificação por e-mail.',
        'Como assinar o PRO?': 'O PRO libera a 4.5 MAX, mais contexto e geração de imagens. Você assina pelo menu da conta, em "Assinar SKYNETchat PRO".',
        'Minha conta sai sozinha': 'Isso normalmente é cookie bloqueado ou aba duplicada. Saia em todas as abas, limpe os cookies do site e entre de novo.',
        'Formas de pagamento': 'Aceitamos cartão de crédito, Pix e boleto. O acesso é liberado assim que o pagamento é confirmado.',
      };
      $$('[data-q]', body).forEach((b) =>
        b.addEventListener('click', () => {
          const q = b.getAttribute('data-q');
          add(q, true);
          setTimeout(() => add(answers[q] || 'Já anotei aqui, um atendente humano continua em seguida.'), 500);
        })
      );
    },
  };

  /* ---- painel: grupos ---- */
  PANELS.groups = {
    eyebrow: 'NOVO',
    title: 'Conversas em grupo',
    render(body) {
      body.innerHTML = `
        <p><strong>Pense junto. Sem censura.</strong> Crie um link, convide sua equipe e alinhe estratégias com a SKYNETchat em tempo real.</p>
        <div class="sk-list">
          <div class="sk-item"><div class="sk-item-title">10 participantes</div></div>
          <div class="sk-item"><div class="sk-item-title">IA em tempo real com @skynet</div></div>
        </div>
        <button class="sk-btn" style="margin-top:14px" data-new-group>Criar sessão colaborativa</button>
        <p class="sk-hint" style="margin-top:10px">Neste clone estático a sessão é simulada: o link é gerado localmente.</p>`;
      $('[data-new-group]', body).addEventListener('click', () => {
        const code = Math.random().toString(36).slice(2, 8).toUpperCase();
        toast('Sessão criada: ' + code);
      });
    },
  };

  /* ---- painel: configuração de IA ---- */
  PANELS.settings = {
    eyebrow: 'CONFIGURAÇÃO',
    title: 'Motor de IA',
    render(body) {
      const s = S.settings;
      body.innerHTML = `
        <p class="sk-hint">Este clone roda 100% no navegador. No modo <strong>demo</strong> as respostas são geradas localmente (streaming simulado). No modo <strong>API</strong> o texto vem de um endpoint real com streaming — OpenAI, Groq, OpenRouter, Anthropic ou qualquer proxy compatível.</p>
        <div class="sk-field"><label>Motor</label>
          <select data-f="engine">
            <option value="demo" ${s.engine === 'demo' ? 'selected' : ''}>Demo (local, sem chave)</option>
            <option value="api" ${s.engine === 'api' ? 'selected' : ''}>API com streaming (chave própria)</option>
          </select>
        </div>
        <div class="sk-field"><label>Endpoint</label><input data-f="endpoint" value="${esc(s.endpoint)}" placeholder="https://api.openai.com/v1/chat/completions"></div>
        <div class="sk-field"><label>Modelo</label><input data-f="model" value="${esc(s.model)}" placeholder="gpt-4o-mini"></div>
        <div class="sk-field"><label>Chave da API</label><input data-f="key" type="password" value="${esc(s.key)}" placeholder="sk-..."></div>
        <div class="sk-field"><label>Prompt de sistema</label><textarea data-f="system" rows="3">${esc(s.system)}</textarea></div>
        <div class="sk-field"><label>Conta</label>
          <select data-f="pro">
            <option value="1" ${S.pro ? 'selected' : ''}>PRO desbloqueado (tudo liberado)</option>
            <option value="0" ${!S.pro ? 'selected' : ''}>Free (5 mensagens)</option>
          </select>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="sk-btn" data-save>Salvar</button>
          <button class="sk-btn ghost" data-reset>Restaurar créditos</button>
        </div>
        <p class="sk-hint" style="margin-top:12px">A chave fica salva só no seu navegador (localStorage). Em produção, coloque um proxy para não expor a chave.</p>`;
      $('[data-save]', body).addEventListener('click', () => {
        S.settings.engine = $('[data-f="engine"]', body).value;
        S.settings.endpoint = $('[data-f="endpoint"]', body).value.trim();
        S.settings.model = $('[data-f="model"]', body).value.trim();
        S.settings.key = $('[data-f="key"]', body).value.trim();
        S.settings.system = $('[data-f="system"]', body).value;
        S.pro = $('[data-f="pro"]', body).value === '1';
        save();
        initProBadge();
        toast('Configuração salva');
      });
      $('[data-reset]', body).addEventListener('click', () => {
        S.credits = 5;
        save();
        renderCredits();
        toast('Créditos restaurados');
      });
    },
  };


  /* ---- painel: perfil (foto / conta) ---- */
  PANELS.profile = {
    eyebrow: 'SUA CONTA',
    title: 'Perfil',
    render(body) {
      const pr = S.profile;
      const initials = (pr.name || 'SK').trim().slice(0, 2).toUpperCase();
      body.innerHTML = `
        <div class="sk-profile-top">
          ${pr.avatar ? `<img class="sk-avatar" src="${pr.avatar}" alt="Foto de perfil">` : `<div class="sk-avatar">${esc(initials)}</div>`}
          <div>
            <div style="font-size:15px;color:#fff;font-weight:600">${esc(pr.name || 'Visitante')}</div>
            <div class="sk-hint">${S.pro ? 'Plano PRO · tudo liberado' : 'Plano Free · 5 mensagens'}</div>
            <div class="sk-quick" style="margin-top:8px">
              <button type="button" data-pick-photo>${pr.avatar ? 'Trocar foto' : 'Enviar foto'}</button>
              ${pr.avatar ? '<button type="button" data-rm-photo>Remover</button>' : ''}
            </div>
          </div>
        </div>
        <input type="file" accept="image/*" data-photo-input style="display:none">
        <div class="sk-field"><label>Nome</label><input data-p="name" value="${esc(pr.name)}" placeholder="Como quer ser chamado"></div>
        <div class="sk-field"><label>E-mail</label><input data-p="email" type="email" value="${esc(pr.email)}" placeholder="voce@email.com"></div>
        <div class="sk-field"><label>Código de acesso</label><input data-p="code" value="${esc(pr.code)}" placeholder="0000-0000-0000"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="sk-btn" data-save-profile>Salvar perfil</button>
          <button class="sk-btn ghost" data-account>Configurar IA</button>
          <button class="sk-btn ghost" data-logout>Sair da conta</button>
        </div>
        <p class="sk-hint" style="margin-top:12px">A foto fica salva só neste navegador (localStorage), redimensionada para 300px.</p>`;

      const fileEl = $('[data-photo-input]', body);
      const pick = $('[data-pick-photo]', body);
      if (pick) pick.addEventListener('click', () => fileEl.click());
      fileEl.addEventListener('change', async () => {
        const f = fileEl.files && fileEl.files[0];
        if (!f) return;
        if (!/^image\//.test(f.type)) return toast('Escolha uma imagem');
        const data = await resizeImage(f, 300);
        if (!data) return toast('Não consegui ler a imagem');
        S.profile.avatar = data;
        save();
        renderHeaderAvatar();
        openPanel('account');
        toast('Foto atualizada');
      });
      const rm = $('[data-rm-photo]', body);
      if (rm) rm.addEventListener('click', () => {
        S.profile.avatar = null; save(); renderHeaderAvatar(); openPanel('account'); toast('Foto removida');
      });
      $('[data-save-profile]', body).addEventListener('click', () => {
        S.profile.name = $('[data-p="name"]', body).value.trim();
        S.profile.email = $('[data-p="email"]', body).value.trim();
        S.profile.code = $('[data-p="code"]', body).value.trim();
        save();
        renderHeaderAvatar();
        toast('Perfil salvo');
        openPanel('account');
      });
      $('[data-account]', body).addEventListener('click', () => openPanel('settings'));
      $('[data-logout]', body).addEventListener('click', () => logout());
    },
  };

  /* ---- painel: PRO ---- */
  PANELS.pro = {
    eyebrow: 'DISPONÍVEL AGORA',
    title: '4.5 MAX já está disponível',
    render(body) {
      body.innerHTML = `
        <p>A versão mais avançada da SKYNETchat é exclusiva para usuários <strong>PRO</strong>.</p>
        <ul>
          <li>Pesquisa mais profunda e análises mais completas</li>
          <li>Mais capacidade para respostas extensas e código</li>
          <li>Acesso aos recursos avançados da 4.5 MAX</li>
        </ul>
        <button class="sk-btn" data-pro>Conhecer o PRO</button>`;
      $('[data-pro]', body).addEventListener('click', () => {
        S.credits = 5;
        save();
        renderCredits();
        closePanel('pro');
        toast('Créditos de demonstração renovados');
      });
    },
  };

  /* ---- painel: tema ---- */
  PANELS.theme = {
    eyebrow: 'APARÊNCIA',
    title: 'Tema de fundo',
    render(body) {
      const themes = [
        ['black', 'BLACK', '#000000', '#ec1313'],
        ['carmim', 'CARMIM', '#0d0505', '#ff2d55'],
        ['grafite', 'GRAFITE', '#0b0d10', '#22d3ee'],
        ['verde', 'MATRIX', '#030a06', '#00ff41'],
      ];
      body.innerHTML = `<div class="sk-list">${themes
        .map(
          ([id, name, bg, ac]) => `<button class="sk-item" data-theme="${id}">
            <span style="width:16px;height:16px;border-radius:5px;background:${bg};border:1px solid ${ac}"></span>
            <span class="sk-item-title">${name}</span>${S.theme === id ? '<small>ativo</small>' : ''}
          </button>`
        )
        .join('')}</div>`;
      $$('[data-theme]', body).forEach((b) =>
        b.addEventListener('click', () => {
          applyTheme(b.getAttribute('data-theme'));
          closePanel('theme');
        })
      );
    },
  };

  function applyTheme(id) {
    S.theme = id;
    save();
    const map = {
      black: ['#ec1313', '#000000'],
      carmim: ['#ff2d55', '#0d0505'],
      grafite: ['#22d3ee', '#0b0d10'],
      verde: ['#00ff41', '#030a06'],
    };
    const [ac, bg] = map[id] || map.black;
    document.documentElement.style.setProperty('--sk-accent', ac);
    document.body.style.background = bg;
    document.documentElement.style.background = bg;
    toast('Tema ' + id.toUpperCase());
  }


  /* ---- painéis de conta (login / criar / recuperar) ---- */
  PANELS.create = {
    eyebrow: 'NOVA CONTA',
    title: 'Criar conta',
    render(body) {
      body.innerHTML = `
        <p class="sk-hint">O acesso da SKYNETchat é por código de 12 dígitos. Criamos um código novo para você agora.</p>
        <div class="sk-field"><label>Nome</label><input data-c="name" placeholder="Seu nome"></div>
        <div class="sk-field"><label>E-mail</label><input data-c="email" type="email" placeholder="voce@email.com"></div>
        <button class="sk-btn" data-create>Gerar código e entrar</button>`;
      $('[data-create]', body).addEventListener('click', () => {
        const name = $('[data-c="name"]', body).value.trim();
        const email = $('[data-c="email"]', body).value.trim();
        if (name.length < 2) return toast('Digite seu nome');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('E-mail inválido');
        const digits = String(Math.floor(100000000000 + Math.random() * 899999999999));
        S.profile = { ...S.profile, name, email, code: digits.replace(/(\d{4})(\d{4})(\d{4})/, '$1-$2-$3') };
        S.logged = true;
        S.credits = 5;
        save();
        toast('Conta criada! Código: ' + S.profile.code);
        setTimeout(() => (location.href = 'index.html'), 900);
      });
    },
  };

  PANELS.recover = {
    eyebrow: 'RECUPERAR',
    title: 'Recuperar acesso',
    render(body) {
      body.innerHTML = `
        <p class="sk-hint">Informe o e-mail da conta. Enviamos um código de ativação de 12 dígitos.</p>
        <div class="sk-field"><label>E-mail</label><input data-r="email" type="email" placeholder="voce@email.com"></div>
        <button class="sk-btn" data-send>Enviar código</button>
        <div data-r-out style="margin-top:14px"></div>`;
      $('[data-send]', body).addEventListener('click', () => {
        const email = $('[data-r="email"]', body).value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('E-mail inválido');
        const digits = String(Math.floor(100000000000 + Math.random() * 899999999999));
        const code = digits.replace(/(\d{4})(\d{4})(\d{4})/, '$1-$2-$3');
        $('[data-r-out]', body).innerHTML = `
          <div class="sk-item" style="flex-direction:column;align-items:flex-start;gap:4px">
            <small>Código enviado para ${esc(email)}</small>
            <strong style="font-size:16px;letter-spacing:.12em;color:#fff">${code}</strong>
            <small>Ambiente de demonstração: o código aparece aqui, sem envio real de e-mail.</small>
          </div>`;
        const btn = document.createElement('button');
        btn.className = 'sk-btn';
        btn.style.marginTop = '12px';
        btn.textContent = 'Entrar com este código';
        btn.addEventListener('click', () => {
          S.profile = { ...S.profile, email, code };
          S.logged = true;
          save();
          location.href = 'index.html';
        });
        $('[data-r-out]', body).appendChild(btn);
      });
    },
  };

  /* ---------------------------- drawer ------------------------------ */
  const MENU = {
    'Novo chat': () => startNewChat(),
    'Indique e Ganhe': () => (location.href = 'indicar.html'),
    'Monetize com SKYNETchat': () => (location.href = 'monetizar.html'),
    Atualizações: () => openPanel('updates'),
    Imagens: () => openPanel('images'),
    'Conversas em grupo': () => openPanel('groups'),
    Codex: () => toast('Codex chega em breve'),
    Projetos: () => openPanel('projects'),
    'Histórico de conversas': () => openPanel('history'),
    'Conheça o SKYNETchat': () => (location.href = 'sobre.html'),
    Prompts: () => openPanel('prompts'),
    Suporte: () => (window.__openSupport ? window.__openSupport() : openPanel('support')),
    'Tema de fundo': () => openPanel('theme'),
    'Termos de Serviço': () => (location.href = 'termos.html'),
    'Sair da conta': () => logout(),
    'Fazer login': () => (location.href = 'login.html'),
  };

  function wireDrawer() {
    // delegação: qualquer elemento do menu (button, a, div) casa pelo texto
    const nav = $('aside .drawer-nav') || $('aside');
    if (nav) {
      nav.addEventListener('click', (e) => {
        let el = e.target;
        while (el && el !== nav) {
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
          const hit = t.length < 90 ? Object.keys(MENU).find((k) => t.startsWith(k)) : null;
          if (hit) {
            e.preventDefault();
            e.stopPropagation();
            closeDrawer();
            try { MENU[hit](); } catch (err) { console.warn('[SKYNET] menu', hit, err); }
            return;
          }
          el = el.parentElement;
        }
      });
    }

    // gatilhos do drawer (button ou div com role)
    $$('[aria-label="Abrir menu"], [aria-label="Abrir painel lateral"]').forEach((el) => {
      el.addEventListener('click', (e) => { e.preventDefault(); openDrawer(); });
    });

    // header: modo e tema
    $$('header button').forEach((b) => {
      const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
      const al = b.getAttribute('aria-label') || '';
      if (/^SKYNETchat\s*4\.5/i.test(t)) {
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (window.__skInit) window.__skInit.tools();
        });
      }
      if (!t && !al && /lua|moon|tema/i.test(b.className || '') ) {
        b.addEventListener('click', () => toggleTema());
      }
    });
    // botão sem rótulo do header (ícone de tema): alterna claro/escuro
    const headBtns = $$('header button').filter((b) => !(b.textContent || '').trim() && !b.getAttribute('aria-label'));
    headBtns.forEach((b) => {
      if (b.dataset.temaWired) return;
      b.dataset.temaWired = '1';
      b.addEventListener('click', (e) => { e.preventDefault(); toggleTema(); });
    });

    // header / strip / global buttons
    $$('button').forEach((b) => {
      const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
      const al = b.getAttribute('aria-label') || '';
      if (/Abrir menu|Abrir painel lateral/i.test(al)) {
        b.addEventListener('click', (e) => { e.preventDefault(); openDrawer(); });
      }
      if (/^Novo chat$/i.test(t) || /Nova conversa|Limpar conversa/i.test(al)) {
        b.addEventListener('click', (e) => { e.preventDefault(); startNewChat(); });
      }
      if (/Fazer login/i.test(al) || /^Fazer login$/i.test(t)) {
        b.addEventListener('click', (e) => { e.preventDefault(); location.href = 'login.html'; });
      }
      if (b.title === 'Modo Dark') {
        b.addEventListener('click', (e) => { e.preventDefault(); applyTheme(S.theme === 'black' ? 'carmim' : 'black'); });
      }
    });

    // fechar pelo overlay do menu
    $$('.fixed.inset-0.no-h-pan.overlay').forEach((ov) => {
      ov.addEventListener('click', () => closeDrawer());
    });

    // versão (4.5) -> abre configuração
    const version = $('.version-selector');
    if (version) version.addEventListener('click', (e) => { e.preventDefault(); openPanel('settings'); });

    // logo do topo do drawer -> início
    const logo = $('aside .logo-btn') || $('.logo-btn');
    if (logo) logo.addEventListener('click', () => { closeDrawer(); startNewChat(); });
  }

  function openDrawer() {
    const aside = $('aside.drawer-panel') || $('aside');
    const ovl = $$('.fixed.inset-0.no-h-pan.overlay').find((o) => o.getAttribute('aria-label') === 'Fechar menu')
      || $$('.fixed.inset-0.no-h-pan.overlay')[0];
    if (aside) {
      aside.style.transform = 'translateX(0)';
      aside.style.pointerEvents = 'auto';
    }
    if (ovl) {
      ovl.style.opacity = '1';
      ovl.style.pointerEvents = 'auto';
      ovl.style.background = 'linear-gradient(90deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.35) 60%, rgba(0,0,0,.2) 100%)';
    }
    document.body.classList.add('sk-drawer-open');
  }

  function closeDrawer() {
    const aside = $('aside.drawer-panel') || $('aside');
    const ovl = $$('.fixed.inset-0.no-h-pan.overlay')[0];
    if (aside) {
      aside.style.transform = 'translateX(-100%)';
      aside.style.pointerEvents = 'none';
    }
    if (ovl) {
      ovl.style.opacity = '0';
      ovl.style.pointerEvents = 'none';
    }
    document.body.classList.remove('sk-drawer-open');
  }

  function startNewChat() {
    newConv();
    if (listEl) listEl.innerHTML = '';
    showWelcome();
    toast('Novo chat');
    renderHistory();
  }

  function loadConv(id) {
    S.currentId = id;
    save();
    const c = currentConv();
    if (!c) return;
    hideWelcome();
    ensureList();
    listEl.innerHTML = '';
    c.messages.forEach((m) => {
      if (m.role === 'user') listEl.appendChild(bubbleUser(m.content, m.files));
      else {
        const li = bubbleAssistant();
        if (m.trace && m.trace.length) {
          const tr = traceEl();
          tr.classList.remove('open');
          tr.querySelector('.sk-trace-arrow').textContent = '▸';
          const tb = tr.querySelector('[data-trace-body]');
          m.trace.forEach((st) => tb.appendChild(traceLine(st.label, st.text)));
          tr.querySelector('[data-trace-meta]').textContent = `${m.trace.length} passos`;
          li.insertBefore(tr, li.firstChild);
        }
        li.querySelector('[data-ai-content]').innerHTML = mdBlocks(m.content);
        const a = li.querySelector('[data-ai-actions]');
        a.style.opacity = '1';
        a.style.pointerEvents = 'auto';
        listEl.appendChild(li);
      }
    });
    scrollToEnd();
  }

  function logout() {
    S.logged = false;
    save();
    location.href = 'login.html';
  }

  /* --------------------------- login page --------------------------- */
  function initLogin() {
    const input = $('input[type="tel"]') || $('form input');
    const form = $('form');
    const submit = form ? form.querySelector('button[type="submit"], button:not([type])') : null;
    const tt = $('.cf-turnstile, [data-turnstile], iframe[src*="challenges.cloudflare"]');

    // mock do widget Cloudflare Turnstile
    if (tt) {
      const wrap = tt.closest('div') || tt;
      const mock = document.createElement('div');
      mock.className = 'sk-turnstile-mock';
      mock.innerHTML = `<div class="sk-tt-left"><span class="sk-tt-check">✓</span> Success!</div><div class="sk-tt-brand">Cloudflare<br>Privacy · Help</div>`;
      wrap.replaceWith(mock);
    }

    if (input) {
      input.addEventListener('input', () => {
        const digits = input.value.replace(/\D/g, '').slice(0, 12);
        const parts = [digits.slice(0, 4), digits.slice(4, 8), digits.slice(8, 12)].filter(Boolean);
        input.value = parts.join('-');
        const counter = $$('span,div').find((e) => /^\d+\/12$/.test((e.textContent || '').trim()) && e.children.length === 0);
        if (counter) counter.textContent = `${digits.length}/12`;
        const status = $$('span,div,p').find((e) => /Pronto para entrar|Digite os 12/i.test(e.textContent || '') && e.children.length === 0);
        if (status) status.textContent = digits.length === 12 ? 'Pronto para entrar' : 'Digite os 12 dígitos';
        if (submit) submit.disabled = digits.length !== 12;
      });
      input.dispatchEvent(new Event('input'));
    }

    const doLogin = (e) => {
      e.preventDefault();
      const digits = (input ? input.value : '').replace(/\D/g, '');
      if (digits.length !== 12) return toast('Digite os 12 dígitos do código');
      S.logged = true;
      S.credits = 5;
      S.profile = { ...S.profile, code: digits.replace(/(\d{4})(\d{4})(\d{4})/, '$1-$2-$3') };
      save();
      const btn = submit;
      if (btn) { btn.disabled = true; btn.textContent = 'ENTRANDO...'; }
      setTimeout(() => (location.href = 'index.html'), 700);
    };
    if (form) form.addEventListener('submit', doLogin);
    if (submit) submit.addEventListener('click', doLogin);

    // "CRIAR CONTA" e "RECUPERAR ACESSO"
    const clickable = $$('a, button, span, p, div');
    const byText = (re) => clickable.find((el) => el.children.length === 0 && re.test((el.textContent || '').trim()));
    const createEl = byText(/^criar conta$/i);
    const recoverEl = byText(/^recuperar acesso$/i);
    if (createEl) {
      createEl.style.cursor = 'pointer';
      createEl.style.display = 'inline-flex';
      createEl.style.alignItems = 'center';
      createEl.style.minHeight = '32px';
      createEl.style.padding = '2px 4px';
      createEl.addEventListener('click', (e) => { e.preventDefault(); openPanel('create'); });
    }
    if (recoverEl) {
      recoverEl.style.cursor = 'pointer';
      recoverEl.style.display = 'inline-flex';
      recoverEl.style.alignItems = 'center';
      recoverEl.style.minHeight = '32px';
      recoverEl.style.padding = '2px 4px';
      recoverEl.addEventListener('click', (e) => { e.preventDefault(); openPanel('recover'); });
    }
  }



  /* ------------------- conversa de exemplo (demo) -------------------- */
  function seedExample() {
    const c = newConv();
    c.title = 'Exemplo · pesquisa + streaming';
    const q = 'Como funciona o streaming de IA e por que ele deixa a resposta mais rápida?';
    c.messages.push({ role: 'user', content: q, ts: Date.now() });
    c.messages.push({
      role: 'assistant',
      trace: buildSteps(q, 'Pesquisa'),
      content: `**Resposta curta:** o modelo não espera terminar para responder. Ele gera *pedaços* (tokens) e cada pedaço é enviado para o navegador assim que existe.\n\n**O caminho completo**\n\n1. O prompt vai para o servidor (ou direto para a API do modelo).\n2. O modelo produz tokens em sequência.\n3. O servidor repassa cada token por uma conexão aberta — SSE ou *stream* binário.\n4. O navegador lê com \`ReadableStream\` e pinta na tela.\n\n\`\`\`javascript\nconst res = await fetch('/api/chat', { method: 'POST', body });\nconst reader = res.body.getReader();\nwhile (true) {\n  const { done, value } = await reader.read();\n  if (done) break;\n  render(new TextDecoder().decode(value));\n}\n\`\`\`\n\n**Por que parece mais rápido**\n\n- O tempo total é o mesmo, mas a **primeira palavra** chega em milissegundos.\n- Você começa a ler antes do fim, então a espera percebida cai.\n\n---\n\n${sourcesBlock(q)}`,
      ts: Date.now() + 1,
    });
    save();
    loadConv(c.id);
    renderHistory();
    toast('Conversa de exemplo carregada');
  }

  /* ----------------------- ditado por voz ---------------------------- */
  function initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    $$('[aria-label="Gravar áudio"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!SR) return toast('Ditado por voz não suportado neste navegador');
        const ta = $('form textarea');
        if (!ta) return;
        const rec = new SR();
        rec.lang = 'pt-BR';
        rec.interimResults = true;
        rec.continuous = false;
        const base = ta.value;
        btn.style.color = 'var(--sk-accent)';
        rec.onresult = (ev) => {
          let txt = '';
          for (let i = ev.resultIndex; i < ev.results.length; i++) txt += ev.results[i][0].transcript;
          ta.value = (base ? base + ' ' : '') + txt;
          ta.dispatchEvent(new Event('input'));
        };
        rec.onerror = () => toast('Não consegui ouvir. Tente novamente.');
        rec.onend = () => { btn.style.color = ''; };
        try { rec.start(); toast('Ouvindo...'); } catch (err) { btn.style.color = ''; }
      });
    });
  }

  /* ------------------------- badge PRO ------------------------------- */
  function initProBadge() {
    const version = $('.version-selector');
    if (!version || !S.pro) return;
    if (version.querySelector('.sk-badge-pro')) return;
    const badge = document.createElement('span');
    badge.className = 'sk-badge-pro';
    badge.textContent = 'PRO';
    badge.title = 'Recursos PRO desbloqueados neste clone';
    version.appendChild(badge);
  }

  /* --------------- widget de suporte embutido ------------------------ */
  function initSupportWidget() {
    const w = $('.support-widget');
    if (!w) return;
    w.classList.remove('sk-open');
    const toggle = (force) => {
      const isOpen = w.classList.contains('sk-open');
      const open = force === undefined ? !isOpen : force;
      w.classList.toggle('sk-open', open);
      if (open) closeDrawer();
    };
    $$('[aria-label="Suporte SKYNETchat"]').forEach((b) =>
      b.addEventListener('click', (e) => { e.preventDefault(); toggle(); })
    );
    const closer = w.querySelector('[aria-label="Fechar suporte"]');
    if (closer) closer.addEventListener('click', (e) => { e.preventDefault(); toggle(false); });
    window.__openSupport = () => toggle(true);
  }

  /* --------------- partículas de fundo (substitui particles.js) ------- */
  function initParticles() {
    const host = document.getElementById('particles-js');
    if (!host || host.querySelector('canvas')) return;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, dots = [];
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    function resize() {
      w = host.clientWidth; h = host.clientHeight;
      canvas.width = w * DPR; canvas.height = h * DPR;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const n = Math.round(Math.min(90, (w * h) / 22000));
      dots = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.6 + 0.5, a: Math.random() * 0.5 + 0.15,
      }));
    }
    function accent() {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--sk-accent').trim();
      return v || '#ec1313';
    }
    function frame() {
      ctx.clearRect(0, 0, w, h);
      const color = accent();
      for (const d of dots) {
        d.x += d.vx; d.y += d.vy;
        if (d.x < -10) d.x = w + 10; if (d.x > w + 10) d.x = -10;
        if (d.y < -10) d.y = h + 10; if (d.y > h + 10) d.y = -10;
        ctx.beginPath();
        ctx.globalAlpha = d.a * 0.55;
        ctx.fillStyle = color;
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.09;
      ctx.strokeStyle = accent();
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const a = dots[i], b = dots[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < 15000) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(frame);
    }
    resize();
    window.addEventListener('resize', resize);
    frame();
  }

  /* --------------------------- boot -------------------------------- */
  function renderHeaderAvatar() {
    const btn = $$('button').find((b) => /Sua conta|Fazer login/i.test(b.getAttribute('aria-label') || ''));
    if (!btn) return;
    if (S.profile.avatar) {
      btn.innerHTML = `<img class="sk-avatar-sm" src="${S.profile.avatar}" alt="Conta">`;
    } else if (S.profile.name) {
      btn.innerHTML = esc(S.profile.name.split(' ')[0]);
    }
  }

  function renderLoggedState() {
    renderHeaderAvatar();
    if (!S.logged) return;
    $$('button').forEach((b) => {
      const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^Fazer login$/i.test(t) || /Fazer login/i.test(b.getAttribute('aria-label') || '')) {
        b.innerHTML = b.innerHTML.replace(/Fazer login/i, 'Você');
        b.setAttribute('aria-label', 'Sua conta');
        b.addEventListener('click', (e) => {
          e.preventDefault();
          openPanel('account');
        });
      }
    });
    if ($('[aria-label="Abrir painel lateral"]')) {
      const nav = $('.drawer-nav');
      if (nav && !$('[data-extras]', nav)) {
        const extra = document.createElement('div');
        extra.setAttribute('data-extras', '1');
        extra.className = 'space-y-[2px] pt-2';
        extra.innerHTML = `
          <button class="flex items-center gap-3 w-full px-2.5 py-2 rounded-xl text-left" style="background:transparent;color:#eee">
            <span style="font-size:16px">⚙️</span><span class="text-[13px]">Configurar IA</span>
          </button>
          <button class="flex items-center gap-3 w-full px-2.5 py-2 rounded-xl text-left" style="background:transparent;color:#eee">
            <span style="font-size:16px">🕘</span><span class="text-[13px]">Histórico</span>
          </button>
          <button class="flex items-center gap-3 w-full px-2.5 py-2 rounded-xl text-left" style="background:transparent;color:#eee">
            <span style="font-size:16px">👤</span><span class="text-[13px]">Perfil e foto</span>
          </button>`;
        nav.appendChild(extra);
        extra.children[0].addEventListener('click', () => { closeDrawer(); openPanel('settings'); });
        extra.children[1].addEventListener('click', () => { closeDrawer(); openPanel('history'); });
        extra.children[2].addEventListener('click', () => { closeDrawer(); openPanel('account'); });
      }
    }
  }

  function initApp() {
    // sanitiza créditos salvos
    if (!Number.isFinite(S.credits) || S.credits < 0 || S.credits > 5) { S.credits = 5; save(); }
    [
      ['composer', initComposer],
      ['particles', initParticles],
      ['support', initSupportWidget],
      ['voice', initVoice],
      ['pro', initProBadge],
      ['limit', () => window.__skInit && window.__skInit.limit()],
      ['theme-item', () => window.__skInit && window.__skInit.theme()],
    ].forEach(([name, fn]) => {
      try { fn(); } catch (err) { console.warn('[SKYNET] init ' + name + ' falhou:', err); }
    });
    wireDrawer();
    renderLoggedState();
    renderCredits();
    applyThemeOnly();
    ensureList();
    if (S.conversations.length && S.conversations.some((c) => c.messages.length)) {
      loadConv(S.currentId || S.conversations[0].id);
    }
    // chips de sugestão preenchem o composer
    $$('.chip-btn').forEach((chip) => {
      chip.addEventListener('click', () => {
        const label = (chip.textContent || '').replace(/\s+/g, ' ').trim();
        const ta = $('form textarea');
        if (!ta) return;
        ta.value = label;
        ta.dispatchEvent(new Event('input'));
        ta.focus();
      });
    });
    // modo (Rápido / MAX)
    const modeBtn = $('.composer-mode');
    if (modeBtn) {
      const MODES = ['Rápido', 'MAX', 'Pesquisa'];
      modeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const label = $('.composer-mode-label', modeBtn);
        if (!label) return;
        const i = MODES.indexOf(label.textContent.trim());
        const next = MODES[(i + 1) % MODES.length];
        label.textContent = next;
        modeBtn.dataset.mode = next;
        toast(next === 'MAX' ? '4.5 MAX desbloqueado' : 'Modo ' + next);
      });
      modeBtn.dataset.mode = 'Rápido';

      // chip de modo no mobile
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'sk-mode-mobile';
      const sync = () => {
        const lb = $('.composer-mode-label', modeBtn);
        const cur = lb ? lb.textContent.trim() : 'Rápido';
        chip.innerHTML = '<b>◆</b> ' + esc(cur);
        chip.setAttribute('aria-label', 'Modo de IA: ' + cur);
      };
      chip.addEventListener('click', (e) => { e.preventDefault(); modeBtn.click(); sync(); });
      sync();
      document.body.appendChild(chip);
    }
  }


  function toggleTema() {
    const claro = document.body.classList.contains('theme-white');
    S.theme = claro ? 'black' : 'white';
    document.body.classList.remove('theme-white', 'theme-black');
    document.body.classList.add(claro ? 'theme-black' : 'theme-white');
    document.body.style.setProperty('background', claro ? '#000000' : '#ffffff', 'important');
    document.documentElement.style.setProperty('background', claro ? '#000000' : '#ffffff', 'important');
    document.body.style.colorScheme = claro ? 'dark' : 'light';
    try { localStorage.setItem('skynet-theme-bg', claro ? 'black' : 'white'); } catch (e) {}
    save();
    applyThemeOnly();
    toast(claro ? 'Modo escuro' : 'Modo claro');
  }

  function applyThemeOnly() {
    const map = {
      black: ['#ec1313', '#000000'],
      carmim: ['#ff2d55', '#0d0505'],
      grafite: ['#22d3ee', '#0b0d10'],
      verde: ['#00ff41', '#030a06'],
    };
    const [ac, bg] = map[S.theme] || map.black;
    document.documentElement.style.setProperty('--sk-accent', ac);
    if (S.theme !== 'black') {
      document.body.style.background = bg;
      document.documentElement.style.background = bg;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
  
  /* ===================== UI avançada (sheet, ferramentas, fontes, conta) ===================== */

  function skSheet(title, inner, opts) {
    const root = document.createElement('div');
    root.className = 'sk-sheet-root';
    root.innerHTML =
      '<div class="sk-sheet-backdrop"></div>' +
      '<div class="sk-sheet' + (opts && opts.wide ? ' sk-sheet-wide' : '') + '" role="dialog" aria-label="' + esc(title) + '">' +
      (title ? '<div class="sk-sheet-head"><strong>' + esc(title) + '</strong><button class="sk-sheet-x" aria-label="Fechar">✕</button></div>' : '') +
      '<div class="sk-sheet-body">' + inner + '</div></div>';
    const close = () => { root.classList.remove('is-open'); setTimeout(() => root.remove(), 200); };
    root.querySelector('.sk-sheet-backdrop').addEventListener('click', close);
    const x = root.querySelector('.sk-sheet-x');
    if (x) x.addEventListener('click', close);
    document.body.appendChild(root);
    requestAnimationFrame(() => root.classList.add('is-open'));
    return { root, close, body: root.querySelector('.sk-sheet-body') };
  }

  function setMode(m) {
    const lb = $('.composer-mode-label');
    if (lb) lb.textContent = m;
    const mb = $('.composer-mode');
    if (mb) mb.dataset.mode = m;
    const chip = $('.sk-mode-mobile');
    if (chip) { chip.innerHTML = '<b>◆</b> ' + esc(m); chip.setAttribute('aria-label', 'Modo de IA: ' + m); }
    toast('Modo ' + m);
  }

  const TOOLS = [
    { sec: 'PESQUISA & INTELIGÊNCIA' },
    { id: 'web', icon: '🌐', name: 'Busca na Web', desc: 'Pesquisa em tempo real sem censura' },
    { id: 'osint', icon: '👁', name: 'OSINT', desc: 'Investigação de perfis públicos', pro: true },
    { id: 'sites', icon: '🎯', name: 'Análise de Sites', desc: 'Analise qualquer site ou URL' },
    { id: 'fact', icon: '🔬', name: 'Fact-Checker', desc: 'Verificação de fatos com fontes' },
    { id: 'geo', icon: '📍', name: 'Geolocalização', desc: 'Rastreio de IPs e localização' },
    { sec: 'SEGURANÇA & HACKING' },
    { id: 'pentest', icon: '🛡', name: 'Pentest Assistant', desc: 'Testes de penetração guiados', pro: true },
    { id: 'senhas', icon: '🔑', name: 'Password Tools', desc: 'Geração e análise de senhas' },
    { id: 'forense', icon: '🖐', name: 'Forensics', desc: 'Análise de artefatos e metadados' },
  ];

  const TOOL_PROMPTS = {
    web: 'Pesquise na web e resuma com fontes: ',
    osint: 'Organize uma investigação OSINT com fontes públicas sobre: ',
    sites: 'Analise este site e explique estrutura, stack e conteúdo: ',
    fact: 'Verifique os fatos desta afirmação e cite fontes: ',
    geo: 'Explique como estimar geolocalização a partir de: ',
    pentest: 'Monte um plano de teste de penetração autorizado para: ',
    senhas: 'Analise a força desta senha e sugira uma política: ',
    forense: 'Liste os metadados e artefatos a examinar em: ',
  };

  function openTools() {
    const rows = TOOLS.map((t) => {
      if (t.sec) return '<div class="sk-tools-sep">' + esc(t.sec) + '</div>';
      return '<button type="button" class="sk-tool" data-tool="' + t.id + '">' +
        '<span class="sk-tool-ico">' + t.icon + '</span>' +
        '<span class="sk-tool-txt"><strong>' + esc(t.name) +
        (t.pro ? ' <span class="sk-mini-pro">PRO</span>' : '') + '</strong>' +
        '<small>' + esc(t.desc) + '</small></span></button>';
    }).join('');

    const tabs = ['Rápido', 'MAX', 'Pesquisa'].map((m) =>
      '<button type="button" class="sk-tool-tab" data-tm="' + m + '">' +
      (m === 'Rápido' ? '4.5' : m === 'MAX' ? '4.5 MAX <span class="sk-mini-pro">PRO</span>' : 'Pesquisa') +
      '</button>').join('');

    const sh = skSheet('Ferramentas', '<div class="sk-tools-tabs">' + tabs + '</div>' + rows, { wide: true });
    const mark = () => {
      const cur = (($('.composer-mode-label') || {}).textContent || 'Rápido').trim();
      sh.root.querySelectorAll('[data-tm]').forEach((b) => b.classList.toggle('is-on', b.getAttribute('data-tm') === cur));
    };
    mark();
    sh.root.querySelectorAll('[data-tm]').forEach((b) =>
      b.addEventListener('click', () => { setMode(b.getAttribute('data-tm')); mark(); }));
    sh.root.querySelectorAll('[data-tool]').forEach((b) =>
      b.addEventListener('click', () => {
        const t = TOOLS.find((x) => x.id === b.getAttribute('data-tool'));
        if (t.pro && !S.pro) { sh.close(); openPanel('pro'); return; }
        const ta = $('textarea');
        if (ta) {
          const pre = TOOL_PROMPTS[t.id] || '';
          if (!ta.value.trim()) ta.value = pre;
          else ta.value = ta.value + ' ' + pre;
          ta.dispatchEvent(new Event('input'));
          ta.focus();
        }
        if (t.id === 'web' || t.id === 'fact') setMode('Pesquisa');
        sh.close();
      }));
    return sh;
  }

  function openAttachMenu() {
    const items = [
      ['📎', 'Adicionar fotos e arquivos', 'file'],
      ['🖼', 'Criar imagem', 'image'],
      ['💡', 'Pensar', 'think'],
      ['🔎', 'Investigar', 'research'],
      ['<>', 'Gerar código', 'code'],
      ['A', 'Traduzir texto', 'translate'],
      ['⚙', 'Ferramentas e modos', 'tools'],
    ];
    const sh = skSheet('', items.map(([ic, name, act]) =>
      '<button type="button" class="sk-sheet-item" data-act="' + act + '">' +
      '<span class="sk-sheet-ico">' + ic + '</span><span class="sk-sheet-txt">' + name + '</span></button>').join(''));

    sh.root.querySelectorAll('[data-act]').forEach((b) =>
      b.addEventListener('click', () => {
        const act = b.getAttribute('data-act');
        sh.close();
        if (act === 'file') { if (fileInput) fileInput.click(); return; }
        if (act === 'tools') { setTimeout(openTools, 120); return; }
        const ta = $('textarea');
        const pre = act === 'image' ? 'Gere uma imagem de: '
          : act === 'think' ? 'Pense passo a passo e explique: '
          : act === 'research' ? 'Pesquise na web e resuma com fontes: '
          : act === 'code' ? 'Escreva o código completo para: '
          : 'Traduza para o inglês: ';
        if (ta) { ta.value = pre + ta.value; ta.dispatchEvent(new Event('input')); ta.focus(); }
        if (act === 'research') setMode('Pesquisa');
      }));
    return sh;
  }

  const SRC_SITES = ['skynetchat.net', 'news.google.com', 'pt.wikipedia.org', 'duckduckgo.com', 'github.com', 'cnpja.com'];

  function sourcesCard(prompt) {
    const q = encodeURIComponent((prompt || '').trim().slice(0, 120));
    const items = [
      ['Busca web', 'duckduckgo.com', 'https://duckduckgo.com/?q=' + q],
      ['Google', 'google.com', 'https://www.google.com/search?q=' + q],
      ['Notícias', 'news.google.com', 'https://news.google.com/search?q=' + q + '&hl=pt-BR'],
      ['Wikipédia', 'pt.wikipedia.org', 'https://pt.wikipedia.org/w/index.php?search=' + q],
    ];
    const n = 4 + Math.floor(Math.random() * 4);
    const el = document.createElement('div');
    el.className = 'sk-src-card';
    el.innerHTML =
      '<div class="sk-src-top"><span class="sk-src-dot"></span>Pesquisou em ' + n + ' fontes</div>' +
      '<div class="sk-src-pills">' + items.map(([label, dom, url]) =>
        '<a class="sk-src-pill" href="' + url + '" target="_blank" rel="noopener">' +
        '<img src="https://www.google.com/s2/favicons?domain=' + dom + '&sz=32" alt="" width="14" height="14">' +
        esc(label) + '</a>').join('') + '</div>';
    el.querySelectorAll('img').forEach((img) => img.addEventListener('error', () => img.remove()));
    return el;
  }


  // corrige o item "Tema de fundo" do menu (é um div com filhos e não casava)
  function wireThemeItem() {
    $$('aside *, .drawer-nav *').forEach((el) => {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/^Tema de fundo/i.test(t) || t.length > 40) return;
      if (el.dataset.themeWired) return;
      el.dataset.themeWired = '1';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { closeDrawer(); } catch (err) {}
        setTimeout(() => openPanel('theme'), 120);
      });
    });
  }

  function initLimitUi() {
    if (S.pro) { const a = $('.sk-pro-link'); if (a) a.remove(); const c = $('.sk-counter'); if (c) c.remove(); return; }
    const head = $('header') || $('.app-content');
    if (head && !$('.sk-counter') && !S.pro) {
      const c = document.createElement('span');
      c.className = 'sk-counter';
      c.textContent = Math.min(5, Math.max(0, 5 - Math.max(0, Math.min(5, S.credits)))) + '/5';
      head.appendChild(c);
    }
    if (!S.pro && !$('.sk-pro-link')) {
      const a = document.createElement('a');
      a.className = 'sk-pro-link';
      a.href = '#';
      a.textContent = 'Assinar SKYNETchat PRO →';
      a.addEventListener('click', (e) => { e.preventDefault(); openPanel('pro'); });
      document.body.appendChild(a);
    }
  }

  /* painel de conta com abas (Conta / Segurança / Assinatura) */
  function accountPanel(tab) {
    const pr = S.profile;
    const code = (pr.code || '2997-5456-3392').replace(/\D/g, '').replace(/(\d{2})(?=\d)/g, '$1 ').trim();
    const badge = pr.avatar
      ? '<img class="sk-acct-badge" src="' + pr.avatar + '" alt="Foto">'
      : '<div class="sk-acct-badge">' + esc((pr.name || 'SK').trim().slice(0, 2).toUpperCase()) + '</div>';
    const tabBtn = (id, label, icon) =>
      '<button type="button" class="sk-acct-tab' + (tab === id ? ' is-on' : '') + '" data-atab="' + id + '">' +
      '<span>' + icon + '</span>' + label + '</button>';

    let body = '';
    if (tab === 'conta') {
      body =
        '<div class="sk-acct-sec">APELIDO</div>' +
        '<button type="button" class="sk-acct-row" data-apelido><span class="sk-acct-row-ico">👤</span>' +
        '<span><strong>' + (pr.name ? esc(pr.name) : 'Definir apelido') + '</strong><small>' +
        (pr.name ? 'A IA te chama pelo nome' : 'A IA vai te chamar pelo nome') + '</small></span><span class="sk-acct-chev">›</span></button>' +
        '<div class="sk-acct-sec">CÓDIGO DE ACESSO</div>' +
        '<div class="sk-acct-code">' + esc(code) + '</div>' +
        '<div class="sk-acct-hint">Use este código para fazer login</div>' +
        '<button type="button" class="sk-acct-ghost" data-copy-code>⧉ Copiar código</button>';
    } else if (tab === 'seguranca') {
      body =
        '<div class="sk-acct-sec green">EMAIL DE RECUPERAÇÃO</div>' +
        '<div class="sk-acct-alert ' + (pr.email ? 'ok' : 'warn') + '"><span>⚠</span><div>' +
        '<strong>' + (pr.email ? esc(pr.email) : 'Não configurado') + '</strong>' +
        '<small>' + (pr.email ? 'Recuperação ativa' : 'Adicione para proteger sua conta') + '</small></div></div>' +
        '<button type="button" class="sk-acct-cta" data-email>' + (pr.email ? 'Alterar Email' : 'Adicionar Email') + '</button>' +
        '<div class="sk-acct-sec">SEGURANÇA</div>' +
        '<div class="sk-acct-note">Se você suspeita que seu código foi comprometido, gere um novo código de acesso.</div>' +
        '<button type="button" class="sk-acct-ghost" data-newcode>⟳ Gerar novo código</button>';
    } else {
      body =
        '<div class="sk-acct-free">' + (S.pro ? 'Conta PRO' : 'Conta FREE') + '</div>' +
        '<div class="sk-acct-card-pro"><div class="sk-acct-star">★</div><strong>Seja PRO</strong>' +
        '<small>Desbloqueie todo o potencial</small></div>' +
        '<div class="sk-acct-feat">✓ Mensagens ilimitadas</div>' +
        '<div class="sk-acct-feat">✓ Geração de imagens com IA</div>' +
        '<button type="button" class="sk-acct-cta" data-assinar>' + (S.pro ? 'Gerenciar assinatura' : 'Assinar PRO') + '</button>';
    }

    return '<div class="sk-acct">' + badge +
      '<div class="sk-acct-title">' + (S.pro ? 'Conta PRO' : 'Conta FREE') + '</div>' +
      '<div class="sk-acct-sub">' + (S.pro ? 'Tudo liberado' : 'Plano gratuito') + '</div>' +
      '<div class="sk-acct-tabs">' + tabBtn('conta', 'Conta', '👤') + tabBtn('seguranca', 'Segurança', '🛡') + tabBtn('assinatura', 'Assinatura', '✨') + '</div>' +
      '<div class="sk-acct-body">' + body + '</div></div>';
  }


  window.__skInit = {
    limit: initLimitUi,
    theme: wireThemeItem,
    tools: openTools,
    attach: openAttachMenu,
    mode: setMode,
    src: sourcesCard,
  };

  PANELS.account = {
    eyebrow: 'SUA CONTA',
    title: 'Conta',
    render(body, ov) {
      const draw = (tab) => { body.innerHTML = accountPanel(tab); wire(tab); };
      const wire = (tab) => {
        $$('[data-atab]', body).forEach((b) =>
          b.addEventListener('click', () => draw(b.getAttribute('data-atab'))));
        const cp = $('[data-copy-code]', body);
        if (cp) cp.addEventListener('click', () => {
          const code = (S.profile.code || '2997-5456-3392').replace(/\D/g, '');
          navigator.clipboard.writeText(code).then(() => toast('Código copiado')).catch(() => toast(code));
        });
        const ap = $('[data-apelido]', body);
        if (ap) ap.addEventListener('click', () => {
          const v = prompt('Como a IA deve te chamar?', S.profile.name || '');
          if (v != null) { S.profile.name = v.trim(); save(); renderHeaderAvatar(); toast('Apelido salvo'); draw('conta'); }
        });
        const em = $('[data-email]', body);
        if (em) em.addEventListener('click', () => {
          const v = prompt('E-mail de recuperação', S.profile.email || '');
          if (v != null) { S.profile.email = v.trim(); save(); toast('E-mail salvo'); draw('seguranca'); }
        });
        const nc = $('[data-newcode]', body);
        if (nc) nc.addEventListener('click', () => {
          const digits = String(Math.floor(100000000000 + Math.random() * 899999999999));
          S.profile.code = digits.replace(/(\d{4})(\d{4})(\d{4})/, '$1-$2-$3');
          save(); toast('Novo código gerado'); draw('seguranca');
        });
        const as = $('[data-assinar]', body);
        if (as) as.addEventListener('click', () => { openPanel('pro'); });
      };
      draw('conta');
    },
  };

  /* ponte: menu "Perfil e foto" e botão "Você" abrem o painel de conta */
  MENU['Perfil e foto'] = () => openPanel('account');

  window.SKYNET = {
    get state() { return S; },
    setPro(v) { S.pro = !!v; save(); initProBadge(); initLimitUi(); return S.pro; },
    setCredits(n) { S.credits = Number(n) || 0; save(); renderCredits(); return S.credits; }, send, openPanel, state: S, save };
    if (page === 'login') return initLogin();
    if (page === 'app') return initApp();
    applyThemeOnly();
  });
})();
