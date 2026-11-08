/* SKYNETchat · fontes extras de dados abertos (sem chave)
 * Hacker News (Algolia), CoinGecko, câmbio, npm, Stack Exchange e arXiv direto;
 * GitHub e Reddit pelo leitor r.jina.ai porque as APIs deles não liberam CORS.
 * Cada função devolve dados já no formato dos artefatos e nunca lança.
 */

const TIMEOUT = 12000;

async function pegar(url, tipo = "json") {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: ctl.signal, credentials: "omit" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return tipo === "texto" ? await r.text() : await r.json();
  } finally {
    clearTimeout(to);
  }
}

const recortarJson = (t) => {
  const texto = String(t || "").replace(/^```(?:json)?/gm, "").replace(/```$/gm, "");
  const inicios = [texto.indexOf("{"), texto.indexOf("[")].filter((i) => i >= 0);
  if (!inicios.length) throw new Error("sem json");
  const ini = Math.min(...inicios);
  const abre = texto[ini];
  const fecha = abre === "{" ? "}" : "]";
  let nivel = 0, dentro = false, emTexto = false, escape = false;
  for (let i = ini; i < texto.length; i++) {
    const c = texto[i];
    if (emTexto) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') emTexto = false;
      continue;
    }
    if (c === '"') { emTexto = true; continue; }
    if (c === abre) { nivel++; dentro = true; }
    else if (c === fecha) { nivel--; if (dentro && nivel === 0) return JSON.parse(texto.slice(ini, i + 1)); }
  }
  throw new Error("json incompleto");
};

const ler = (alvo, tipo = "json") => pegar("https://r.jina.ai/" + alvo, "texto").then((t) => {
  if (tipo === "texto") return t;
  return recortarJson(t);
});

const num = (n) => (typeof n === "number" ? n : Number(n) || 0);
const quando = (seg) => {
  if (!seg) return "";
  const d = Math.max(1, Math.round((Date.now() / 1000 - seg) / 60));
  if (d < 60) return `há ${d} min`;
  const h = Math.round(d / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`;
};

/* ------------------------------------------------------------- Hacker News */
export async function hackernews(q = "inteligência artificial", limite = 6) {
  try {
    const d = await pegar(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=${limite}`);
    return (d.hits || []).map((h) => ({
      titulo: h.title || h.story_title || "",
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      fonte: "news.ycombinator.com",
      pontos: num(h.points),
      comentarios: num(h.num_comments),
      quando: quando(h.created_at_i),
      autor: h.author,
    }));
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ GitHub */
export async function github(q = "agents", limite = 6) {
  try {
    const alvo = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${limite}`;
    let d = null;
    try { d = await pegar(alvo); } catch { }
    if (!d || !d.items) d = await ler(alvo);
    return (d.items || []).map((r) => ({
      titulo: r.full_name,
      url: r.html_url,
      descricao: r.description || "",
      estrelas: num(r.stargazers_count),
      forks: num(r.forks_count),
      linguagem: r.language || "",
      atualizado: (r.pushed_at || "").slice(0, 10),
      topicos: (r.topics || []).slice(0, 4),
      licenca: (r.license && r.license.spdx_id) || "",
    }));
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------- arXiv */
export async function papers(q = "agent", limite = 5) {
  try {
    const d = await pegar(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per_page=${limite}&sort=publication_date:desc`);
    return (d.results || []).map((w) => ({
      titulo: (w.title || "").trim(),
      url: w.doi ? w.doi.replace("https://doi.org/", "https://doi.org/") : (w.id || ""),
      fonte: (w.primary_location && w.primary_location.source && w.primary_location.source.display_name) || "openalex.org",
      data: (w.publication_date || "").slice(0, 10),
      resumo: String((w.abstract_inverted_index ? Object.keys(w.abstract_inverted_index).slice(0, 60).join(" ") : "") || "").slice(0, 300),
      autores: (w.authorships || []).slice(0, 3).map((a) => (a.author && a.author.display_name) || "").filter(Boolean).join(", "),
      citacoes: Number(w.cited_by_count) || 0,
      aberto: !!(w.open_access && w.open_access.is_oa),
    })).filter((p) => p.titulo);
  } catch {
    return [];
  }
}

