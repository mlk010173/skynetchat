// Cliente REAL de clima para o navegador: Open-Meteo (previsão + qualidade do ar,
// sem chave, CORS aberto) e INMET (avisos, só Brasil; ver observação abaixo).
//
// O que foi verificado ao vivo com curl (13/11/2026, ver relatório):
//   - geocoding-api.open-meteo.com  -> 200, access-control-allow-origin: *
//   - api.open-meteo.com            -> 200, access-control-allow-origin: *
//   - air-quality-api.open-meteo.com-> 200, access-control-allow-origin: *
//   - apiprevmet3.inmet.gov.br      -> 200, devolve o Origin recebido em
//     access-control-allow-origin (Vary: Origin). É instável: às vezes a conexão
//     é redefinida (curl exit 52 / status 000) e há limite de requisições.
//     Por isso tudo aqui falha em silêncio e o campo "Alertas" desaparece com
//     "sem fonte de alertas disponível para esta região" em vez de inventar aviso.
//
// Nada é simulado: se a API não responder, a função devolve { ok:false }.

const TTL_MS = 10 * 60 * 1000; // 10 minutos
const CHAVE_CACHE = "skynet.clima.cache.v1";
const CHAVE_PREFS = "skynet.clima.v1";
const MAX_CACHE = 12;
const TIMEOUT_MS = 12000;
const INMET_URL = "https://apiprevmet3.inmet.gov.br/avisos/ativos";

export const FONTES = {
  previsao: { nome: "Open-Meteo · previsão", url: "https://open-meteo.com/" },
  ar: { nome: "Open-Meteo · qualidade do ar", url: "https://open-meteo.com/en/docs/air-quality-api" },
  geocod: { nome: "Open-Meteo · busca de cidades", url: "https://geocoding-api.open-meteo.com/v1/search" },
  reverter: { nome: "BigDataCloud · geocodificação reversa", url: "https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api" },
  inmet: { nome: "INMET · avisos meteorológicos", url: "https://portal.inmet.gov.br/avisos" },
};

/* ------------------------------------------------------------------ base */

function numero(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function agoraMs() {
  return Date.now();
}

function arred2(n) {
  return Math.round(n * 100) / 100;
}

/** Chave de cache: lat/lon arredondados a 2 casas ("-25.43,-49.27"). */
export function chaveCache(lat, lon) {
  return `${arred2(Number(lat)).toFixed(2)},${arred2(Number(lon)).toFixed(2)}`;
}

const memoria = new Map();
let espelhoLido = false;

function lerEspelho() {
  if (espelhoLido) return;
  espelhoLido = true;
  try {
    const bruto = globalThis.localStorage?.getItem(CHAVE_CACHE);
    if (!bruto) return;
    const obj = JSON.parse(bruto);
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v.em === "number") memoria.set(k, v);
    }
  } catch { /* storage indisponível ou corrompido: segue só com memória */ }
}

function gravarEspelho() {
  try {
    const obj = {};
    for (const [k, v] of memoria.entries()) obj[k] = v;
    globalThis.localStorage?.setItem(CHAVE_CACHE, JSON.stringify(obj));
  } catch { /* ignora cota cheia / modo privado */ }
}

/** Entrada viva do cache (dentro do TTL) ou null. */
export function lerCache(lat, lon, agora = agoraMs()) {
  lerEspelho();
  const chave = chaveCache(lat, lon);
  const item = memoria.get(chave);
  if (!item) return null;
  if (agora - item.em > TTL_MS) return null;
  return { dados: item.dados, em: item.em };
}

/** Última entrada mesmo vencida: usada para mostrar dado antigo quando fica offline. */
export function lerCacheVencido(lat, lon) {
  lerEspelho();
  const item = memoria.get(chaveCache(lat, lon));
  return item ? { dados: item.dados, em: item.em } : null;
}

