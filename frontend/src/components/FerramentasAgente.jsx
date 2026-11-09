// SKYNET · painel de ferramentas do agente.
// Mostra o que o agente sabe fazer, testa cada fonte de dados de verdade e
// guarda as configurações de pesquisa (profundidade, fontes, leitura, cache).
import { useCallback, useEffect, useMemo, useState } from "react";
import { aplicarNivel, lerConfig, NIVEIS, resumoConfig, salvarConfig } from "../agente-config.js";
import { clima, noticias, resumo, social, videos, web } from "../pesquisa.js";
import { lerPrimeiraMao, planejar } from "../agente.js";
import { ESTILOS, RACIOCINIO, resumoComportamento, TONS } from "../comportamento.js";
import { esquecer, lembrar, lerMemoria, limparMemoria } from "../memoria.js";
import { lerPrompts, removerPrompt, salvarPrompt, todosPrompts } from "../prompts.js";
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
  const [memoria, setMemoria] = useState(lerMemoria);
  const [fato, setFato] = useState("");
  const [prompts, setPrompts] = useState(todosPrompts);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novoTexto, setNovoTexto] = useState("");
  const [aba, setAba] = useState("fontes");
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

      <nav className="ferr-abas">
        {[
          ["fontes", "Fontes de dados"],
          ["comportamento", "Comportamento"],
          ["memoria", "Memória"],
          ["habilidades", "Habilidades"],
          ["prompts", "Prompts"],
        ].map(([id, nome]) => (
          <button key={id} type="button" className={aba === id ? "on" : ""} onClick={() => setAba(id)}>
            {nome}
          </button>
        ))}
      </nav>

      {aba === "comportamento" && (
        <section className="ferr-config ferr-comportamento">
          <h3>Como o agente responde</h3>
          <p className="ferr-resumo">{resumoComportamento(cfg)}</p>
          <div className="ferr-grupo">
            <h4>tom</h4>
            <div className="ferr-opcoes">
              {Object.entries(TONS).map(([id, t]) => (
                <button key={id} type="button" className={cfg.tom === id ? "on" : ""} onClick={() => atualizar({ tom: id })}>
                  {t.rotulo}
                </button>
              ))}
            </div>
          </div>
          <div className="ferr-grupo">
            <h4>formato</h4>
            <div className="ferr-opcoes">
              {Object.entries(ESTILOS).map(([id, e]) => (
                <button key={id} type="button" className={cfg.estilo === id ? "on" : ""} onClick={() => atualizar({ estilo: id })}>
                  {e.rotulo}
                </button>
              ))}
            </div>
          </div>
          <div className="ferr-grupo">
            <h4>raciocínio</h4>
            <div className="ferr-opcoes">
              {Object.entries(RACIOCINIO).map(([id, r]) => (
                <button
                  key={id}
                  type="button"
                  className={cfg.raciocinio === id ? "on" : ""}
                  onClick={() => atualizar({ raciocinio: id })}
                  title={r.desc}
                >
                  {r.rotulo}
                </button>
              ))}
            </div>
            <small>{RACIOCINIO[cfg.raciocinio] && RACIOCINIO[cfg.raciocinio].desc}</small>
          </div>
          <div className="ferr-toggles">
            <label>
              <input type="checkbox" checked={cfg.citacaoObrigatoria} onChange={(e) => atualizar({ citacaoObrigatoria: e.target.checked })} />
              exigir fonte numerada
            </label>
            <label>
              <input type="checkbox" checked={cfg.autoArtefato} onChange={(e) => atualizar({ autoArtefato: e.target.checked })} />
              montar painel automático (notícias, vídeos, dossiê)
            </label>
            <label>
              <input type="checkbox" checked={cfg.verificarFontes} onChange={(e) => atualizar({ verificarFontes: e.target.checked })} />
              verificar se os links abrem
            </label>
            <label>
              <input type="checkbox" checked={cfg.memoriaAtiva} onChange={(e) => atualizar({ memoriaAtiva: e.target.checked })} />
              usar a memória no prompt
            </label>
          </div>
        </section>
      )}

      {aba === "memoria" && (
        <section className="ferr-config">
          <h3>O que o agente lembra</h3>
          <p className="ferr-resumo">
            {memoria.length ? `${memoria.length} fato(s) guardado(s) neste navegador` : "nada guardado ainda"}
          </p>
          <div className="ferr-linha">
            <input value={fato} onChange={(e) => setFato(e.target.value)} placeholder="ex.: prefiro respostas curtas e em português" />
            <button
              type="button"
              onClick={() => {
                if (!fato.trim()) return;
                setMemoria(lembrar(fato));
                setFato("");
              }}
            >
              lembrar
            </button>
          </div>
          <ul className="ferr-memoria">
            {memoria.map((m) => (
              <li key={m.id}>
                <span>{m.texto}</span>
                <button type="button" onClick={() => setMemoria(esquecer(m.id))} aria-label="esquecer">
                  esquecer
                </button>
              </li>
            ))}
          </ul>
          {memoria.length > 0 && (
            <button type="button" className="ferr-apagar" onClick={() => setMemoria(limparMemoria())}>
              limpar toda a memória
            </button>
          )}
        </section>
      )}

      {aba === "habilidades" && (
        <section className="ferr-config ferr-habilidades">
          <h3>Habilidades de lógica</h3>
          <p className="ferr-resumo">
            Cada chave abaixo liga um comportamento real no dossiê e no envio da mensagem.
          </p>
          <ul className="ferr-hab">
            {[
              ["verificarLinks", "Verificar links", "Abre cada fonte em segundo plano e marca as que não respondem."],
              ["resumoExecutivo", "Resumo executivo", "Fecha o dossiê com até 4 linhas diretas e os números que aparecem."],
              ["compararFontes", "Comparar fontes", "Mostra que termos aparecem em três ou mais domínios diferentes."],
              ["deduplicar", "Juntar duplicados", "Agrupa títulos quase iguais para não contar a mesma notícia duas vezes."],
              ["paletaAtalhos", "Paleta Ctrl+K", "Atalho para pular entre chat, painel, prompts e memória."],
              ["citacaoObrigatoria", "Fonte numerada", "Obriga o agente a numerar as fontes que usar."],
              ["palavrasChave", "Palavras-chave", "Extrai os termos mais repetidos nas fontes e deixa clicar para perguntar."],
              ["linhaTempo", "Linha do tempo", "Encontra datas nos títulos e trechos e ordena do mais novo ao mais antigo."],
              ["frescorFontes", "Frescor das fontes", "Mostra a idade média das fontes e quantas saíram nos últimos 7 dias."],
              ["balancoFontes", "Balanço de fontes", "Barra com oficial, acadêmico, imprensa e técnico para ver de onde vem."],
              ["tempoLeitura", "Tempo de leitura", "Soma as palavras dos trechos e estima minutos de leitura."],
              ["perguntasSeguir", "Perguntas de continuidade", "Sugere cinco perguntas tiradas dos temas do dossiê."],
            ].map(([chave, titulo, desc]) => (
              <li key={chave}>
                <label>
                  <input
                    type="checkbox"
                    checked={cfg[chave] !== false}
                    onChange={(e) => atualizar({ [chave]: e.target.checked })}
                  />
                  <span>
                    <b>{titulo}</b>
                    <small>{desc}</small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="ferr-hab-dica">
            <b>Como testar</b>
            <small>
              Peça "monte um dossiê sobre [tema]" no chat. Com Verificar links ligado, cada fonte ganha
              um selo de checagem; com Comparar fontes, aparece a faixa de consenso entre domínios.
            </small>
          </div>
        </section>
      )}

      {aba === "prompts" && (
        <section className="ferr-config">
          <h3>Prompts prontos</h3>
          <ul className="ferr-prompts">
            {prompts.map((pr) => (
              <li key={pr.id}>
                <div>
                  <b>{pr.titulo}</b>
                  <small>{pr.tag}</small>
                  <p>{pr.texto}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      navigator.clipboard.writeText(pr.texto);
                    } catch {
                      /* sem área de transferência */
                    }
                  }}
                >
                  copiar
                </button>
              </li>
            ))}
          </ul>
          <div className="ferr-novo-prompt">
            <input value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)} placeholder="título do seu prompt" />
            <textarea value={novoTexto} onChange={(e) => setNovoTexto(e.target.value)} placeholder="texto do prompt" rows={3} />
            <button
              type="button"
              onClick={() => {
                if (novoTexto.trim().length < 5) return;
                setPrompts(todosPrompts(salvarPrompt(novoTitulo, novoTexto)));
                setNovoTitulo("");
                setNovoTexto("");
              }}
            >
              salvar prompt
            </button>
          </div>
          {lerPrompts().length > 0 && (
            <ul className="ferr-meus-prompts">
              {lerPrompts().map((pr) => (
                <li key={pr.id}>
                  <span>{pr.titulo}</span>
                  <button type="button" onClick={() => setPrompts(todosPrompts(removerPrompt(pr.id)))}>
                    remover
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

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

      {aba === "fontes" && (
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
      )}

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
