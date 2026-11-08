// SKYNET · painel de ferramentas do agente.
// Mostra o que o agente sabe fazer, testa cada fonte de dados de verdade e
// guarda as configurações de pesquisa (profundidade, fontes, leitura, cache).
import { useCallback, useEffect, useMemo, useState } from "react";
import { aplicarNivel, lerConfig, NIVEIS, resumoConfig, salvarConfig } from "../agente-config.js";
import { clima, noticias, resumo, social, videos, web } from "../pesquisa.js";
import { lerPrimeiraMao, planejar } from "../agente.js";
import { cambio, cripto, github, hackernews, pacote, papers, stackoverflow } from "../fontes-extra.js";
import "./FerramentasAgente.css";

const FERRAMENTAS = [
  {
    id: "web",
    nome: "Busca na web",
    descricao: "DuckDuckGo Lite e Bing lidos pelo leitor com CORS, com deduplicação por URL canônica.",
    icone: "fonte",
    teste: (q) => web(q),
    amostra: (r) => `${r.length} resultados · ${r[0]?.domain || "—"}`,
  },
  {
    id: "noticias",
    nome: "Notícias ao vivo",
    descricao: "Busca fresca (24 h e 7 dias) e prioriza veículos de imprensa.",
    icone: "news",
    teste: (q) => noticias(q),
    amostra: (r) => `${r.length} publicações · ${r[0]?.domain || "—"}`,
  },
  {
    id: "resumo",
    nome: "Resumo enciclopédico",
    descricao: "API da Wikipédia com introdução do verbete, sem chave.",
    icone: "file",
    teste: (q) => resumo(q).then((r) => (r ? [r] : [])),
    amostra: (r) => (r[0] ? r[0].titulo : "sem verbete"),
  },
  {
    id: "videos",
    nome: "YouTube",
    descricao: "API Piped com quatro instâncias em cascata: título, canal, duração e views.",
    icone: "video",
    teste: (q) => videos(q),
    amostra: (r) => `${r.length} vídeos · ${r[0]?.canal || "—"}`,
  },
  {
    id: "social",
    nome: "Instagram público",
    descricao: "Descobre perfis e posts por busca e abre a prévia oficial no chat.",
    icone: "insta",
    teste: (q) => social(q),
    amostra: (r) => `${r.length} perfis · @${r[0]?.usuario || "—"}`,
  },
  {
    id: "leitura",
    nome: "Leitura de página",
    descricao: "Extrai o corpo da página e escolhe a passagem mais aderente ao tema.",
    icone: "search",
    teste: async (q) => {
      const lista = await web(q);
      const alvo = lista.find((x) => /^https?:/.test(x.url));
      if (!alvo) return [];
      const lido = await lerPrimeiraMao(alvo.url, q);
      return lido ? [lido] : [];
    },
    amostra: (r) => (r[0] ? `${r[0].tamanho} caracteres lidos` : "sem acesso"),
  },
  {
    id: "clima",
    nome: "Clima ao vivo",
    descricao: "Open-Meteo com leitura atual e previsão de seis dias.",
    icone: "sol",
    teste: () => clima("São Paulo").then((r) => (r ? [r] : [])),
    amostra: (r) => (r[0] ? `${r[0].local} · ${r[0].atual.temp}°` : "sem dados"),
  },
  {
    id: "hackernews", nome: "Hacker News", icone: "▲",
    descricao: "Discussões técnicas e lançamentos do ycombinator.",
    fonte: "hn.algolia.com",
    teste: (q) => hackernews(q, 4),
    amostra: (r) => `${r.length} tópicos · ${r[0]?.pontos || 0} pontos`,
  },
  {
    id: "github", nome: "GitHub", icone: "⌥",
    descricao: "Repositórios por estrelas, linguagem e licença.",
    fonte: "api.github.com",
    teste: (q) => github(q, 3),
    amostra: (r) => `${r.length} repositórios · ${r[0]?.titulo || ""}`,
  },
  {
    id: "papers", nome: "Estudos", icone: "⌘",
    descricao: "Artigos científicos com citações e acesso aberto.",
    fonte: "api.openalex.org",
    teste: (q) => papers(q, 4),
    amostra: (r) => `${r.length} estudos · ${r[0]?.fonte || ""}`,
  },
  {
    id: "stackoverflow", nome: "Stack Overflow", icone: "▤",
    descricao: "Perguntas técnicas com voto e resposta aceita.",
    fonte: "api.stackexchange.com",
    teste: (q) => stackoverflow(q, 3),
    amostra: (r) => `${r.length} perguntas · ${r[0]?.pontos || 0} votos`,
  },
  {
    id: "cripto", nome: "Cripto", icone: "₿",
    descricao: "Preço em dólar e real com variação de 24 h.",
    fonte: "api.coingecko.com",
    teste: (q) => cripto(q),
    amostra: (r) => (r[0] ? `${r[0].nome} · $${Math.round(r[0].usd)}` : "sem dados"),
  },
  {
    id: "cambio", nome: "Câmbio", icone: "$",
    descricao: "Taxas de câmbio com base no dólar.",
    fonte: "open.er-api.com",
    teste: () => cambio("").then((d) => (d ? [d] : [])),
    amostra: (r) => (r[0] ? `${r[0].itens.length} moedas · ${r[0].quando}` : "sem dados"),
  },
  {
    id: "npm", nome: "npm", icone: "◫",
    descricao: "Versão, licença e dependências de pacotes.",
    fonte: "registry.npmjs.org",
    teste: (q) => pacote(q || "react").then((d) => (d ? [d] : [])),
    amostra: (r) => (r[0] ? `${r[0].nome} v${r[0].versao}` : "sem dados"),
  },
];