export function gravarCache(lat, lon, dados, agora = agoraMs()) {
  lerEspelho();
  const chave = chaveCache(lat, lon);
  memoria.delete(chave);
  memoria.set(chave, { em: agora, dados });
  // limite simples: descarta as entradas mais antigas
  while (memoria.size > MAX_CACHE) {
    const primeira = memoria.keys().next().value;
    if (primeira === undefined) break;
    memoria.delete(primeira);
  }
  gravarEspelho();
  return dados;
}

export function limparCache() {
  memoria.clear();
  espelhoLido = true;
  try { globalThis.localStorage?.removeItem(CHAVE_CACHE); } catch { /* ignora */ }
}

export { TTL_MS, CHAVE_CACHE, CHAVE_PREFS };

/** fetch com timeout real (AbortController). */
async function pegar(url, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/* --------------------------------------------------- preferências (local) */

export function lerPreferenciasClima() {
  const padrao = { cidade: "São Paulo", lat: -23.55, lon: -46.63, unidade: "C" };
  try {
    const bruto = globalThis.localStorage?.getItem(CHAVE_PREFS);
    if (!bruto) return padrao;
    const p = JSON.parse(bruto);
    const lat = Number(p?.lat);
    const lon = Number(p?.lon);
    return {
      cidade: typeof p?.cidade === "string" && p.cidade.trim() ? p.cidade.slice(0, 80) : padrao.cidade,
      lat: Number.isFinite(lat) && Math.abs(lat) <= 90 ? lat : padrao.lat,
      lon: Number.isFinite(lon) && Math.abs(lon) <= 180 ? lon : padrao.lon,
      unidade: p?.unidade === "F" ? "F" : "C",
    };
  } catch {
    return padrao;
  }
}

export function salvarPreferenciasClima(patch = {}) {
  const atual = lerPreferenciasClima();
  const novo = { ...atual, ...patch };
  try { globalThis.localStorage?.setItem(CHAVE_PREFS, JSON.stringify(novo)); } catch { /* ignora */ }
  return novo;
}

/* ------------------------------------------------------- tabela WMO + ícones */

// Ícones em SVG próprio (geometria, não emoji): cada código aponta para um nome
// em ICONES; quem desenha é o componente <IconeTempo/>, então nada depende da
// fonte de emoji do sistema.
const NUBEM = "M20 44h23.5a8.5 8.5 0 0 0 .9-16.95A12.5 12.5 0 0 0 20 29.6 7.2 7.2 0 0 0 20 44Z";

export const ICONES = {
  sol: { traco: true, formas: [{ t: "circle", cx: 32, cy: 32, r: 10 }, ...raios(32, 32, 15, 20, 8)] },
  lua: { traco: true, formas: [{ t: "path", d: "M40.5 38.5A14 14 0 1 1 26 17a11 11 0 0 0 14.5 21.5Z" }] },
  parcialDia: {
    traco: true,
    formas: [
      { t: "circle", cx: 25, cy: 24, r: 7 },
      { t: "line", x1: 25, y1: 11, x2: 25, y2: 14 },
      { t: "line", x1: 38, y1: 24, x2: 41, y2: 24 },
      { t: "line", x1: 12, y1: 24, x2: 9, y2: 24 },
      { t: "path", d: NUBEM, dx: 0, dy: 2 },
    ],
  },
  parcialNoite: {
    traco: true,
    formas: [
      { t: "path", d: "M32 26a9 9 0 1 1-8-14.6A8 8 0 0 0 32 26Z" },
      { t: "path", d: NUBEM, dx: 0, dy: 2 },
    ],
  },
  nublado: { traco: true, formas: [{ t: "path", d: NUBEM }] },
  nevoeiro: {
    traco: true,
    formas: [
      { t: "path", d: NUBEM, dy: -3 },
      { t: "line", x1: 18, y1: 45, x2: 46, y2: 45 },
      { t: "line", x1: 22, y1: 51, x2: 42, y2: 51 },
    ],
  },
  garoa: {
    traco: true,
    formas: [
      { t: "path", d: NUBEM, dy: -3 },
      { t: "line", x1: 24, y1: 45, x2: 22, y2: 50 },
      { t: "line", x1: 32, y1: 45, x2: 30, y2: 50 },
      { t: "line", x1: 40, y1: 45, x2: 38, y2: 50 },
    ],
  },
  chuva: {
    traco: true,
    formas: [
      { t: "path", d: NUBEM, dy: -3 },
      { t: "line", x1: 23, y1: 44, x2: 20, y2: 53 },
      { t: "line", x1: 33, y1: 44, x2: 30, y2: 53 },
      { t: "line", x1: 43, y1: 44, x2: 40, y2: 53 },
    ],
  },
  neve: {
    traco: true,
    formas: [
      { t: "path", d: NUBEM, dy: -4 },
      { t: "line", x1: 24, y1: 46, x2: 32, y2: 46 },
      { t: "line", x1: 28, y1: 42, x2: 28, y2: 50 },
      { t: "line", x1: 36, y1: 48, x2: 44, y2: 48 },
      { t: "line", x1: 40, y1: 44, x2: 40, y2: 52 },
    ],
  },
  tempestade: {
    traco: true,
    formas: [
      { t: "path", d: NUBEM, dy: -4 },
      { t: "path", d: "M30 42h6l-4 7h4l-9 10 3-8h-4z" },
    ],
  },
  granizo: {
    traco: true,
    formas: [
      { t: "path", d: NUBEM, dy: -4 },
      { t: "circle", cx: 24, cy: 48, r: 2.2 },
      { t: "circle", cx: 33, cy: 52, r: 2.2 },
      { t: "circle", cx: 41, cy: 47, r: 2.2 },
    ],
  },
};

function raios(cx, cy, r1, r2, n) {
  const saida = [];
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n;
    saida.push({
      t: "line",
      x1: arred2(cx + Math.cos(a) * r1),
      y1: arred2(cy + Math.sin(a) * r1),
      x2: arred2(cx + Math.cos(a) * r2),
      y2: arred2(cy + Math.sin(a) * r2),
    });
  }
  return saida;
}

