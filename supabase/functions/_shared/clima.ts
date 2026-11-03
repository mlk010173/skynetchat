// Clima com dados estruturados (Open-Meteo, sem chave) para gráfico interativo.
export type Hora = { hora: string; temp: number; chuva: number; vento: number };
export type Clima = {
  ok: boolean;
  cidade?: string;
  pais?: string;
  agora?: { temp: number; sensacao: number; umidade: number; vento: number; codigo: number; descricao: string };
  horas?: Hora[];
  hoje?: { min: number; max: number; nascer: string; por: string; chuva_max: number };
  dias?: { data: string; min: number; max: number; chuva: number }[];
  fonte?: string;
  erro?: string;
};

const TEMPO: Record<number, string> = {
  0: "céu limpo", 1: "quase limpo", 2: "parcialmente nublado", 3: "nublado",
  45: "névoa", 48: "névoa com geada", 51: "garoa fraca", 53: "garoa", 55: "garoa forte",
  61: "chuva fraca", 63: "chuva", 65: "chuva forte", 71: "neve fraca", 73: "neve", 75: "neve forte",
  80: "pancadas fracas", 81: "pancadas", 82: "pancadas fortes", 95: "trovoada", 96: "trovoada com granizo", 99: "trovoada forte",
};

export async function buscarClima(cidade: string): Promise<Clima> {
  const nome = String(cidade || "").trim() || "São Paulo";
  try {
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nome)}&count=1&language=pt&format=json`,
      { signal: AbortSignal.timeout(12000) },
    ).then((r) => r.json());
    const lugar = geo?.results?.[0];
    if (!lugar) return { ok: false, erro: `não encontrei a cidade "${nome}"` };

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lugar.latitude}&longitude=${lugar.longitude}` +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m" +
      "&hourly=temperature_2m,precipitation_probability,wind_speed_10m" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset" +
      "&timezone=auto&forecast_days=5";
    const d = await fetch(url, { signal: AbortSignal.timeout(15000) }).then((r) => r.json());
    if (!d?.current) return { ok: false, erro: "o serviço de clima não respondeu com dados" };

    const agora = d.current;
    const horas: Hora[] = [];
    const t: string[] = d.hourly?.time ?? [];
    const temp: number[] = d.hourly?.temperature_2m ?? [];
    const chuva: number[] = d.hourly?.precipitation_probability ?? [];
    const vento: number[] = d.hourly?.wind_speed_10m ?? [];
    const inicio = Math.max(0, t.findIndex((h) => h >= String(agora.time).slice(0, 13) + ":00"));
    for (let i = inicio; i < Math.min(inicio + 24, t.length); i++) {
      horas.push({
        hora: String(t[i]).slice(11, 16),
        temp: Math.round(Number(temp[i] ?? 0)),
        chuva: Number(chuva[i] ?? 0),
        vento: Math.round(Number(vento[i] ?? 0)),
      });
    }
    const dias = (d.daily?.time ?? []).map((data: string, i: number) => ({
      data,
      min: Math.round(Number(d.daily.temperature_2m_min?.[i] ?? 0)),
      max: Math.round(Number(d.daily.temperature_2m_max?.[i] ?? 0)),
      chuva: Number(d.daily.precipitation_probability_max?.[i] ?? 0),
    }));
    return {
      ok: true,
      cidade: lugar.name,
      pais: lugar.country_code ?? lugar.country ?? "",
      agora: {
        temp: Math.round(Number(agora.temperature_2m)),
        sensacao: Math.round(Number(agora.apparent_temperature)),
        umidade: Math.round(Number(agora.relative_humidity_2m)),
        vento: Math.round(Number(agora.wind_speed_10m)),
        codigo: Number(agora.weather_code ?? 0),
        descricao: TEMPO[Number(agora.weather_code ?? 0)] ?? "tempo estável",
      },
      horas,
      hoje: dias[0]
        ? {
            min: dias[0].min,
            max: dias[0].max,
            chuva_max: dias[0].chuva,
            nascer: String(d.daily.sunrise?.[0] ?? "").slice(11, 16),
            por: String(d.daily.sunset?.[0] ?? "").slice(11, 16),
          }
        : undefined,
      dias,
      fonte: "Open-Meteo",
    };
  } catch (e) {
    return { ok: false, erro: String(e).slice(0, 120) };
  }
}
