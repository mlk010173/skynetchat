import { useMemo, useState } from "react";

/** Cartão de clima com gráfico interativo (arraste o dedo/mouse para ler cada hora). */
export default function ClimaCard({ dados }) {
  const [modo, setModo] = useState("temp");
  const [ativo, setAtivo] = useState(-1);
  const horas = Array.isArray(dados?.horas) ? dados.horas : [];
  const agora = dados?.agora ?? {};
  const hoje = dados?.hoje ?? {};

  const serie = horas.map((h) => (modo === "temp" ? h.temp : modo === "chuva" ? h.chuva : h.vento));
  const min = Math.min(...serie, 0);
  const max = Math.max(...serie, 1);
  const L = 320, A = 110, P = 8;
  const ponto = (v, i) => {
    const x = P + (i * (L - 2 * P)) / Math.max(1, serie.length - 1);
    const y = A - P - ((v - min) / Math.max(1, max - min)) * (A - 2 * P);
    return [x, y];
  };
  const linha = serie.map((v, i) => `${i === 0 ? "M" : "L"}${ponto(v, i).join(",")}`).join(" ");
  const area = `${linha} L${ponto(serie[serie.length - 1] ?? 0, serie.length - 1)[0]},${A - P} L${P},${A - P} Z`;
  const destaque = ativo >= 0 ? horas[ativo] : null;
  const cor = modo === "temp" ? "#ff5757" : modo === "chuva" ? "#38bdf8" : "#a3e635";
  const unidade = modo === "temp" ? "°C" : modo === "chuva" ? "%" : " km/h";

  const resumo = useMemo(() => {
    if (!serie.length) return "";
    const maxS = Math.max(...serie), minS = Math.min(...serie);
    return `mín ${minS}${unidade} · máx ${maxS}${unidade}`;
  }, [serie, unidade]);

  function mover(e) {
    const caixa = e.currentTarget.getBoundingClientRect();
    const x = (e.touches?.[0]?.clientX ?? e.clientX) - caixa.left;
    const i = Math.round(((x / caixa.width) * (serie.length - 1)));
    setAtivo(Math.max(0, Math.min(serie.length - 1, i)));
  }

  return (
    <div className="clima-card">
      <div className="clima-topo">
        <div>
          <p className="clima-cidade">{dados?.cidade}{dados?.pais ? ` · ${dados.pais}` : ""}</p>
          <p className="clima-temp">{agora.temp}°<span>{agora.descricao}</span></p>
        </div>
        <div className="clima-nums">
          <span>máx <b>{hoje.max}°</b></span>
          <span>mín <b>{hoje.min}°</b></span>
          <span>umid. <b>{agora.umidade}%</b></span>
          <span>vento <b>{agora.vento} km/h</b></span>
        </div>
      </div>

      <div className="clima-abas">
        {[["temp", "Temperatura"], ["chuva", "Chuva"], ["vento", "Vento"]].map(([k, rotulo]) => (
          <button key={k} type="button" className={modo === k ? "ativo" : ""} onClick={() => { setModo(k); setAtivo(-1); }}>
            {rotulo}
          </button>
        ))}
        <span className="clima-resumo">{destaque ? `${destaque.hora} · ${serie[ativo]}${unidade}` : resumo}</span>
      </div>

      <div className="clima-grafico" onMouseMove={mover} onTouchMove={mover} onMouseLeave={() => setAtivo(-1)}>
        <svg viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" role="img" aria-label={`Gráfico de ${modo} nas próximas 24 horas`}>
          <defs>
            <linearGradient id="climaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cor} stopOpacity="0.45" />
              <stop offset="100%" stopColor={cor} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={P} x2={L - P} y1={A * f} y2={A * f} className="clima-grade" />
          ))}
          <path d={area} fill="url(#climaGrad)" className="clima-area" />
          <path d={linha} fill="none" stroke={cor} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="clima-linha" />
          {ativo >= 0 && (
            <>
              <line x1={ponto(serie[ativo], ativo)[0]} x2={ponto(serie[ativo], ativo)[0]} y1={P} y2={A - P} className="clima-guia" />
              <circle cx={ponto(serie[ativo], ativo)[0]} cy={ponto(serie[ativo], ativo)[1]} r="4.5" fill={cor} className="clima-ponto" />
            </>
          )}
        </svg>
        <div className="clima-horas">
          {horas.filter((_, i) => i % 4 === 0).map((h) => <span key={h.hora}>{h.hora}</span>)}
        </div>
      </div>

      {Array.isArray(dados?.dias) && dados.dias.length > 1 && (
        <div className="clima-dias">
          {dados.dias.slice(0, 5).map((d) => (
            <div key={d.data} className="clima-dia">
              <span>{new Date(`${d.data}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</span>
              <b>{d.max}°</b>
              <i>{d.min}°</i>
              <em>{d.chuva}%</em>
            </div>
          ))}
        </div>
      )}
      <p className="clima-fonte">Dados ao vivo · {dados?.fonte ?? "Open-Meteo"} · nascer {hoje.nascer} · pôr {hoje.por}</p>
    </div>
  );
}