/** Código WMO -> { rotulo, icone }. `isDia` escolhe sol/lua nos códigos 0-2. */
export function tempoDoCodigo(codigo, isDia = true) {
  const c = Number(codigo);
  const dia = isDia !== false;
  const t = (rotulo, icone) => ({ rotulo, icone });
  if (c === 0) return t("céu limpo", dia ? "sol" : "lua");
  if (c === 1) return t("quase limpo", dia ? "parcialDia" : "parcialNoite");
  if (c === 2) return t("parcialmente nublado", dia ? "parcialDia" : "parcialNoite");
  if (c === 3) return t("nublado", "nublado");
  if (c === 45) return t("névoa", "nevoeiro");
  if (c === 48) return t("névoa com geada", "nevoeiro");
  if (c === 51) return t("garoa fraca", "garoa");
  if (c === 53) return t("garoa", "garoa");
  if (c === 55) return t("garoa forte", "garoa");
  if (c === 56 || c === 57) return t("garoa congelante", "garoa");
  if (c === 61) return t("chuva fraca", "chuva");
  if (c === 63) return t("chuva", "chuva");
  if (c === 65) return t("chuva forte", "chuva");
  if (c === 66 || c === 67) return t("chuva congelante", "chuva");
  if (c === 71) return t("neve fraca", "neve");
  if (c === 73) return t("neve", "neve");
  if (c === 75) return t("neve forte", "neve");
  if (c === 77) return t("grãos de neve", "neve");
  if (c === 80) return t("pancadas fracas", "chuva");
  if (c === 81) return t("pancadas de chuva", "chuva");
  if (c === 82) return t("pancadas fortes", "chuva");
  if (c === 85 || c === 86) return t("pancadas de neve", "neve");
  if (c === 95) return t("trovoada", "tempestade");
  if (c === 96) return t("trovoada com granizo", "granizo");
  if (c === 99) return t("trovoada forte com granizo", "granizo");
  return t("condição não informada", "nublado");
}

