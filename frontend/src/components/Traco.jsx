// SKYNET · traço de streaming na interface.
// Mostra, em tempo real, o que o agente está fazendo: pensando, pesquisando,
// fontes, analisando, gerando, código, arquivos e links. Recolhe sozinho
// quando a resposta termina e pode ser reaberto para conferir.
import { useEffect, useState } from "react";
import { duracao, listaTraco, resumoTraco } from "../traco.js";

const iconeEstado = (estado) => {
  if (estado === "concluido") return "✓";
  if (estado === "erro") return "!";
  return "";
};

export default function Traco({ traco, aoVivo = false, abertoInicial = true }) {
  const [aberto, setAberto] = useState(abertoInicial);
  const [agora, setAgora] = useState(Date.now());

  useEffect(() => {
    if (!aoVivo) return undefined;
    const t = setInterval(() => setAgora(Date.now()), 500);
    return () => clearInterval(t);
  }, [aoVivo]);

  useEffect(() => {
    setAberto(aoVivo);
  }, [aoVivo]);

  const grupos = listaTraco(traco);
  if (!grupos.length) return null;

  const total = traco.fim ? duracao(traco) : Math.max(duracao(traco), Math.round((agora - traco.inicio) / 1000));
  const ativo = grupos.find((g) => g.estado === "ativo");

  return (
    <section className={`traco${aoVivo ? " vivo" : ""}`} aria-label="o que está acontecendo">
      <button type="button" className="traco-topo" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
        <span className="traco-pulso" aria-hidden="true" />
        <b>{aberto ? (ativo ? ativo.rotulo : "Concluído") : resumoTraco(traco)}</b>
        <span className="traco-tempo">{total}s</span>
        <span className="traco-seta" aria-hidden="true">{aberto ? "▾" : "▸"}</span>
      </button>

      {aberto ? (
        <ol className="traco-lista">
          {grupos.map((g) => (
            <li key={g.chave} className={`traco-item ${g.estado}`}>
              <span className="traco-icone" aria-hidden="true">{g.icone}</span>
              <div className="traco-corpo">
                <div className="traco-linha">
                  <b>{g.rotulo}</b>
                  {g.estado === "ativo" ? <span className="traco-ondas" aria-hidden="true"><i /><i /><i /></span> : null}
                  <em>{iconeEstado(g.estado)}</em>
                  {g.segundos >= 1 ? <small>{g.segundos}s</small> : null}
                </div>
                {g.detalhe ? <p className="traco-detalhe">{g.detalhe}</p> : null}

                {g.itens.length ? (
                  <div className={`traco-itens traco-itens-${g.chave}`}>
                    {g.itens.slice(0, 6).map((item, i) => {
                      const rotulo = item.titulo || item.dominio || item.url || "item";
                      return item.url ? (
                        <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" title={rotulo}>
                          {g.chave === "fontes" && item.dominio ? (
                            <img
                              className="traco-favicon"
                              src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(item.dominio)}&sz=32`}
                              alt=""
                              loading="lazy"
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          ) : null}
                          <span>{String(rotulo).slice(0, 52)}</span>
                        </a>
                      ) : (
                        <span key={i}>{String(rotulo).slice(0, 52)}</span>
                      );
                    })}
                    {g.itens.length > 6 ? <small className="traco-mais">+{g.itens.length - 6}</small> : null}
                  </div>
                ) : null}

                {g.chave === "codigo" && g.estado === "ativo" ? (
                  <div className="traco-codigo" aria-hidden="true">
                    <i /><i /><i />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
