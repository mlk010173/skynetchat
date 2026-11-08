// SKYNET · artefatos no chat: widgets montados a partir de dados reais.
// `Artefato` renderiza a spec; `montarArtefato` busca os dados quando o pedido
// pede notícias, vídeos, Instagram, fontes ou clima.
import { useCallback, useEffect, useMemo, useState } from "react";
import { clima, noticias, resumo, social, videos, web } from "./pesquisa.js";
import { pesquisarProfundo, relatorio } from "./agente.js";
import { cambio, cripto, github, hackernews, pacote, papers, stackoverflow } from "./fontes-extra.js";
import { agruparDuplicados, convergencia, resumoTldr, verificarLinks } from "./habilidades.js";
import { lerConfig } from "./agente-config.js";
import "./artefatos.css";

const limpar = (t) => String(t == null ? "" : t).replace(/\s+/g, " ").trim();
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const url = (u) => (/^https?:\/\//i.test(String(u || "")) ? String(u) : "");

const TIPO_DOMINIO = (host) => {
  const h = String(host || "");
  if (/(\.gov|governo|gov\.br|\.leg\.br|\.jus\.br)/.test(h)) return { rotulo: "oficial", classe: "oficial" };
  if (/(\.edu|arxiv|nature|sciencedirect|pubmed|doi\.org|\.org\.br)/.test(h)) return { rotulo: "acadêmico", classe: "academico" };
  if (/(reuters|apnews|bbc|folha|estadao|oglobo|g1\.globo|poder360|nexo|veja|exame|infoMoney|valor)/i.test(h)) return { rotulo: "imprensa", classe: "imprensa" };
  if (/(github|gitlab|docs\.|readthedocs|developer\.)/.test(h)) return { rotulo: "técnico", classe: "tecnico" };
  return { rotulo: "web", classe: "web" };
};

const tempoLeitura = (texto) => {
  const palavras = String(texto || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(palavras / 200));
};

const tempoRelativo = (valor) => {
  const t = typeof valor === "number" ? valor : Date.parse(valor || "");
  if (!t || Number.isNaN(t)) return "";
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
};

const baixar = (nome, conteudo, tipo = "text/markdown") => {
  const blob = new Blob([conteudo], { type: `${tipo};charset=utf-8` });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

const markdownDoDossie = (spec) => {
  const linhas = [`# ${spec.titulo || "Dossiê"}`];
  if (spec.subtitulo) linhas.push(`_${spec.subtitulo}_`);
  if (spec.plano) linhas.push(`\nFrentes: ${spec.plano.map((f) => `${f.chave} — ${f.pergunta}`).join("; ")}`);
  linhas.push("");
  (spec.itens || []).forEach((f, i) => {
    linhas.push(`${i + 1}. **${f.titulo}** — ${host(f.url)}`);
    if (f.excerto) linhas.push(`   > ${f.excerto}`);
    else if (f.resumo) linhas.push(`   ${f.resumo}`);
    linhas.push(`   ${f.url}`);
  });
  linhas.push(`\nGerado por SKYNET em ${new Date().toLocaleString("pt-BR")}.`);
  return linhas.join("\n");
};

const Icone = ({ nome = "file", size = 16 }) => {
  const p = {
    news: "M4 5h11v14H4zM15 9h5v10h-5M7 8h5M7 11h5M7 14h5",
    video: "M3 6h13v12H3zM16 10l5-3v10l-5-3z",
    insta: "M4 4h16v16H4zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7M17 7h.01",
    fonte: "M4 4h10l6 6v10H4zM14 4v6h6",
    sol: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 2v2M12 20v2M2 12h2M20 12h2",
    nuvem: "M7 18a4 4 0 0 1 0-8 6 6 0 0 1 11.5 1.5A3.5 3.5 0 0 1 18 18z",
    chuva: "M7 15a4 4 0 0 1 0-8 6 6 0 0 1 11.5 1.5A3.5 3.5 0 0 1 18 15M8 19l-1 2M12 19l-1 2M16 19l-1 2",
    raio: "M13 2 5 14h6l-1 8 8-12h-6z",
    foto: "M3 5h18v14H3zM8 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4M21 16l-5-5-9 8",
  }[nome] || "M4 4h16v16H4z";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={p} />
    </svg>
  );
};

const Cabeca = ({ icone, titulo, sub, selo, metricas }) => (
  <header className="art-cabeca">
    <span className="art-icone"><Icone nome={icone} /></span>
    <span className="art-titulos">
      <strong>{titulo}</strong>
      {sub ? <small>{sub}</small> : null}
    </span>
    <span className="art-cabeca-dir">
      {(metricas || []).map((m, i) => (
        <span key={i} className="art-metrica" title={m.rotulo}>
          <b>{m.valor}</b>
          <small>{m.rotulo}</small>
        </span>
      ))}
      {selo ? <span className="art-selo">{selo}</span> : null}
    </span>
  </header>
);

function Noticias({ spec }) {
  const itens = spec.itens || [];
  return (
    <div className="art-noticias">
      {itens.map((n, i) => {
        const dominio = host(n.url);
        const quando = tempoRelativo(n.data || n.quando);
        return (
          <a key={i} className="art-noticia" href={url(n.url)} target="_blank" rel="noopener noreferrer">
            <span className="art-noticia-meta">
              <img
                className="art-favicon"
                src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(dominio)}&sz=64`}
                alt=""
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
              {[n.fonte || dominio].filter(Boolean).join(" · ")}
              {quando ? ` · ${quando}` : ""}
            </span>
            <b>{limpar(n.titulo)}</b>
            {n.resumo ? <span className="art-noticia-resumo">{limpar(n.resumo)}</span> : null}
          </a>
        );
      })}
    </div>
  );
}

function Videos({ spec }) {
  const itens = spec.itens || [];
  return (
    <div className="art-videos">
      {itens.map((v, i) => (
        <a key={i} className="art-video" href={url(v.url)} target="_blank" rel="noopener noreferrer">
          <span className="art-video-thumb">
            <img src={v.thumb} alt="" loading="lazy" />
            {v.duracao ? <em>{v.duracao}</em> : null}
          </span>
          <span className="art-video-info">
            <b>{limpar(v.titulo)}</b>
            <small>{limpar(v.canal)}</small>
            {v.meta ? <small className="art-video-meta">{limpar(v.meta)}</small> : null}
          </span>
        </a>
      ))}
    </div>
  );
}

function Social({ spec }) {
  const itens = spec.itens || [];
  const [aberto, setAberto] = useState(-1);
  return (
    <div className="art-social">
      {itens.map((s, i) => (
        <div key={i} className="art-ig">
          <div className="art-ig-topo">
            <span className="art-ig-avatar">{(s.usuario || "?")[0].toUpperCase()}</span>
            <div className="art-ig-id">
              <b>@{limpar(s.usuario)}</b>
              <small>{s.tipo === "perfil" ? "perfil público" : s.tipo === "reel" ? "reel" : "publicação"}</small>
            </div>
            <a className="art-ig-link" href={url(s.url)} target="_blank" rel="noopener noreferrer">abrir</a>
          </div>
          {s.resumo ? <p className="art-ig-resumo">{limpar(s.resumo)}</p> : null}
          {s.embed ? (
            aberto === i ? (
              <div className="art-ig-embed">
                <iframe src={s.embed} title={`Instagram de @${s.usuario}`} loading="lazy" scrolling="no" />
              </div>
            ) : (
              <button type="button" className="art-ig-btn" onClick={() => setAberto(i)}>Ver no chat</button>
            )
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Fontes({ spec }) {
  const itens = spec.itens || [];
  const [aberto, setAberto] = useState({});
  const [dominio, setDominio] = useState("todos");
  const [ordem, setOrdem] = useState("relevancia");
  const [planoAberto, setPlanoAberto] = useState(false);
  const [links, setLinks] = useState(null);
  const [checando, setChecando] = useState(false);
  const cfg = useMemo(() => lerConfig(), []);

  const tldr = useMemo(() => (cfg.resumoExecutivo !== false ? resumoTldr(itens, spec.titulo) : null), [itens, cfg.resumoExecutivo, spec.titulo]);
  const consenso = useMemo(() => (cfg.compararFontes !== false ? convergencia(itens) : []), [itens, cfg.compararFontes]);
  const repetidos = useMemo(() => {
    if (cfg.deduplicar === false) return {};
    const mapa = {};
    agruparDuplicados(itens).forEach((grupo) => {
      if (grupo.length > 1) grupo.forEach((i) => { mapa[i] = grupo.length; });
    });
    return mapa;
  }, [itens, cfg.deduplicar]);

  const checarLinks = useCallback(async () => {
    if (checando || !itens.length) return;
    setChecando(true);
    const r = await verificarLinks(itens);
    setLinks(r);
    setChecando(false);
  }, [checando, itens]);

  useEffect(() => {
    if (cfg.verificarLinks === false) return;
    if (!itens.length || links || checando) return;
    const t = setTimeout(() => { checarLinks(); }, 900);
    return () => clearTimeout(t);
  }, [cfg.verificarLinks, itens, links, checando, checarLinks]);

  const dominios = useMemo(() => {
    const contagem = new Map();
    itens.forEach((f) => {
      const d = host(f.url);
      contagem.set(d, (contagem.get(d) || 0) + 1);
    });
    return [...contagem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [itens]);

  const visiveis = useMemo(() => {
    let lista = dominio === "todos" ? itens : itens.filter((f) => host(f.url) === dominio);
    if (ordem === "recentes") {
      lista = [...lista].sort((a, b) => (b.quando || 0) - (a.quando || 0));
    } else if (ordem === "alfabetica") {
      lista = [...lista].sort((a, b) => limpar(a.titulo).localeCompare(limpar(b.titulo), "pt-BR"));
    }
    return lista;
  }, [itens, dominio, ordem]);

  const todosAbertos = visiveis.every((_, i) => aberto[i]);
  const metricas = spec.metricas || [];

  return (
    <div className="art-dossie">
      {tldr && tldr.linhas.length ? (
        <div className="art-tldr">
          <h4>resumo executivo</h4>
          <ul>
            {tldr.linhas.map((l, i) => (
              <li key={i}>{limpar(l.texto)}</li>
            ))}
          </ul>
          {tldr.numeros.length ? (
            <div className="art-tldr-nums">
              {tldr.numeros.map((n, i) => <em key={i}>{n}</em>)}
            </div>
          ) : null}
        </div>
      ) : null}

      {consenso.length ? (
        <div className="art-consenso">
          <b>aparece em vários veículos</b>
          {consenso.map((c) => (
            <em key={c.termo} title={c.dominios.join(" · ")}>{c.termo}</em>
          ))}
        </div>
      ) : null}

      {metricas.length ? (
        <div className="art-metricas">
          {metricas.map((m, i) => (
            <div key={i} className="art-metrica-card">
              <b>{m.valor}</b>
              <small>{m.rotulo}</small>
            </div>
          ))}
        </div>
      ) : null}

      <div className="art-controles">
        <div className="art-filtros">
          <button type="button" className={dominio === "todos" ? "on" : ""} onClick={() => setDominio("todos")}>
            todos <i>{itens.length}</i>
          </button>
          {dominios.map(([d, n]) => (
            <button key={d} type="button" className={dominio === d ? "on" : ""} onClick={() => setDominio(d)}>
              {d} <i>{n}</i>
            </button>
          ))}
        </div>
        <div className="art-acoes">
          <select value={ordem} onChange={(e) => setOrdem(e.target.value)} aria-label="ordenar fontes">
            <option value="relevancia">relevância</option>
            <option value="recentes">mais recentes</option>
            <option value="alfabetica">A–Z</option>
          </select>
          <button type="button" onClick={() => {
            const proximo = {};
            visiveis.forEach((f, i) => { if (f.excerto) proximo[i] = !todosAbertos; });
            setAberto(proximo);
          }}>
            {todosAbertos ? "recolher trechos" : "abrir trechos"}
          </button>
          <button type="button" onClick={() => baixar(`dossie-${Date.now()}.md`, markdownDoDossie(spec))}>baixar .md</button>
          <button type="button" onClick={checarLinks} disabled={checando}>
            {checando ? "checando links…" : links ? `links: ${links.vivos}/${links.total}` : "verificar links"}
          </button>
        </div>
      </div>

      {links ? (
        <div className="art-verificar">
          <span>{links.vivos} de {links.total} links responderam</span>
          {links.mortos ? <span>· {links.mortos} sem resposta</span> : null}
        </div>
      ) : null}

      <ol className="art-fontes">
        {visiveis.map((f, i) => {
          const d = host(f.url);
          const tipo = TIPO_DOMINIO(d);
          const minutos = f.excerto ? tempoLeitura(f.excerto) : 0;
          return (
            <li key={i} className={f.primeiraMao ? "primeira-mao" : ""}>
              <div className="art-fonte">
                <span className="art-fonte-num">{i + 1}</span>
                <span className="art-fonte-corpo">
                  <a className="art-fonte-titulo" href={url(f.url)} target="_blank" rel="noopener noreferrer">
                    <img
                      className="art-favicon"
                      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=64`}
                      alt=""
                      loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                    <b>{limpar(f.titulo)}</b>
                  </a>
                  <span className="art-fonte-meta">
                    <em>{d}</em>
                    <span className={`art-tipo ${tipo.classe}`}>{tipo.rotulo}</span>
                    {f.primeiraMao ? <span className="art-selo-mini">lida na íntegra</span> : null}
                    {f.ramos && f.ramos.length > 1 ? <span className="art-selo-mini">{f.ramos.length} frentes</span> : null}
                    {minutos ? <span className="art-tempo">{minutos} min de leitura</span> : null}
                    {links && links.porIndice[i] ? (
                      <span className={"art-selo-link " + (links.porIndice[i].ok ? "ok" : "morto")}>
                        {links.porIndice[i].ok ? "link ok" : "sem resposta"}
                      </span>
                    ) : null}
                    {repetidos[i] ? <span className="art-selo-mini">{repetidos[i]} veículos</span> : null}
                  </span>
                  {f.excerto ? (
                    <>
                      <p className={"art-fonte-excerto" + (aberto[i] ? " aberto" : "")}>{limpar(f.excerto)}</p>
                      <button type="button" className="art-fonte-mais" onClick={() => setAberto((a) => ({ ...a, [i]: !a[i] }))}>
                        {aberto[i] ? "recolher trecho" : "ler trecho da fonte"}
                      </button>
                    </>
                  ) : f.resumo ? (
                    <p className="art-fonte-excerto">{limpar(f.resumo)}</p>
                  ) : null}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      {spec.plano && spec.plano.length ? (
        <div className="art-plano">
          <button type="button" onClick={() => setPlanoAberto((v) => !v)}>
            {planoAberto ? "ocultar" : "como esta pesquisa foi feita"} · {spec.plano.length} frentes
          </button>
          {planoAberto ? (
            <ol>
              {spec.plano.map((f, i) => (
                <li key={i}>
                  <b>{f.chave}</b>
                  <small>{f.pergunta}</small>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Clima({ spec }) {
  const d = spec.dados;
  if (!d) return <p className="art-vazio">Sem dados de clima agora.</p>;
  return (
    <div className="art-clima">
      <div className="art-clima-agora">
        <span className="art-clima-icone"><Icone nome={d.atual.icone} size={40} /></span>
        <div>
          <b>{d.atual.temp}°</b>
          <small>{d.atual.rotulo} · sensação {d.atual.sensacao}°</small>
          <small>{d.local}</small>
        </div>
        <dl>
          <div><dt>umidade</dt><dd>{d.atual.umidade}%</dd></div>
          <div><dt>vento</dt><dd>{d.atual.vento} km/h</dd></div>
        </dl>
      </div>
      <div className="art-clima-dias">
        {d.previsao.map((p, i) => (
          <div key={i} className="art-clima-dia">
            <small>{p.dia}</small>
            <Icone nome={p.icone} size={18} />
            <b>{p.max}°</b>
            <em>{p.min}°</em>
          </div>
        ))}
      </div>
    </div>
  );
}

function Fotos({ spec }) {
  const imagens = spec.imagens || [];
  const [zoom, setZoom] = useState(null);
  const [escala, setEscala] = useState(1);

  useEffect(() => {
    if (zoom === null) return;
    setEscala(1);
    const onKey = (e) => {
      if (e.key === "Escape") setZoom(null);
      if (e.key === "+" || e.key === "=") setEscala((v) => Math.min(4, v + 0.25));
      if (e.key === "-") setEscala((v) => Math.max(1, v - 0.25));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  return (
    <>
      <div className="art-fotos">
        {imagens.map((im, i) => (
          <button key={i} type="button" className="art-foto" onClick={() => setZoom(i)}>
            <img src={im.url} alt={im.legenda || "print"} loading="lazy" />
            {im.legenda ? <span>{limpar(im.legenda)}</span> : null}
          </button>
        ))}
      </div>
      {zoom !== null ? (
        <div
          className="art-zoom"
          role="dialog"
          aria-label="imagem ampliada"
          onClick={() => setZoom(null)}
          onWheel={(e) => { e.preventDefault(); setEscala((v) => Math.max(1, Math.min(4, v + (e.deltaY < 0 ? 0.2 : -0.2)))); }}
        >
          <img
            src={imagens[zoom].url}
            alt={imagens[zoom].legenda || "print"}
            style={{ transform: `scale(${escala})` }}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="art-zoom-bar" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setEscala((v) => Math.max(1, v - 0.25))}>−</button>
            <span>{Math.round(escala * 100)}%</span>
            <button type="button" onClick={() => setEscala((v) => Math.min(4, v + 0.25))}>+</button>
            <button type="button" onClick={() => baixar(imagens[zoom].legenda || "print.png", "", "image/png")}>
              baixar
            </button>
            <button type="button" onClick={() => setZoom(null)}>fechar</button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Tabela({ spec }) {
  const colunas = spec.colunas || [];
  const linhas = spec.linhas || [];
  return (
    <div className="art-tabela-wrap">
      <table className="art-tabela">
        <thead><tr>{colunas.map((c, i) => <th key={i}>{limpar(c)}</th>)}</tr></thead>
        <tbody>{linhas.map((l, i) => <tr key={i}>{l.map((c, j) => <td key={j}>{limpar(c)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Grafico({ spec }) {
  const series = spec.series || [];
  const max = Math.max(1, ...series.map((s) => Number(s.valor) || 0));
  return (
    <div className="art-grafico">
      {series.map((s, i) => (
        <div key={i} className="art-barra">
          <span>{limpar(s.label)}</span>
          <div><i style={{ width: `${Math.round(((Number(s.valor) || 0) / max) * 100)}%` }} /></div>
          <b>{s.valor}</b>
        </div>
      ))}
    </div>
  );
}

function Pesquisa({ spec }) {
  const etapas = spec.etapas || [];
  return (
    <ol className="art-etapas">
      {etapas.map((e, i) => (
        <li key={i} className={e.estado || ""}>
          <span className="art-etapa-ponto" />
          <span className="art-etapa-txt">
            <b>{e.titulo}</b>
            {e.detalhe ? <small>{e.detalhe}</small> : null}
          </span>
        </li>
      ))}
      {spec.carregando ? <li className="rodando"><span className="art-etapa-ponto" /><span className="art-etapa-txt"><b>buscando…</b></span></li> : null}
    </ol>
  );
}

function Ferramentas({ spec }) {
  const itens = spec.itens || [];
  return (
    <div className="art-ferramentas">
      {itens.map((t, i) => (
        <div key={i} className={"art-ferr " + (t.estado || "")}>
          <span className="art-ferr-ico"><Icone nome={t.icone || "fonte"} size={15} /></span>
          <span className="art-ferr-txt">
            <b>{limpar(t.nome)}</b>
            <small>{limpar(t.descricao)}</small>
          </span>
          <span className="art-ferr-meta">
            {t.latencia ? <em>{t.latencia} ms</em> : null}
            <span className={"art-ferr-selo " + (t.estado || "")}>{t.estado === "ok" ? "respondendo" : t.estado === "falha" ? "falhou" : "pronta"}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

const Milhar = (n) => (Number(n) || 0).toLocaleString("pt-BR");

function Topicos({ spec }) {
  if (!(spec.itens || []).length) return <p className="art-vazio">sem resultados agora</p>;
  const itens = spec.itens || [];
  return (
    <ul className="art-topicos">
      {itens.map((t, i) => (
        <li key={i}>
          <a href={url(t.url)} target="_blank" rel="noopener noreferrer">
            <span className="art-topico-linha">
              <b>{limpar(t.titulo)}</b>
              {t.pontos ? <span className="art-pontos">▲ {Milhar(t.pontos)}</span> : null}
            </span>
            <span className="art-topico-meta">
              {[t.fonte, t.comentarios ? `${Milhar(t.comentarios)} comentários` : "", t.quando, t.aceita ? "respondida" : ""].filter(Boolean).join(" · ")}
            </span>
            {t.tags && t.tags.length ? <span className="art-tags">{t.tags.map((g) => <em key={g}>{g}</em>)}</span> : null}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Repos({ spec }) {
  if (!(spec.itens || []).length) return <p className="art-vazio">sem resultados agora</p>;
  const itens = spec.itens || [];
  return (
    <div className="art-repos">
      {itens.map((r, i) => (
        <a key={i} className="art-repo" href={url(r.url)} target="_blank" rel="noopener noreferrer">
          <span className="art-repo-topo">
            <b>{limpar(r.titulo)}</b>
            <span className="art-repo-estrelas">★ {Milhar(r.estrelas)}</span>
          </span>
          {r.descricao ? <span className="art-repo-desc">{limpar(r.descricao)}</span> : null}
          <span className="art-repo-meta">
            {[r.linguagem, r.forks ? `${Milhar(r.forks)} forks` : "", r.licenca, r.atualizado ? "atualizado " + r.atualizado : ""].filter(Boolean).join(" · ")}
          </span>
        </a>
      ))}
    </div>
  );
}

function Papers({ spec }) {
  if (!(spec.itens || []).length) return <p className="art-vazio">sem resultados agora</p>;
  const itens = spec.itens || [];
  const [aberto, setAberto] = useState(null);
  return (
    <ul className="art-papers">
      {itens.map((a, i) => (
        <li key={i} className={aberto === i ? "on" : ""}>
          <button type="button" className="art-paper-topo" onClick={() => setAberto(aberto === i ? null : i)}>
            <b>{limpar(a.titulo)}</b>
            <span className="art-paper-meta">
              {[a.fonte, a.data, a.citacoes ? `${Milhar(a.citacoes)} citações` : "", a.aberto ? "acesso aberto" : ""].filter(Boolean).join(" · ")}
            </span>
          </button>
          {aberto === i ? (
            <div className="art-paper-corpo">
              {a.autores ? <p className="art-paper-autores">{limpar(a.autores)}</p> : null}
              {a.resumo ? <p>{limpar(a.resumo)}…</p> : null}
              {url(a.url) ? <a className="art-paper-link" href={url(a.url)} target="_blank" rel="noopener noreferrer">abrir estudo</a> : null}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Numeros({ spec }) {
  const itens = spec.itens || [];
  return (
    <div className="art-numeros">
      {itens.map((n, i) => (
        <div key={i} className="art-numero">
          <span className="art-numero-nome">{(n.nome || "").toUpperCase()}</span>
          <strong className="art-numero-valor">
            {spec.formato === "cambio" ? (Number(n.valor) || 0).toFixed(4) : "$ " + Milhar(Math.round(Number(n.usd) || 0))}
          </strong>
          {spec.formato === "cambio" ? <small>por 1 USD</small> : (
            <small>
              {n.brl ? "R$ " + Milhar(Math.round(n.brl)) + " · " : ""}
              <em className={Number(n.variacao) >= 0 ? "alta" : "baixa"}>
                {Number(n.variacao) >= 0 ? "▲" : "▼"} {(Number(n.variacao) || 0).toFixed(2)}%
              </em>
            </small>
          )}
        </div>
      ))}
    </div>
  );
}

function Pacote({ spec }) {
  const d = spec.pacote || {};
  return (
    <div className="art-pacote">
      <div className="art-pacote-topo">
        <b>{d.nome}</b>
        <span className="art-versao">v{d.versao}</span>
      </div>
      {d.descricao ? <p className="art-pacote-desc">{limpar(d.descricao)}</p> : null}
      <div className="art-pacote-meta">
        {[d.licenca, d.dependencias + " dependências", d.repo].filter(Boolean).map((x) => <span key={x}>{limpar(String(x)).slice(0, 46)}</span>)}
      </div>
      {url(d.url) ? <a className="art-pacote-link" href={url(d.url)} target="_blank" rel="noopener noreferrer">ver no npm</a> : null}
    </div>
  );
}

function Codigo({ spec }) {
  const [copiado, setCopiado] = useState(false);
  const texto = spec.codigo || "";
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 1600); } catch { }
  };
  const baixar = () => {
    const ext = spec.linguagem === "jsx" ? "jsx" : spec.linguagem === "python" ? "py" : spec.linguagem || "txt";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([texto], { type: "text/plain" }));
    a.download = (spec.arquivo || "skynet") + "." + ext;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="art-codigo">
      <div className="art-codigo-barra">
        <span>{spec.linguagem || "texto"}</span>
        <span className="art-codigo-acoes">
          <button type="button" onClick={copiar}>{copiado ? "copiado" : "copiar"}</button>
          <button type="button" onClick={baixar}>baixar</button>
        </span>
      </div>
      <pre><code>{texto}</code></pre>
    </div>
  );
}

const TIPOS = {
  ferramentas: { icone: "fonte", selo: "ferramentas", corpo: Ferramentas },
  pesquisa: { icone: "fonte", selo: "pesquisa", corpo: Pesquisa },
  noticias: { icone: "news", selo: "notícias", corpo: Noticias },
  videos: { icone: "video", selo: "vídeos", corpo: Videos },
  social: { icone: "insta", selo: "instagram", corpo: Social },
  fontes: { icone: "fonte", selo: "fontes", corpo: Fontes },
  clima: { icone: "sol", selo: "clima", corpo: Clima },
  fotos: { icone: "foto", selo: "fotos", corpo: Fotos },
  tabela: { icone: "file", selo: "tabela", corpo: Tabela },
  grafico: { icone: "file", selo: "gráfico", corpo: Grafico },
  topicos: { icone: "news", selo: "discussões", corpo: Topicos },
  repos: { icone: "file", selo: "repositórios", corpo: Repos },
  papers: { icone: "file", selo: "estudos", corpo: Papers },
  numeros: { icone: "sol", selo: "cotações", corpo: Numeros },
  pacote: { icone: "file", selo: "pacote", corpo: Pacote },
  codigo: { icone: "file", selo: "código", corpo: Codigo },
};

export function Artefato({ spec }) {
  if (!spec || !TIPOS[spec.tipo]) return null;
  const t = TIPOS[spec.tipo];
  const Corpo = t.corpo;
  const total = (spec.itens || spec.imagens || []).length;
  return (
    <section className="artefato" data-tipo={spec.tipo}>
      <Cabeca icone={t.icone} titulo={spec.titulo || t.selo} sub={spec.subtitulo} selo={total > 1 ? `${total} ${t.selo}` : t.selo} />
      <div className="art-corpo"><Corpo spec={spec} /></div>
      {spec.rodape ? <footer className="art-rodape">{limpar(spec.rodape)}</footer> : null}
    </section>
  );
}

/* ------------------------------- montagem ------------------------------- */

const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const tema = (t, extras = []) => {
  let q = norm(t).replace(
    new RegExp("\\b(noticias?|manchetes?|ultimas?|sobre|hoje|agora|quero|ver|mostre|me|do|da|de|dos|das|no|na|" +
      [...extras].join("|") + ")\\b", "g"),
    " "
  );
  return q.replace(/\s+/g, " ").trim().slice(0, 120);
};

/**
 * Decide e busca o artefato que combina com o pedido.
 * Retorna { tipo, titulo, subtitulo, itens, dados, rodape } ou null.
 */
export async function montarArtefato(pedido, opcoes = {}) {
  const bruto = String(pedido || "");
  const p = norm(bruto);
  const imagens = (opcoes.imagens || []).filter(Boolean);
  const aoPasso = opcoes.aoPasso || (() => {});
  const etapas = [];
  const passo = (e) => {
    const anterior = etapas.findIndex((x) => x.titulo === e.titulo);
    const item = { titulo: e.titulo, detalhe: e.detalhe || "" };
    if (anterior >= 0) etapas[anterior] = item;
    else etapas.push(item);
    aoPasso({ etapas: etapas.slice(), carregando: e.etapa !== "fim" });
  };

  if (imagens.length) {
    return [{
      tipo: "fotos",
      titulo: imagens.length > 1 ? `${imagens.length} imagens recebidas` : "Print recebido",
      subtitulo: "toque para ampliar",
      imagens: imagens.map((im, i) => ({ url: im.url || im, legenda: im.nome || `imagem ${i + 1}` })),
    }];
  }

  if (/clima|temperatura|previsao|chuva|frio|calor/.test(p)) {
    const m = bruto.match(/\b(?:em|no|na|de|para)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’ ]{2,28})/i);
    const cidade = (m ? m[1] : "São Paulo").replace(/\b(agora|hoje|amanha|nessa semana|por favor)\b.*$/i, "").trim() || "São Paulo";
    const dados = await clima(cidade);
    return [{ tipo: "clima", titulo: `Clima · ${cidade}`, subtitulo: dados ? dados.local : "buscando…", dados, rodape: "Open-Meteo · ao vivo" }];
  }

  // ---- fontes extras (dados abertos, sem chave)
  if (/github|repositorio|repositórios|open source|opensource/.test(p)) {
    const q = tema(bruto, ["github", "repositorio", "repositorios", "repositórios", "open", "source", "opensource", "melhores", "sobre"]);
    passo({ etapa: "coleta", titulo: "Buscando repositórios", detalhe: q || bruto });
    const itens = await github(q || bruto, 6);
    passo({ etapa: "fim", titulo: "Repositórios encontrados", detalhe: `${itens.length} projetos` });
    return [{ tipo: "repos", titulo: `GitHub · ${q || bruto}`, subtitulo: "ordenado por estrelas", itens, rodape: "api.github.com" }];
  }

  if (/arxiv|paper|papers|artigo cient|estudo|estudos|academi|pesquisa cientifica|publicac/.test(p)) {
    const q = tema(bruto, ["arxiv", "paper", "papers", "artigo", "artigos", "cientifico", "estudo", "estudos", "academico", "sobre"]);
    passo({ etapa: "coleta", titulo: "Buscando estudos", detalhe: q || bruto });
    const itens = await papers(q || bruto, 5);
    passo({ etapa: "fim", titulo: "Estudos reunidos", detalhe: `${itens.length} publicações` });
    return [{ tipo: "papers", titulo: `Estudos · ${q || bruto}`, subtitulo: "mais recentes primeiro", itens, rodape: "OpenAlex" }];
  }

  if (/bitcoin|cripto|ethereum|solana|dogecoin|bnb|ripple|criptomoeda/.test(p)) {
    passo({ etapa: "coleta", titulo: "Consultando cotações", detalhe: "CoinGecko" });
    const itens = await cripto(bruto);
    passo({ etapa: "fim", titulo: "Cotações atualizadas", detalhe: `${itens.length} ativos` });
    if (itens.length) return [{ tipo: "numeros", titulo: "Cripto agora", subtitulo: "dólar, real e variação 24h", itens, rodape: "CoinGecko · ao vivo" }];
  }

  if (/dolar|dólar|euro|cambio|câmbio|moeda|libra|iene/.test(p)) {
    passo({ etapa: "coleta", titulo: "Consultando câmbio", detalhe: "open.er-api.com" });
    const d = await cambio(bruto);
    passo({ etapa: "fim", titulo: "Câmbio atualizado", detalhe: d ? `${d.itens.length} moedas` : "sem dados" });
    if (d && d.itens.length) return [{ tipo: "numeros", formato: "cambio", titulo: "Câmbio agora", subtitulo: "base USD · " + d.quando, itens: d.itens, rodape: "open.er-api.com" }];
  }

  if (/\bnpm\b|pacote|biblioteca|dependencia|dependência/.test(p)) {
    const limpo = bruto.replace(/\bnpm\b/gi, " ").replace(/\bnpx\b/gi, " ");
    const m = limpo.match(/\b(?:pacote|biblioteca|modulo|módulo)\s+([\w@/.-]{2,40})/i) || limpo.match(/\b([\w@/.-]{2,40})\b/);
    const nome = ((m ? m[1] : "") || "react").replace(/^(pacote|biblioteca|do|da|de|o|a)$/i, "").trim() || "react";
    passo({ etapa: "coleta", titulo: "Consultando o npm", detalhe: nome });
    const d = await pacote(nome);
    passo({ etapa: "fim", titulo: "Pacote encontrado", detalhe: d ? `${d.nome} v${d.versao}` : "não encontrado" });
    if (d) return [{ tipo: "pacote", titulo: `npm · ${d.nome}`, subtitulo: "registro oficial", pacote: d }];
  }

  if (/hacker news|ycombinator|\bhn\b/.test(p)) {
    const q = tema(bruto, ["hacker", "news", "ycombinator", "hn", "sobre"]);
    passo({ etapa: "coleta", titulo: "Lendo o Hacker News", detalhe: q || bruto });
    const itens = await hackernews(q || bruto, 6);
    passo({ etapa: "fim", titulo: "Discussões reunidas", detalhe: `${itens.length} tópicos` });
    return [{ tipo: "topicos", titulo: `Hacker News · ${q || bruto}`, subtitulo: "por relevância", itens, rodape: "hn.algolia.com" }];
  }

  if (/stack ?overflow|erro ao|como resolver|como corrigir/.test(p)) {
    const q = tema(bruto, ["stack", "overflow", "erro", "resolver", "corrigir", "como"]);
    passo({ etapa: "coleta", titulo: "Procurando no Stack Overflow", detalhe: q || bruto });
    const itens = await stackoverflow(q || bruto, 5);
    passo({ etapa: "fim", titulo: "Respostas encontradas", detalhe: `${itens.length} perguntas` });
    if (itens.length) return [{ tipo: "topicos", titulo: `Stack Overflow · ${q || bruto}`, subtitulo: "perguntas com voto", itens, rodape: "api.stackexchange.com" }];
  }

  const querVideos = /video|youtube|assistir|canal/.test(p);
  const querSocial = /instagram|insta\b|reels?|perfil|perfis/.test(p);
  const querNoticia = /noticia|manchete|jornal|ultimas|aconteceu/.test(p);
  const precisaDossie = querVideos || querSocial || querNoticia ||
    /fonte|pesquis|busque|procure|quem |o que |como |por que |quando |onde |qual |explica|compare|sobre/.test(p);

  if (!precisaDossie) return null;

  if (querNoticia && !querVideos && !querSocial) {
    const q = tema(bruto, ["noticia", "noticias", "manchete", "manchetes", "jornal", "ultimas"]);
    passo({ etapa: "coleta", titulo: "Buscando notícias", detalhe: q || bruto });
    const itens = await noticias(q || bruto).catch(() => []);
    if (itens.length) {
      passo({ etapa: "fim", titulo: "Notícias reunidas", detalhe: `${itens.length} publicações` });
      return [
        { tipo: "noticias", titulo: `Notícias · ${q || bruto}`, subtitulo: "publicações recentes", itens },
        {
          tipo: "fontes",
          titulo: "De onde veio",
          subtitulo: "veículos consultados",
          itens: itens.map((n) => ({ titulo: n.title || n.titulo, url: n.url, resumo: n.snippet, primeiraMao: false })),
        },
      ];
    }
  }

  const dossie = await pesquisarProfundo(bruto, {
    aoPasso: (e) => passo(e),
    querVideos,
    querSocial,
  }).catch(() => null);

  if (!dossie) return null;
  const specs = [];
  if (querVideos && dossie.videos.length) {
    specs.push({ tipo: "videos", titulo: `Vídeos · ${dossie.plano.nucleo}`, subtitulo: "YouTube · busca ao vivo", itens: dossie.videos, rodape: `${dossie.videos.length} resultados agora` });
  }
  if (querSocial && dossie.social.length) {
    specs.push({ tipo: "social", titulo: `Instagram · ${dossie.plano.nucleo}`, subtitulo: "perfis e posts públicos", itens: dossie.social, rodape: "abre no Instagram" });
  }
  if (dossie.fontes.length) {
    const lidas = dossie.fontes.filter((f) => f.primeiraMao).length;
    specs.push({
      tipo: "fontes",
      titulo: `Dossiê · ${dossie.plano.nucleo}`.slice(0, 60),
      subtitulo: `pesquisa em ${dossie.plano.ramos.length} frentes`,
      itens: dossie.fontes.map((f) => ({
        titulo: f.titulo,
        url: f.url,
        resumo: f.snippet,
        excerto: f.excerto,
        primeiraMao: f.primeiraMao,
        ramos: f.ramos,
        quando: f.quando,
      })),
      plano: dossie.plano.ramos,
      metricas: [
        { valor: dossie.fontes.length, rotulo: "fontes" },
        { valor: lidas, rotulo: "na íntegra" },
        { valor: dossie.plano.ramos.length, rotulo: "frentes" },
        { valor: dossie.videos.length + dossie.social.length, rotulo: "mídias" },
      ],
      rodape: `pesquisa em ${dossie.plano.ramos.length} frentes · ${new Date(dossie.quando).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
    });
  }
  return specs.length ? specs : null;
}

/** Quebra o texto em partes de texto e blocos ```artefato``` prontos para render. */
export function separarArtefatos(texto) {
  const partes = [];
  const re = /```(?:artefato|artifact)\s*\n([\s\S]*?)```/gi;
  let ultimo = 0;
  let m;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push({ tipo: "texto", conteudo: texto.slice(ultimo, m.index) });
    try {
      const spec = JSON.parse(m[1].trim());
      partes.push({ tipo: "artefato", spec });
    } catch {
      partes.push({ tipo: "texto", conteudo: m[0] });
    }
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) partes.push({ tipo: "texto", conteudo: texto.slice(ultimo) });
  return partes;
}

/** Texto curto que acompanha o widget, citando as fontes quando existem. */
export function resumoDoArtefato(entrada) {
  const spec = Array.isArray(entrada) ? entrada[0] : entrada;
  if (!spec) return "";
  if (Array.isArray(entrada) && entrada.length > 1) {
    const f = entrada.find((x) => x.tipo === "fontes");
    const n = (f?.itens || []).length;
    return n ? `Reuni ${n} fontes e ${entrada.length - 1} painel(is) de apoio.` : "Painéis de apoio prontos.";
  }
  const n = (spec.itens || []).length;
  if (spec.tipo === "videos") return `Encontrei ${n} vídeos no YouTube agora.`;
  if (spec.tipo === "social") return `Localizei ${n} perfis e publicações públicas no Instagram.`;
  if (spec.tipo === "noticias") return `Levantei ${n} publicações recentes sobre o tema.`;
  if (spec.tipo === "fontes") return `Reuni ${n} fontes com trecho e link.`;
  if (spec.tipo === "clima") return `Clima ao vivo de ${spec.subtitulo || "sua cidade"}.`;
  if (spec.tipo === "fotos") return "Imagem recebida. Toque para ampliar.";
  return "";
}