/* ------------------------------------------------------------- conversões */

/** °C -> número na unidade pedida (C ou F). */
export function converterTemperatura(celsius, unidade = "C") {
  const n = numero(celsius);
  if (n === null) return null;
  return unidade === "F" ? arred2((n * 9) / 5 + 32) : arred2(n);
}

/** "17°" (sem letra, igual ao Google Weather). Sem valor -> "—". */
export function formatarTemperatura(celsius, unidade = "C") {
  const v = converterTemperatura(celsius, unidade);
  return v === null ? "—" : `${Math.round(v)}°`;
}

/** "17" (só o número, para o valor grande). */
export function numeroTemperatura(celsius, unidade = "C") {
  const v = converterTemperatura(celsius, unidade);
  return v === null ? null : Math.round(v);
}

export function simboloTemperatura(unidade = "C") {
  return unidade === "F" ? "°F" : "°C";
}

/** km/h (padrão Open-Meteo) -> inteiro legível. */
export function formatarVento(kmh) {
  const n = numero(kmh);
  return n === null ? "—" : `${Math.round(n)} km/h`;
}

export function formatarPressao(hpa) {
  const n = numero(hpa);
  return n === null ? "—" : `${Math.round(n)} hPa`;
}

const ROSA = ["N", "NNE", "NE", "ENE", "L", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
const ROSA_NOME = {
  N: "norte", NNE: "nordeste", NE: "nordeste", ENE: "leste-nordeste", L: "leste", ESE: "leste-sudeste",
  SE: "sudeste", SSE: "sul-sudeste", S: "sul", SSO: "sul-sudoeste", SO: "sudoeste", OSO: "oeste-sudoeste",
  O: "oeste", ONO: "oeste-noroeste", NO: "noroeste", NNO: "norte-noroeste",
};

/** Graus -> { sigla, nome }. */
export function direcaoVento(graus) {
  const g = numero(graus);
  if (g === null) return { sigla: "—", nome: "sem direção" };
  const i = Math.round(((g % 360) / 22.5)) % 16;
  const sigla = ROSA[i];
  return { sigla, nome: ROSA_NOME[sigla] ?? "—" };
}

/** Índice UV -> faixa com cor (padrão OMS). */
export function classificarUv(uv) {
  const n = numero(uv);
  if (n === null) return { rotulo: "—", cor: "#9aa0a6" };
  if (n < 3) return { rotulo: "baixo", cor: "#3dd68c" };
  if (n < 6) return { rotulo: "moderado", cor: "#f2c744" };
  if (n < 8) return { rotulo: "alto", cor: "#f2913d" };
  if (n < 11) return { rotulo: "muito alto", cor: "#e0383f" };
  return { rotulo: "extremo", cor: "#a855f7" };
}

/** Qualidade do ar (AQI europeu, escala 0-100+). */
export function classificarAr(valor, escala = "europeu") {
  const n = numero(valor);
  if (n === null) return { rotulo: "—", cor: "#9aa0a6", nivel: -1 };
  if (escala === "eua") {
    if (n <= 50) return { rotulo: "bom", cor: "#3dd68c", nivel: 0 };
    if (n <= 100) return { rotulo: "moderado", cor: "#f2c744", nivel: 1 };
    if (n <= 150) return { rotulo: "ruim para grupos sensíveis", cor: "#f2913d", nivel: 2 };
    if (n <= 200) return { rotulo: "ruim", cor: "#e0383f", nivel: 3 };
    if (n <= 300) return { rotulo: "muito ruim", cor: "#a855f7", nivel: 4 };
    return { rotulo: "perigoso", cor: "#7f1d1d", nivel: 5 };
  }
  if (n <= 20) return { rotulo: "bom", cor: "#3dd68c", nivel: 0 };
  if (n <= 40) return { rotulo: "razoável", cor: "#a3d977", nivel: 1 };
  if (n <= 60) return { rotulo: "moderado", cor: "#f2c744", nivel: 2 };
  if (n <= 80) return { rotulo: "ruim", cor: "#f2913d", nivel: 3 };
  if (n <= 100) return { rotulo: "muito ruim", cor: "#e0383f", nivel: 4 };
  return { rotulo: "extremamente ruim", cor: "#a855f7", nivel: 5 };
}

export function formatarHora(iso) {
  if (!iso) return "—";
  const s = String(iso);
  const m = s.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : s;
}

/* ------------------------------------------------------------- montagem URL */

export function montarUrlPrevisao(lat, lon) {
  const p = new URLSearchParams({
    latitude: String(arred2(lat)),
    longitude: String(arred2(lon)),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,is_day",
    hourly: "temperature_2m,precipitation_probability,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max",
    timezone: "auto",
    forecast_days: "7",
  });
  return `https://api.open-meteo.com/v1/forecast?${p.toString()}`;
}

export function montarUrlAr(lat, lon) {
  const p = new URLSearchParams({
    latitude: String(arred2(lat)),
    longitude: String(arred2(lon)),
    current: "european_aqi,us_aqi,pm10,pm2_5,ozone,nitrogen_dioxide",
    timezone: "auto",
  });
  return `https://air-quality-api.open-meteo.com/v1/air-quality?${p.toString()}`;
}

export function montarUrlCidades(q) {
  const p = new URLSearchParams({
    name: String(q ?? "").trim(),
    count: "8",
    language: "pt",
    format: "json",
  });
  return `https://geocoding-api.open-meteo.com/v1/search?${p.toString()}`;
}

/* ------------------------------------------------------------ normalização */

function mapaNascerPor(daily) {
  const mapa = {};
  const datas = daily?.time ?? [];
  datas.forEach((d, i) => {
    mapa[String(d)] = { nascer: formatarHora(daily?.sunrise?.[i]), por: formatarHora(daily?.sunset?.[i]) };
  });
  return mapa;
}

function ehDia(iso, mapa) {
  const s = String(iso ?? "");
  const par = mapa[s.slice(0, 10)];
  if (!par || par.nascer === "—" || par.por === "—") return true;
  const hm = s.slice(11, 16);
  return hm >= par.nascer && hm < par.por;
}

/**
 * Normaliza a resposta REAL da Open-Meteo. Tudo que pode faltar vira null,
 * nunca NaN. Exportada para teste com fixture.
 */
export function normalizarPrevisao(bruto, { unidade = "C", local = null } = {}) {
  if (!bruto || typeof bruto !== "object") return { ok: false, erro: "resposta vazia do serviço de clima", tipo: "dados" };
  const cur = bruto.current;
  if (!cur || typeof cur !== "object") return { ok: false, erro: "o serviço de clima não devolveu dados atuais", tipo: "dados" };

  const daily = bruto.daily ?? {};
  const mapa = mapaNascerPor(daily);
  const isDia = Number(cur.is_day) === 1;
  const codigo = numero(cur.weather_code);
  const tempo = tempoDoCodigo(codigo, isDia);

  const horas = [];
  const t = Array.isArray(bruto.hourly?.time) ? bruto.hourly.time : [];
  const temps = bruto.hourly?.temperature_2m ?? [];
  const probs = bruto.hourly?.precipitation_probability ?? [];
  const codigos = bruto.hourly?.weather_code ?? [];
  const ventos = bruto.hourly?.wind_speed_10m ?? [];
  const horaAtual = String(cur.time ?? "").slice(0, 13);
  let inicio = t.findIndex((x) => String(x).slice(0, 13) === horaAtual);
  if (inicio < 0) inicio = 0;
  for (let i = inicio; i < t.length && horas.length < 24; i++) {
    const temp = numero(temps[i]);
    if (temp === null) continue; // hora sem dado não entra: o gráfico não recebe NaN
    horas.push({
      iso: String(t[i]),
      hora: String(t[i]).slice(11, 16),
      tempC: temp,
      chuvaProb: numero(probs[i]),
      codigo: numero(codigos[i]),
      ventoKmh: numero(ventos[i]),
      isDia: ehDia(t[i], mapa),
    });
  }

  const dias = (daily.time ?? []).map((data, i) => ({
    data: String(data),
    codigo: numero(daily.weather_code?.[i]),
    maxC: numero(daily.temperature_2m_max?.[i]),
    minC: numero(daily.temperature_2m_min?.[i]),
    chuvaMax: numero(daily.precipitation_probability_max?.[i]),
    uv: numero(daily.uv_index_max?.[i]),
  })).filter((d) => d.maxC !== null || d.minC !== null);

  return {
    ok: true,
    unidade,
    local: local ?? {
      nome: "Local selecionado",
      pais: "",
      uf: "",
      lat: numero(bruto.latitude),
      lon: numero(bruto.longitude),
      timezone: bruto.timezone ?? null,
    },
    timezone: bruto.timezone ?? null,
    agora: {
      horaLocal: String(cur.time ?? "").slice(11, 16),
      tempC: numero(cur.temperature_2m),
      sensacaoC: numero(cur.apparent_temperature),
      umidade: numero(cur.relative_humidity_2m),
      precipitacao: numero(cur.precipitation),
      codigo,
      rotulo: tempo.rotulo,
      icone: tempo.icone,
      ventoKmh: numero(cur.wind_speed_10m),
      ventoGraus: numero(cur.wind_direction_10m),
      pressaoHpa: numero(cur.surface_pressure),
      isDia,
    },
    hoje: {
      maxC: numero(daily.temperature_2m_max?.[0]),
      minC: numero(daily.temperature_2m_min?.[0]),
      chuvaMax: numero(daily.precipitation_probability_max?.[0]),
      nascer: formatarHora(daily.sunrise?.[0]),
      por: formatarHora(daily.sunset?.[0]),
      uv: numero(daily.uv_index_max?.[0]),
      codigo: numero(daily.weather_code?.[0]),
    },
    horas,
    dias,
  };
}

export function normalizarAr(bruto) {
  if (!bruto?.current) return null;
  const c = bruto.current;
  const europeu = numero(c.european_aqi);
  const eua = numero(c.us_aqi);
  const base = europeu !== null ? { valor: europeu, escala: "europeu" } : eua !== null ? { valor: eua, escala: "eua" } : null;
  const faixa = base ? classificarAr(base.valor, base.escala) : { rotulo: "—", cor: "#9aa0a6", nivel: -1 };
  return {
    europeu,
    eua,
    pm10: numero(c.pm10),
    pm25: numero(c.pm2_5),
    ozonio: numero(c.ozone),
    no2: numero(c.nitrogen_dioxide),
    hora: String(c.time ?? "").slice(11, 16),
    valor: base?.valor ?? null,
    escala: base?.escala ?? null,
    faixa,
  };
}

/**
 * Avisos do INMET: devolve só o que é real. `disponivel:false` quando a fonte
 * não responde (o widget esconde a seção em vez de inventar alerta).
 */
export function normalizarAvisosINMET(bruto, { uf = "", cidade = "" } = {}) {
  if (!bruto || (!Array.isArray(bruto.hoje) && !Array.isArray(bruto.futuro))) {
    return { disponivel: false, motivo: "fonte INMET não respondeu", itens: [] };
  }
  const lista = [...(bruto.hoje ?? []), ...(bruto.futuro ?? [])];
  const alvoUf = String(uf || "").trim().toUpperCase();
  const alvoCidade = String(cidade || "").trim().toLowerCase();
  const itens = [];
  for (const a of lista) {
    const estados = String(a?.estados ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (alvoUf && estados.length && !estados.some((e) => e.toUpperCase() === alvoUf)) continue;
    const municipios = String(a?.municipios ?? "").toLowerCase();
    const noMunicipio = Boolean(alvoCidade) && municipios.includes(alvoCidade);
    // aviso do estado inteiro é real, mas pode não cobrir a cidade: fica rotulado
    const abrangencia = noMunicipio ? "municipio" : alvoCidade ? "estado" : "estado";
    itens.push({
      id: a?.id_aviso ?? a?.id ?? null,
      titulo: String(a?.descricao ?? "aviso meteorológico"),
      severidade: String(a?.severidade ?? ""),
      cor: /^#[0-9a-f]{3,8}$/i.test(String(a?.aviso_cor ?? "")) ? a.aviso_cor : "#f2b03d",
      inicio: `${String(a?.data_inicio ?? "").slice(0, 10)} ${a?.hora_inicio ?? ""}`.trim(),
      fim: `${String(a?.data_fim ?? "").slice(0, 10)} ${a?.hora_fim ?? ""}`.trim(),
      riscos: Array.isArray(a?.riscos) ? a.riscos.map(String).slice(0, 3) : [],
      instrucoes: Array.isArray(a?.instrucoes) ? a.instrucoes.map(String).slice(0, 2) : [],
      abrangencia,
    });
  }
  return { disponivel: true, motivo: "", itens: itens.slice(0, 4), total: lista.length };
}

/* --------------------------------------------------------------- geocodificação */

/** Busca de cidades na Open-Meteo (language=pt). */
export async function buscarCidades(q) {
  const termo = String(q ?? "").trim();
  if (termo.length < 2) return [];
  try {
    const d = await pegar(montarUrlCidades(termo), 9000);
    const lista = Array.isArray(d?.results) ? d.results : [];
    return lista.map((r) => ({
      id: r.id,
      nome: r.name,
      pais: r.country_code ?? "",
      paisNome: r.country ?? "",
      uf: r.admin1 ?? "",
      lat: numero(r.latitude),
      lon: numero(r.longitude),
      populacao: numero(r.population) ?? 0,
      rotulo: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
    })).filter((c) => c.lat !== null && c.lon !== null);
  } catch {
    return [];
  }
}

/** Coordenadas -> cidade (BigDataCloud, sem chave, CORS aberto). */
export async function reverterCoordenadas(lat, lon) {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${arred2(lat)}&longitude=${arred2(lon)}&localityLanguage=pt`;
    const d = await pegar(url, 9000);
    const nome = d?.city || d?.locality || d?.principalSubdivision || "Minha localização";
    return { nome, uf: d?.principalSubdivision ?? "", pais: d?.countryCode ?? "", paisNome: d?.countryName ?? "" };
  } catch {
    return { nome: "Minha localização", uf: "", pais: "", paisNome: "" };
  }
}

/* ------------------------------------------------------------------ avisos */

async function buscarAvisosINMET({ lat, lon, uf, cidade }) {
  // Fora do Brasil o INMET não cobre nada: nem chamamos.
  if (uf && !/^[A-Z]{2}$/.test(String(uf).toUpperCase())) return null;
  try {
    const bruto = await pegar(INMET_URL, 9000);
    return normalizarAvisosINMET(bruto, { uf, cidade });
  } catch (e) {
    return {
      disponivel: false,
      motivo: "sem fonte de alertas disponível para esta região",
      itens: [],
      detalhe: String(e?.message ?? e).slice(0, 80),
    };
  }
}

/* --------------------------------------------------------------- carga principal */

/**
 * Carrega clima + ar + avisos para um ponto.
 * - Cache de 10 min, chave por lat/lon arredondado a 2 casas.
 * - Nunca lança: devolve { ok:false, erro, tipo } em falha.
 * - `unidade` só afeta o objeto devolvido, não a chave do cache (dado é métrico).
 */
export async function carregarClima({ lat, lon, unidade = "C", forcar = false, local = null, uf = "", pais = "" } = {}) {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
    return { ok: false, erro: "coordenadas inválidas", tipo: "parametros", unidade };
  }
  const un = unidade === "F" ? "F" : "C";

  if (!forcar) {
    const vivo = lerCache(la, lo);
    if (vivo) {
      return {
        ...vivo.dados,
        unidade: un,
        doCache: true,
        atualizadoEm: new Date(vivo.em).toISOString(),
      };
    }
  }

  const [previsao, ar] = await Promise.allSettled([
    pegar(montarUrlPrevisao(la, lo)),
    pegar(montarUrlAr(la, lo), 9000),
  ]);

  if (previsao.status !== "fulfilled") {
    const velho = lerCacheVencido(la, lo);
    if (velho) {
      return {
        ...velho.dados,
        unidade: un,
        doCache: true,
        desatualizado: true,
        offline: true,
        atualizadoEm: new Date(velho.em).toISOString(),
        erro: "sem conexão com o serviço de clima; mostrando a última leitura",
        tipo: "rede",
      };
    }
    return {
      ok: false,
      erro: "não consegui falar com o serviço de clima (rede ou bloqueio do navegador)",
      tipo: "rede",
      unidade: un,
    };
  }

  const base = normalizarPrevisao(previsao.value, { unidade: un, local });
  if (!base.ok) return { ...base, unidade: un };

  const qualidade = ar.status === "fulfilled" ? normalizarAr(ar.value) : null;
  const avisos = pais && String(pais).toUpperCase() !== "BR"
    ? { disponivel: false, motivo: "sem fonte de alertas disponível para esta região", itens: [] }
    : await buscarAvisosINMET({ lat: la, lon: lo, uf, cidade: local?.nome ?? "" });

  const urlPrevisao = montarUrlPrevisao(la, lo);
  const urlAr = montarUrlAr(la, lo);
  const fontes = [
    { nome: FONTES.previsao.nome, url: urlPrevisao },
    ...(qualidade ? [{ nome: FONTES.ar.nome, url: urlAr }] : []),
    ...(avisos?.disponivel ? [{ nome: FONTES.inmet.nome, url: FONTES.inmet.url }] : []),
  ];

  const dados = {
    ...base,
    unidade: un,
    ar: qualidade,
    avisos,
    fontes,
    atualizadoEm: new Date().toISOString(),
    doCache: false,
  };
  gravarCache(la, lo, dados);
  return dados;
}

/** Só qualidade do ar (widget dedicado). Mesmo cache de 10 min, chave "ar". */
export async function carregarAr({ lat, lon, forcar = false } = {}) {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return { ok: false, erro: "coordenadas inválidas" };
  const chaveLat = la;
  const chaveLon = lo;
  if (!forcar) {
    const vivo = lerCache(chaveLat, chaveLon);
    if (vivo?.dados?.ar) {
      return { ok: true, ar: vivo.dados.ar, atualizadoEm: new Date(vivo.em).toISOString(), doCache: true, fontes: [{ nome: FONTES.ar.nome, url: montarUrlAr(la, lo) }] };
    }
  }
  try {
    const bruto = await pegar(montarUrlAr(la, lo), 9000);
    const ar = normalizarAr(bruto);
    if (!ar) return { ok: false, erro: "o serviço de qualidade do ar não devolveu dados" };
    const vivo = lerCache(chaveLat, chaveLon);
    if (vivo?.dados) gravarCache(chaveLat, chaveLon, { ...vivo.dados, ar });
    return { ok: true, ar, atualizadoEm: new Date().toISOString(), doCache: false, fontes: [{ nome: FONTES.ar.nome, url: montarUrlAr(la, lo) }] };
  } catch (e) {
    return { ok: false, erro: "qualidade do ar indisponível agora", detalhe: String(e?.message ?? e).slice(0, 80) };
  }
}
