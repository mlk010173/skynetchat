// SKYNET · artefatos no chat: widgets montados a partir de dados reais.
// `Artefato` renderiza a spec; `montarArtefato` busca os dados quando o pedido
// pede notícias, vídeos, Instagram, fontes ou clima.
import { useEffect, useMemo, useState } from "react";
import { clima, noticias, resumo, social, videos, web } from "./pesquisa.js";
import { pesquisarProfundo, relatorio } from "./agente.js";
import "./artefatos.css";

const limpar = (t) => String(t == null ? "" : t).replace(/\s+/g, " ").trim();
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const url = (u) => (/^https?:\/\//i.test(String(u || "")) ? String(u) : "");

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

const Cabeca = ({ icone, titulo, sub, selo }) => (
  <header className="art-cabeca">
    <span className="art-icone"><Icone nome={icone} /></span>
    <span className="art-titulos">
      <strong>{titulo}</strong>
      {sub ? <small>{sub}</small> : null}
    </span>
    {selo ? <span className="art-selo">{selo}</span> : null}
  </header>
);

function Noticias({ spec }) {
  const itens = spec.itens || [];
  return (
    <div className="art-noticias">
      {itens.map((n, i) => (
        <a key={i} className="art-noticia" href={url(n.url)} target="_blank" rel="noopener noreferrer">
          <span className="art-noticia-meta">{[n.fonte || host(n.url), n.data].filter(Boolean).join(" · ")}</span>
          <b>{limpar(n.titulo)}</b>
          {n.resumo ? <span className="art-noticia-resumo">{limpar(n.resumo)}</span> : null}
        </a>
      ))}
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
  return (
    <ol className="art-fontes">
      {itens.map((f, i) => {
        const dominio = host(f.url);
        return (
          <li key={i} className={f.primeiraMao ? "primeira-mao" : ""}>
            <div className="art-fonte">
              <span className="art-fonte-num">{i + 1}</span>
              <span className="art-fonte-corpo">
                <a className="art-fonte-titulo" href={url(f.url)} target="_blank" rel="noopener noreferrer">
                  <img
                    className="art-favicon"
                    src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(dominio)}&sz=64`}
                    alt=""
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                  <b>{limpar(f.titulo)}</b>
                </a>
                <span className="art-fonte-meta">
                  <em>{dominio}</em>
                  {f.primeiraMao ? <span className="art-selo-mini">lida na íntegra</span> : null}
                  {f.ramos && f.ramos.length > 1 ? <span className="art-selo-mini">{f.ramos.length} frentes</span> : null}
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
  useEffect(() => {
    if (zoom === null) return;
    const onKey = (e) => e.key === "Escape" && setZoom(null);
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
        <div className="art-zoom" onClick={() => setZoom(null)} role="dialog" aria-label="imagem ampliada">
          <img src={imagens[zoom].url} alt={imagens[zoom].legenda || "print"} onClick={(e) => e.stopPropagation()} />
          <small>{imagens[zoom].legenda || ""}</small>
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

const TIPOS = {
  pesquisa: { icone: "fonte", selo: "pesquisa", corpo: Pesquisa },
  noticias: { icone: "news", selo: "notícias", corpo: Noticias },
  videos: { icone: "video", selo: "vídeos", corpo: Videos },
  social: { icone: "insta", selo: "instagram", corpo: Social },
  fontes: { icone: "fonte", selo: "fontes", corpo: Fontes },
  clima: { icone: "sol", selo: "clima", corpo: Clima },
  fotos: { icone: "foto", selo: "fotos", corpo: Fotos },
  tabela: { icone: "file", selo: "tabela", corpo: Tabela },
  grafico: { icone: "file", selo: "gráfico", corpo: Grafico },
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
    specs.push({
      tipo: "fontes",
      titulo: `Dossiê · ${dossie.plano.nucleo}`.slice(0, 60),
      subtitulo: `${dossie.fontes.length} fontes · ${dossie.fontes.filter((f) => f.primeiraMao).length} lidas na íntegra`,
      itens: dossie.fontes.map((f) => ({ titulo: f.titulo, url: f.url, resumo: f.snippet, excerto: f.excerto, primeiraMao: f.primeiraMao, ramos: f.ramos })),
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
