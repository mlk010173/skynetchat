// SKYNET · gravação de voz no campo de mensagem: onda sonora ao vivo,
// pausa/retomada, cancelamento e audição antes de usar.
import { duracaoLegivel } from "../gravador.js";

export function OndaSonora({ niveis = [], pausado = false, gravando = true }) {
  const barras = niveis.length ? niveis : new Array(28).fill(0.05);
  return (
    <span className={`onda${pausado ? " pausada" : ""}${gravando ? "" : " parada"}`} aria-hidden="true">
      {barras.slice(-28).map((v, i) => (
        <i key={i} style={{ height: `${Math.max(12, Math.round(v * 100))}%` }} />
      ))}
    </span>
  );
}

export default function GravacaoAudio({
  gravando,
  pausado,
  segundos,
  niveis,
  url,
  aoPausar,
  aoRetomar,
  aoParar,
  aoCancelar,
  aoUsar,
  aoDescartar,
}) {
  if (url) {
    return (
      <div className="gravacao previa" role="group" aria-label="áudio gravado">
        <audio src={url} controls preload="metadata" aria-label="ouça antes de usar" />
        <div className="gravacao-acoes">
          <button type="button" className="gg" onClick={aoDescartar}>descartar</button>
          <button type="button" className="gp" onClick={aoUsar}>usar áudio</button>
        </div>
      </div>
    );
  }
  if (!gravando) return null;
  return (
    <div className={`gravacao${pausado ? " pausada" : ""}`} role="group" aria-label="gravando áudio">
      <b className="rec-dot" aria-hidden="true" />
      <span className="rec-time">{duracaoLegivel(segundos)}</span>
      <OndaSonora niveis={niveis} pausado={pausado} />
      <button type="button" className="ga" aria-label={pausado ? "continuar" : "pausar"} onClick={pausado ? aoRetomar : aoPausar}>
        {pausado ? "▶" : "❚❚"}
      </button>
      <button type="button" className="ga" aria-label="concluir gravação" onClick={aoParar}>■</button>
      <button type="button" className="gx" aria-label="cancelar gravação" onClick={aoCancelar}>✕</button>
      {pausado && <span className="rec-aviso">pausado</span>}
    </div>
  );
}