export default function FerramentasAgente({ pedidoInicial = "inteligência artificial no Brasil", compacto = false }) {
  const [cfg, setCfg] = useState(lerConfig);
  const [estado, setEstado] = useState({});
  const [pedido, setPedido] = useState(pedidoInicial);
  const [rodandoTudo, setRodandoTudo] = useState(false);

  useEffect(() => setCfg(lerConfig()), []);

  const atualizar = useCallback((patch) => {
    setCfg(salvarConfig(patch));
  }, []);

  const testar = useCallback(
    async (f) => {
      setEstado((e) => ({ ...e, [f.id]: { ...(e[f.id] || {}), testando: true } }));
      const t0 = performance.now();
      try {
        const r = await f.teste(pedido);
        setEstado((e) => ({
          ...e,
          [f.id]: { ok: true, latencia: Math.round(performance.now() - t0), amostra: f.amostra(r), quando: Date.now() },
        }));
      } catch (err) {
        setEstado((e) => ({
          ...e,
          [f.id]: { ok: false, latencia: Math.round(performance.now() - t0), amostra: String(err && err.message || err).slice(0, 80), quando: Date.now() },
        }));
      }
    },
    [pedido]
  );

  const testarTudo = useCallback(async () => {
    setRodandoTudo(true);
    for (const f of FERRAMENTAS) await testar(f);
    setRodandoTudo(false);
  }, [testar]);

  const plano = useMemo(() => planejar(pedido), [pedido]);
  const prontas = Object.values(estado).filter((e) => e.ok).length;
  const testadas = Object.values(estado).filter((e) => e.ok !== undefined).length;

  return (
    <div className={"ferramentas" + (compacto ? " compacto" : "")}>
      <header className="ferr-topo">
        <div>
          <h2>Ferramentas do agente</h2>
          <p>{resumoConfig(cfg)}</p>
        </div>
        <button type="button" className="ferr-tudo" onClick={testarTudo} disabled={rodandoTudo}>
          {rodandoTudo ? "testando…" : testadas ? `testar tudo (${prontas}/${FERRAMENTAS.length} ok)` : "testar tudo agora"}
        </button>
      </header>

      <div className="ferr-pedido">
        <label htmlFor="ferr-tema">termo de teste</label>
        <input
          id="ferr-tema"
          value={pedido}
          onChange={(e) => setPedido(e.target.value)}
          placeholder="ex.: regulação de IA no Brasil"
        />
        <small>
          plano atual: {plano.ramos.length} frentes — {plano.ramos.map((r) => r.chave).join(" · ")}
        </small>
      </div>

      <ul className="ferr-lista">
        {FERRAMENTAS.map((f) => {
          const st = estado[f.id] || {};
          return (
            <li key={f.id} data-ferramenta={f.id} className={st.ok === true ? "ok" : st.ok === false ? "falha" : ""}>
              <div className="ferr-cabeca">
                <b>{f.nome}</b>
                <span className="ferr-status">
                  {st.testando ? "testando…" : st.ok === true ? `${st.latencia} ms` : st.ok === false ? "falhou" : "—"}
                </span>
              </div>
              <p>{f.descricao}</p>
              {st.amostra ? <span className="ferr-amostra">{st.amostra}</span> : null}
              <button type="button" onClick={() => testar(f)} disabled={st.testando}>
                {st.testando ? "…" : "testar"}
              </button>
            </li>
          );
        })}
      </ul>

      <section className="ferr-config">
        <h3>Configuração da pesquisa</h3>

        <div className="ferr-niveis">
          {Object.entries(NIVEIS).map(([id, n]) => (
            <button
              key={id}
              type="button"
              className={cfg.profundidade === id ? "on" : ""}
              data-nivel={id}
              onClick={() => setCfg(aplicarNivel(id))}
            >
              <b>{n.rotulo}</b>
              <small>{n.desc}</small>
            </button>
          ))}
        </div>

        <div className="ferr-campos">
          <label>
            frentes de pesquisa <b>{cfg.frentes}</b>
            <input type="range" min="1" max="7" value={cfg.frentes} onChange={(e) => atualizar({ frentes: Number(e.target.value) })} />
          </label>
          <label>
            fontes no dossiê <b>{cfg.fontesMax}</b>
            <input type="range" min="6" max="30" value={cfg.fontesMax} onChange={(e) => atualizar({ fontesMax: Number(e.target.value) })} />
          </label>
          <label>
            fontes por frente <b>{cfg.fontesPorFrente}</b>
            <input type="range" min="3" max="10" value={cfg.fontesPorFrente} onChange={(e) => atualizar({ fontesPorFrente: Number(e.target.value) })} />
          </label>
          <label>
            lidas na íntegra <b>{cfg.leiturasIntegra}</b>
            <input type="range" min="0" max="6" value={cfg.leiturasIntegra} onChange={(e) => atualizar({ leiturasIntegra: Number(e.target.value) })} />
          </label>
          <label>
            cache <b>{cfg.cacheMin} min</b>
            <input type="range" min="1" max="120" value={cfg.cacheMin} onChange={(e) => atualizar({ cacheMin: Number(e.target.value) })} />
          </label>
          <label className="ferr-toggle">
            <input type="checkbox" checked={cfg.videos} onChange={(e) => atualizar({ videos: e.target.checked })} />
            incluir YouTube
          </label>
          <label className="ferr-toggle">
            <input type="checkbox" checked={cfg.instagram} onChange={(e) => atualizar({ instagram: e.target.checked })} />
            incluir Instagram
          </label>
          <label className="ferr-toggle">
            <input type="checkbox" checked={cfg.mostrarPassos} onChange={(e) => atualizar({ mostrarPassos: e.target.checked })} />
            mostrar passos no chat
          </label>
          <label className="ferr-toggle">
            <input type="checkbox" checked={cfg.autoridadePrimeiro} onChange={(e) => atualizar({ autoridadePrimeiro: e.target.checked })} />
            priorizar fonte oficial
          </label>
        </div>
      </section>

      <section className="ferr-como">
        <h3>Como o agente trabalha</h3>
        <ol>
          <li><b>Planeja</b> — quebra o pedido em frentes independentes (definição, notícia, dados, crítica, documento oficial).</li>
          <li><b>Coleta em paralelo</b> — duas por vez, com retry quando o provedor limita.</li>
          <li><b>Limpa</b> — canonicaliza URL, remove duplicata e descarta resultado sem título ou sem link.</li>
          <li><b>Ordena</b> — autoridade do domínio, recência e aderência aos termos da consulta.</li>
          <li><b>Lê</b> — abre as melhores páginas e extrai a passagem mais relevante.</li>
          <li><b>Monta</b> — dossiê com citação, vídeos, Instagram e clima no mesmo painel.</li>
        </ol>
      </section>
    </div>
  );
}