/* --------------------------------------------------------- Stack Overflow */
export async function stackoverflow(q = "javascript", limite = 5) {
  try {
    const d = await pegar(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(q)}&site=stackoverflow&pagesize=${limite}&filter=default`);
    return (d.items || []).map((i) => ({
      titulo: i.title,
      url: i.link,
      fonte: "stackoverflow.com",
      pontos: num(i.score),
      comentarios: num(i.answer_count),
      aceita: !!i.is_answered,
      quando: quando(i.last_activity_date),
      tags: (i.tags || []).slice(0, 3),
    }));
  } catch {
    return [];
  }
}

/* ------------------------------------------------- cripto, câmbio e pacotes */
const CRIPTO_IDS = {
  bitcoin: ["bitcoin", "btc"], btc: ["bitcoin", "btc"], ethereum: ["ethereum", "eth"], eth: ["ethereum", "eth"],
  solana: ["solana", "sol"], sol: ["solana", "sol"], xrp: ["ripple", "xrp"], cardano: ["cardano", "ada"],
  dogecoin: ["dogecoin", "doge"], doge: ["dogecoin", "doge"], bnb: ["binancecoin", "bnb"], usdt: ["tether", "usdt"],
};

const PARES = { bitcoin: ["BTCUSDT", "BTC"], ethereum: ["ETHUSDT", "ETH"], solana: ["SOLUSDT", "SOL"], xrp: ["XRPUSDT", "XRP"], dogecoin: ["DOGEUSDT", "DOGE"], cardano: ["ADAUSDT", "ADA"], binancecoin: ["BNBUSDT", "BNB"] };

export async function cripto(q = "bitcoin") {
  const alvo = String(q || "").toLowerCase();
  const achados = Object.keys(PARES).filter((k) => alvo.includes(k) || (k === "bitcoin" && /\bbtc\b/.test(alvo)) || (k === "ethereum" && /\beth\b/.test(alvo)));
  const ids = [...new Set(achados.length ? achados : ["bitcoin", "ethereum", "solana"])].slice(0, 4);

  // provedor 1: CoinGecko (preço, real e market cap)
  try {
    const d = await pegar(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd,brl&include_24hr_change=true&include_market_cap=true`);
    const itens = Object.entries(d || {}).map(([id, v]) => ({
      nome: id, usd: num(v.usd), brl: num(v.brl), variacao: num(v.usd_24h_change), marketCap: num(v.usd_market_cap),
    }));
    if (itens.length) return itens;
  } catch { }

  // provedor 2: Binance (só dólar e variação, mas quase nunca cai)
  try {
    const itens = [];
    for (const id of ids) {
      const par = (PARES[id] && PARES[id][0]) || "BTCUSDT";
      const t = await pegar(`https://api.binance.com/api/v3/ticker/24hr?symbol=${par}`);
      itens.push({ nome: id, usd: num(t.lastPrice), brl: 0, variacao: num(t.priceChangePercent), marketCap: 0 });
    }
    return itens;
  } catch {
    return [];
  }
}

export async function cambio(q = "") {
  try {
    const d = await pegar("https://open.er-api.com/v6/latest/USD");
    const t = d.rates || {};
    const quer = String(q || "").toUpperCase();
    const moedas = ["BRL", "EUR", "GBP", "ARS", "JPY", "CNY", "USD", "CAD", "AUD", "CHF"];
    const filtradas = moedas.filter((m) => !quer || quer.includes(m) || m === "BRL" || m === "EUR");
    return {
      base: "USD",
      quando: (d.time_last_update_utc || "").slice(5, 16),
      itens: filtradas.slice(0, 8).map((m) => ({ nome: m, valor: num(t[m]) })),
    };
  } catch {
    return null;
  }
}

export async function pacote(nome = "react") {
  try {
    const d = await pegar(`https://registry.npmjs.org/${encodeURIComponent(nome)}/latest`);
    return {
      nome: d.name,
      versao: d.version,
      descricao: d.description || "",
      licenca: d.license || "",
      homepage: d.homepage || "",
      repo: (d.repository && (d.repository.url || d.repository)) || "",
      dependencias: Object.keys(d.dependencies || {}).length,
      url: `https://www.npmjs.com/package/${d.name}`,
    };
  } catch {
    return null;
  }
}
