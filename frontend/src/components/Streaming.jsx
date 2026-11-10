// SKYNET · componentes do streaming.
// Cada peça aqui é burra de propósito: recebe estado já resolvido pelo
// gerenciador de eventos (src/eventos.js) e desenha. Nenhum componente inventa
// etapa, fonte ou número.
import { useState } from "react";
import {
  IconBell, IconBook, IconBrain, IconChevron, IconCode, IconFolder,
  IconImage, IconPlus, IconTheme, IconZap, IconClose,
} from "./Icons.jsx";

// ícones próprios do painel (mesmo traço 1.6 dos ícones do app)
const svgBase = {
  width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true",
};
const Lupa = (p) => (
  <svg {...svgBase} {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.2-4.2" /></svg>
);
const Check = (p) => (
  <svg {...svgBase} {...p}><path d="M20 6L9 17l-5-5" /></svg>
);
const Caneta = (p) => (
  <svg {...svgBase} {...p}><path d="M4 20h4l10-10a2.1 2.1 0 0 0-3-3L5 17z" /><path d="M14 7l3 3" /></svg>
);
const Engrenagem = (p) => (
  <svg {...svgBase} {...p}><circle cx="12" cy="12" r="3" /><path d="M12 3v2m0 14v2M4.2 7.5l1.7 1M18.1 15.5l1.7 1M4.2 16.5l1.7-1M18.1 8.5l1.7-1" /></svg>
);
const Faisca = (p) => (
  <svg {...svgBase} {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>
);

const ICONES = {
  brain: IconBrain,
  search: Lupa,
  book: IconBook,
  folder: IconFolder,
  image: IconImage,
  code: IconCode,
  gear: Engrenagem,
  pen: Caneta,
  check: Check,
  spark: Faisca,
};

const Seta = ({ aberto }) => (
  <IconChevron className={`st-seta${aberto ? " girada" : ""}`} width={13} height={13} aria-hidden="true" />
);

const IconeDe = ({ nome, className = "st-icone" }) => {
  const Cmp = ICONES[nome] || IconZap;
  return <Cmp className={className} width={14} height={14} aria-hidden="true" />;
};

/* ------------------------------------------------------------------ status */
export function StreamingStatus({ fase, segundos = 0, erro, incompleto }) {
  const mapa = {
    ocioso: { texto: "aguardando", tom: "neutro" },
    iniciando: { texto: "iniciando", tom: "ativo" },
    gerando: { texto: "gerando", tom: "ativo" },
    concluido: { texto: "concluído", tom: "ok" },
    incompleto: { texto: "incompleta", tom: "aviso" },
    falhou: { texto: "falhou", tom: "erro" },
    erro: { texto: "interrompida", tom: "erro" },
  };
  const { texto, tom } = mapa[fase] || mapa.ocioso;
  return (
    <span className={`st-status ${tom}`} role="status" aria-live="polite">
      <i className="st-ponto" aria-hidden="true" />
      {texto}
      {segundos > 0 && <small>{segundos}s</small>}
      {(erro || incompleto) && <span className="st-motivo">{erro || "resposta incompleta"}</span>}
    </span>
  );
}

/* --------------------------------------------------------------- pensando */
export function ThinkingIndicator({ rotulo = "Pensando", detalhe, ativo = true }) {
  return (
    <span className={`st-pensando${ativo ? " ativo" : ""}`}>
      <span className="st-pontos" aria-hidden="true"><i /><i /><i /></span>
      <b>{rotulo}</b>
      {detalhe && <small>{detalhe}</small>}
    </span>
  );
}

/* ----------------------------------------------------------------- linha do tempo */
export function ActivityTimeline({ atividades = [], aoAbrirFonte, resumo, fontes = [], arquivos = [], codigo = [] }) {
  const [aberto, setAberto] = useState(false);
  if (!atividades.length) return null;
  const ativa = atividades.find((a) => a.estado === "ativo");
  const segundos = atividades.reduce((acc, a) => acc + (a.segundos || 0), 0);

  return (
    <section className={`st-linha${ativa ? " viva" : ""}`} aria-label="atividades da resposta">
      <button
        type="button"
        className="st-linha-topo"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        <IconeDe nome={ativa ? ativa.icone : "check"} />
        <b>{ativa ? ativa.rotulo : resumo || "Resposta concluída"}</b>
        {ativa && <ThinkingIndicator rotulo="" ativo />}
        <span className="st-tempo">{segundos}s</span>
        <Seta aberto={aberto} />
      </button>

      {aberto && (
        <ol className="st-linha-lista">
          {atividades.map((a, i) => (
            <li key={`${a.chave}-${i}`} className={`st-etapa ${a.estado}`}>
              <span className="st-etapa-marca">
                <IconeDe nome={a.icone} />
              </span>
              <div className="st-etapa-corpo">
                <div className="st-etapa-linha">
                  <b>{a.rotulo}</b>
                  {a.estado === "ativo" && <span className="st-ondas" aria-hidden="true"><i /><i /><i /></span>}
                  {a.estado === "concluido" && <em className="st-visto" aria-label="concluída">✓</em>}
                  {a.estado === "erro" && <em className="st-falhou" aria-label="falhou">!</em>}
                  {a.segundos >= 1 && <small>{a.segundos}s</small>}
                </div>
                {a.detalhe && <p>{a.detalhe}</p>}
                {a.chave === "pesquisando" && (
                  <SearchProgress fontes={fontes} consultados={a.itens?.length || 0} ativo={a.estado === "ativo"} />
                )}
                {a.chave === "arquivos" && (a.itens?.length || arquivos.length) ? (
                  <FileAnalysisStatus arquivos={a.itens?.length ? a.itens : arquivos} />
                ) : null}
                {a.chave === "codigo" && (codigo.length || a.itens?.length) ? (
                  <CodeExecutionStatus
                    linguagem={a.detalhe || "código"}
                    saida={(a.itens || []).map((i) => i.titulo).join("\n")}
                    estado={a.estado === "ativo" ? "executando" : a.estado === "erro" ? "erro" : "concluido"}
                  />
                ) : null}
                {a.itens?.length ? (
                  <div className="st-etapa-itens">
                    {a.itens.slice(0, 6).map((item) => (
                      <button
                        key={item.url}
                        type="button"
                        className="st-item"
                        onClick={() => aoAbrirFonte?.(item)}
                      >
                        <span className="st-item-n">{item.indice}</span>
                        <span>{item.titulo}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ pesquisa */
export function SearchProgress({ fontes = [], consultados = 0, ativo = false }) {
  if (!ativo && !fontes.length) return null;
  return (
    <div className={`st-busca${ativo ? " ativa" : ""}`} role="status">
      <span className="st-busca-ico" aria-hidden="true">
        <span className="st-pontos"><i /><i /><i /></span>
      </span>
      <b>{ativo ? "Pesquisando na internet" : `${fontes.length} fonte${fontes.length === 1 ? "" : "s"} consultada${fontes.length === 1 ? "" : "s"}`}</b>
      {consultados > 0 && <small>{consultados} páginas lidas</small>}
      {fontes.length > 0 && (
        <span className="st-busca-favs" aria-hidden="true">
          {fontes.slice(0, 5).map((f) => (
            <img key={f.url} src={f.favicon} alt="" width={13} height={13} loading="lazy" />
          ))}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- fontes */
export function SourcesPanel({ fontes = [], abertoInicial = false }) {
  const [aberto, setAberto] = useState(abertoInicial);
  if (!fontes.length) return null;
  return (
    <section className="st-fontes" aria-label="fontes consultadas">
      <button type="button" className="st-fontes-topo" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
        <IconBook width={14} height={14} aria-hidden="true" />
        <b>{fontes.length} fonte{fontes.length === 1 ? "" : "s"}</b>
        <span className="st-fontes-dominios">
          {[...new Set(fontes.map((f) => f.dominio))].slice(0, 3).join(" · ")}
        </span>
        <Seta aberto={aberto} />
      </button>
      {aberto && (
        <ol className="st-fontes-lista">
          {fontes.map((f) => (
            <li key={f.url}>
              <a href={f.url} target="_blank" rel="noopener noreferrer">
                <span className="st-fonte-n">{f.indice}</span>
                <img src={f.favicon} alt="" width={14} height={14} loading="lazy" />
                <span className="st-fonte-txt">
                  <b>{f.titulo}</b>
                  <small>{f.dominio}</small>
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* --------------------------------------------------------------- citação [n] */
export function CitationReference({ indice, fonte, aoAbrir }) {
  if (!fonte) return <sup className="st-cite orfa">[{indice}]</sup>;
  return (
    <sup className="st-cite">
      <a
        href={fonte.url}
        target="_blank"
        rel="noopener noreferrer"
        title={`${fonte.titulo} · ${fonte.dominio}`}
        onClick={() => aoAbrir?.(fonte)}
      >
        {indice}
      </a>
    </sup>
  );
}

/* ------------------------------------------------------------ arquivos/código */
export function FileAnalysisStatus({ arquivos = [] }) {
  if (!arquivos.length) return null;
  return (
    <ul className="st-arquivos">
      {arquivos.map((a, i) => (
        <li key={`${a.nome}-${i}`}>
          <IconFolder width={13} height={13} aria-hidden="true" />
          <b>{a.nome || "arquivo"}</b>
          {a.estado && <small className={a.estado}>{a.estado === "lido" ? "lido" : a.estado}</small>}
        </li>
      ))}
    </ul>
  );
}

export function CodeExecutionStatus({ linguagem, codigo = "", saida, estado = "concluido" }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className={`st-codigo ${estado}`}>
      <button type="button" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
        <IconCode width={13} height={13} aria-hidden="true" />
        <b>{linguagem || "código"}</b>
        <span className="st-codigo-estado">{estado === "ativo" ? "executando" : estado === "erro" ? "falhou" : "executado"}</span>
        <Seta aberto={aberto} />
      </button>
      {aberto && (
        <>
          <pre className="st-codigo-fonte"><code>{codigo}</code></pre>
          {saida ? <pre className="st-codigo-saida">{saida}</pre> : null}
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- stream/resposta */
export function ResponseStream({ children, vivo = false, incompleto = false }) {
  return (
    <div className={`st-resposta${vivo ? " viva" : ""}${incompleto ? " cortada" : ""}`}>
      {children}
      {vivo && <span className="st-cursor" aria-hidden="true" />}
      {incompleto && <p className="st-cortada-aviso">A resposta parou antes do fim.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ controles */
export function GenerationControls({
  gerando = false,
  podeContinuar = false,
  aoParar,
  aoContinuar,
  aoCopiar,
  aoRegenerar,
  aoAvaliar,
  avaliacao = null,
  aoAbrirFontes,
  temFontes = false,
  aoExpandir,
}) {
  return (
    <div className="st-controles" role="group" aria-label="controles da resposta">
      {gerando ? (
        <button type="button" className="st-ctrl parar" onClick={aoParar}>
          <IconClose width={12} height={12} aria-hidden="true" /> interromper
        </button>
      ) : (
        <>
          <button type="button" className="st-ctrl" onClick={aoCopiar}>copiar</button>
          {podeContinuar && <button type="button" className="st-ctrl" onClick={aoContinuar}>continuar</button>}
          <button type="button" className="st-ctrl" onClick={aoRegenerar}>regenerar</button>
          <span className="st-votos">
            <button
              type="button"
              className={avaliacao === "util" ? "on" : ""}
              aria-label="resposta útil"
              aria-pressed={avaliacao === "util"}
              onClick={() => aoAvaliar?.("util")}
            >▲</button>
            <button
              type="button"
              className={avaliacao === "ruim" ? "on" : ""}
              aria-label="resposta ruim"
              aria-pressed={avaliacao === "ruim"}
              onClick={() => aoAvaliar?.("ruim")}
            >▼</button>
          </span>
          {temFontes && <button type="button" className="st-ctrl" onClick={aoAbrirFontes}>fontes</button>}
          {aoExpandir && <button type="button" className="st-ctrl" onClick={aoExpandir}>atividades</button>}
        </>
      )}
    </div>
  );
}

export default {
  StreamingStatus,
  ThinkingIndicator,
  ActivityTimeline,
  SearchProgress,
  SourcesPanel,
  CitationReference,
  FileAnalysisStatus,
  CodeExecutionStatus,
  ResponseStream,
  GenerationControls,
};
