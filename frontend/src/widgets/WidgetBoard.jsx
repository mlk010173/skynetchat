// Painel de widgets: grade redimensionável, atualização automática,
// criação por IA, aprovação de ações críticas e notificações.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { askOnce } from "../lib.js";
import {
  TIPOS, carregarWidgets, chaveStorage, criarWidget, daSpec, extrairJson,
  intervaloValido, listaTipos, porPalavras, promptDoWidget, salvarWidgets,
} from "./registry.js";
import {
  GaleriaBody, GithubBody, IaBody, MetricasBody, MidiaBody, NoticiasBody, StatusBody, TerminalBody, TextoBody, VideoBody,
} from "./Corpos.jsx";
import { useAuth } from "../auth.jsx";

const SUJESTOES = [
  { tipo: "status", rotulo: "Status agora" },
  { tipo: "metricas", rotulo: "Latência (gráfico)" },
  { tipo: "noticias", rotulo: "Notícias de tecnologia" },
  { tipo: "github", rotulo: "Repo skynetchat" },
  { tipo: "video", rotulo: "Vídeo do YouTube" },
  { tipo: "terminal", rotulo: "Terminal real" },
];

function useAprovacao() {
  const [pedido, setPedido] = useState(null);
  const resolver = useRef(null);
  const pedirAprovacao = useCallback((p) => new Promise((resolve) => {
    resolver.current = resolve;
    setPedido(p);
  }), []);
  const decidir = (ok) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPedido(null);
  };
  const modal = pedido ? (
    <div className="wg-modal-fundo" role="dialog" aria-modal="true" aria-label="Aprovação necessária">
      <div className="wg-modal">
        <h3>Aprovação necessária</h3>
        <p className="wg-modal-titulo">{pedido.titulo}</p>
        <pre className="wg-modal-detalhe">{pedido.detalhe}</pre>
        <p className="wg-pe">Ações críticas só rodam com sua autorização explícita.</p>
        <div className="wg-modal-acoes">
          <button type="button" className="botao secundario" onClick={() => decidir(false)}>Cancelar</button>
          <button type="button" className="botao" onClick={() => decidir(true)}>Aprovar e executar</button>
        </div>
      </div>
    </div>
  ) : null;
  return { pedirAprovacao, modal };
}

function CorpoDoWidget({ widget, tick, pedirAprovacao, notificar, atualizarConfig }) {
  const c = widget.config || {};
  switch (widget.tipo) {
    case "status": return <StatusBody config={c} tick={tick} />;
    case "metricas": return <MetricasBody config={c} tick={tick} />;
    case "noticias": return <NoticiasBody config={c} tick={tick} />;
    case "github": return <GithubBody config={c} tick={tick} />;
    case "video": return <VideoBody config={c} />;
    case "galeria": return <GaleriaBody config={c} atualizarConfig={(novo) => atualizarConfig(widget.id, novo)} />;
    case "midia": return <MidiaBody config={c} atualizarConfig={(novo) => atualizarConfig(widget.id, novo)} />;
    case "terminal": return <TerminalBody config={c} tick={tick} pedirAprovacao={pedirAprovacao} notificar={notificar} />;
    case "ia": return <IaBody config={c} tick={tick} />;
    case "texto": return <TextoBody config={c} onChange={(novo) => atualizarConfig(widget.id, novo)} />;
    default: return <p className="wg-erro">tipo desconhecido</p>;
  }
}

export default function WidgetBoard() {
  const { usuario } = useAuth();
  const chave = useMemo(() => chaveStorage(usuario?.id), [usuario?.id]);
  const [widgets, setWidgets] = useState(() => carregarWidgets(chaveStorage(usuario?.id)));
  const [tiques, setTiques] = useState({});
  const [menuAberto, setMenuAberto] = useState(false);
  const [iaTexto, setIaTexto] = useState("");
  const [iaBusy, setIaBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [avisos, setAvisos] = useState([]);
  const [editando, setEditando] = useState(null);
  const { pedirAprovacao, modal } = useAprovacao();

  // troca de conta recarrega o conjunto salvo
  useEffect(() => { setWidgets(carregarWidgets(chave)); }, [chave]);
  useEffect(() => { salvarWidgets(chave, widgets); }, [chave, widgets]);

  const notificar = useCallback((titulo, corpo) => {
    const id = Math.random().toString(36).slice(2);
    setAvisos((a) => [...a, { id, titulo, corpo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 5200);
    try {
      if ("Notification" in window && Notification.permission === "granted") new Notification(titulo, { body: corpo });
    } catch { /* ignorado */ }
  }, []);

  // atualização automática: um relógio global marca quem está na hora
  useEffect(() => {
    const t = setInterval(() => {
      setTiques((atual) => {
        const proximo = { ...atual };
        for (const w of widgets) if (w.atualizarAgora > 0 && w.tipo !== "terminal") proximo[w.id] = (proximo[w.id] ?? 0) + 1;
        return proximo;
      });
    }, 5000);
    return () => clearInterval(t);
  }, [widgets]);

  const adicionar = (tipo, extra) => {
    const w = criarWidget(tipo, extra);
    if (!w) return;
    setWidgets((lista) => [...lista, w]);
    setMenuAberto(false);
    notificar("Widget adicionado", w.titulo);
  };

  const remover = (id) => setWidgets((lista) => lista.filter((w) => w.id !== id));
  const atualizarConfig = (id, patch) => setWidgets((lista) => lista.map((w) => (w.id === id ? { ...w, config: { ...w.config, ...patch } } : w)));
  const redimensionar = (id, campo, delta) => setWidgets((lista) => lista.map((w) => {
    if (w.id !== id) return w;
    const valor = campo === "cols" ? Math.min(4, Math.max(1, w.cols + delta)) : Math.min(8, Math.max(2, w.linhas + delta));
    return { ...w, [campo]: valor };
  }));

  async function criarComIA() {
    const pedido = iaTexto.trim();
    if (!pedido || iaBusy) return;
    setIaBusy(true); setErro("");
    const r = await askOnce({ content: promptDoWidget(pedido) });
    const motivo = r?.ok === false ? String(r.erro ?? "modelo indisponível") : "";
    const texto = r?.ok === false ? "" : String(r?.texto ?? r ?? "");
    const res = daSpec(extrairJson(texto));
    setIaBusy(false);
    // se o modelo não devolver JSON válido, o pedido é interpretado localmente
    const widget = res.ok ? res.widget : porPalavras(pedido);
    if (!widget) { setErro(`Não consegui criar esse widget${motivo ? ` (${motivo})` : ""}.`); return; }
    setWidgets((lista) => [...lista, widget]);
    setIaTexto("");
    setMenuAberto(false);
    notificar(res.ok ? "Widget criado pela IA" : "Widget criado pelo interpretador local", `${widget.titulo}${motivo ? ` · IA: ${motivo.slice(0, 40)}` : ""}`);
    if (!res.ok) setErro(`A IA não respondeu em JSON; montei o widget pelo seu texto (${TIPOS[widget.tipo]?.nome}).`);
  }

  return (
    <div className="wg-page">
      <header className="wg-head">
        <div>
          <h1>Painel de widgets</h1>
          <p className="wg-sub">Monte seu painel: monitoramento, gráficos, notícias, GitHub, vídeo, terminal e blocos criados por IA.</p>
        </div>
        <div className="wg-head-acoes">
          <button type="button" className="botao" onClick={() => setMenuAberto((v) => !v)}>+ Adicionar</button>
          <button
            type="button"
            className="botao secundario"
            onClick={async () => {
              if (!("Notification" in window)) return notificar("Sem suporte", "Este navegador não tem notificações.");
              const p = await Notification.requestPermission();
              notificar("Notificações", p === "granted" ? "Ativadas neste navegador." : "Permissão não concedida.");
            }}
          >🔔 Notificações</button>
        </div>
      </header>

      {menuAberto && (
        <section className="wg-menu" aria-label="Adicionar widget">
          <div className="wg-menu-grade">
            {listaTipos().map((t) => (
              <button key={t.id} type="button" className="wg-opcao" onClick={() => adicionar(t.id)}>
                <span className="wg-icone">{t.icone}</span>
                <strong>{t.nome}</strong>
                <small>{t.desc}</small>
              </button>
            ))}
          </div>
          <div className="wg-ia-criar">
            <label htmlFor="wg-ia">Criar com IA — descreva o widget</label>
            <div className="wg-ia-linha">
              <input
                id="wg-ia"
                value={iaTexto}
                onChange={(e) => setIaTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") criarComIA(); }}
                placeholder="ex.: gráfico da latência da API atualizando a cada 30s"
              />
              <button type="button" className="botao" onClick={criarComIA} disabled={iaBusy || !iaTexto.trim()}>{iaBusy ? "criando…" : "Criar"}</button>
            </div>
            <div className="wg-sugestoes">
              {SUJESTOES.map((s) => (
                <button key={s.tipo} type="button" onClick={() => adicionar(s.tipo)}>{s.rotulo}</button>
              ))}
            </div>
          </div>
        </section>
      )}

      {erro ? <p className="wg-alerta" role="alert">{erro}</p> : null}

      {widgets.length === 0 ? (
        <div className="wg-vazio">
          <p>Seu painel está vazio.</p>
          <p className="wg-sub">Comece com um monitor de sistema ou descreva um widget para a IA criar.</p>
        </div>
      ) : (
        <section className="wg-grade">
          {widgets.map((w) => (
            <article
              key={w.id}
              className={`wg-card ${TIPOS[w.tipo]?.critico ? "critico" : ""}`}
              style={{ gridColumn: `span ${w.cols}`, gridRow: `span ${w.linhas}` }}
            >
              <header className="wg-card-top">
                <span className="wg-card-icone">{TIPOS[w.tipo]?.icone}</span>
                <h2>{w.titulo}</h2>
                <div className="wg-card-acoes">
                  <button type="button" title="Mais estreito" onClick={() => redimensionar(w.id, "cols", -1)}>−</button>
                  <button type="button" title="Mais largo" onClick={() => redimensionar(w.id, "cols", 1)}>+</button>
                  <button type="button" title="Mais baixo" onClick={() => redimensionar(w.id, "linhas", -1)}>▾</button>
                  <button type="button" title="Mais alto" onClick={() => redimensionar(w.id, "linhas", 1)}>▴</button>
                  <button type="button" title="Configurar" onClick={() => setEditando(editando === w.id ? null : w.id)}>⚙</button>
                  <button type="button" title="Remover" onClick={() => remover(w.id)}>✕</button>
                </div>
              </header>

              {editando === w.id && (
                <div className="wg-config">
                  <label>título<input value={w.titulo} onChange={(e) => setWidgets((l) => l.map((x) => (x.id === w.id ? { ...x, titulo: e.target.value.slice(0, 60) } : x)))} /></label>
                  {w.tipo === "noticias" && <label>consulta<input value={w.config.consulta || ""} onChange={(e) => atualizarConfig(w.id, { consulta: e.target.value })} /></label>}
                  {w.tipo === "github" && (
                    <>
                      <label>repositório<input value={w.config.repo || ""} onChange={(e) => atualizarConfig(w.id, { repo: e.target.value })} placeholder="dono/repo" /></label>
                      <label>visão
                        <select value={w.config.visao || "repo"} onChange={(e) => atualizarConfig(w.id, { visao: e.target.value })}>
                          <option value="repo">resumo</option>
                          <option value="arquivos">arquivos</option>
                          <option value="commits">commits</option>
                        </select>
                      </label>
                    </>
                  )}
                  {w.tipo === "video" && <label>URL<input value={w.config.url || ""} onChange={(e) => atualizarConfig(w.id, { url: e.target.value })} placeholder="YouTube, Vimeo ou .mp4" /></label>}
                  {w.tipo === "midia" && (
                    <>
                      <label>serviço
                        <select value={w.config.provedor || "youtube"} onChange={(e) => atualizarConfig(w.id, { provedor: e.target.value })}>
                          <option value="youtube">YouTube</option>
                          <option value="spotify">Spotify</option>
                          <option value="soundcloud">SoundCloud</option>
                        </select>
                      </label>
                      <label>link (opcional)<input value={w.config.url || ""} onChange={(e) => atualizarConfig(w.id, { url: e.target.value })} placeholder="cole um link ou use o player" /></label>
                    </>
                  )}
                  {w.tipo === "terminal" && (
                    <>
                      <label>comando<input value={w.config.comando || ""} onChange={(e) => atualizarConfig(w.id, { comando: e.target.value })} /></label>
                      <label className="wg-check">
                        <input type="checkbox" checked={w.config.sandbox !== false} onChange={(e) => atualizarConfig(w.id, { sandbox: e.target.checked })} />
                        rodar em sandbox isolado (pasta temporária por execução)
                      </label>
                    </>
                  )}
                  {w.tipo === "ia" && <label>pergunta<input value={w.config.pergunta || ""} onChange={(e) => atualizarConfig(w.id, { pergunta: e.target.value })} /></label>}
                  {w.tipo === "metricas" && <label>rótulo<input value={w.config.rotulo || ""} onChange={(e) => atualizarConfig(w.id, { rotulo: e.target.value })} /></label>}
                  <label>atualizar a cada (s, 0 = manual)
                    <input
                      type="number" min="0" max="3600" value={w.atualizarAgora}
                      onChange={(e) => setWidgets((l) => l.map((x) => (x.id === w.id ? { ...x, atualizarAgora: intervaloValido(e.target.value) } : x)))}
                    />
                  </label>
                </div>
              )}

              <div className="wg-corpo">
                <CorpoDoWidget
                  widget={w} tick={tiques[w.id] ?? 0} pedirAprovacao={pedirAprovacao}
                  notificar={notificar} atualizarConfig={atualizarConfig}
                />
              </div>

              <footer className="wg-card-pe">
                {w.atualizarAgora > 0 ? <span>auto {w.atualizarAgora}s</span> : <span>manual</span>}
                {w.tipo !== "terminal" && (
                  <button type="button" onClick={() => setTiques((t) => ({ ...t, [w.id]: (t[w.id] ?? 0) + 1 }))}>atualizar</button>
                )}
              </footer>
            </article>
          ))}
        </section>
      )}

      <div className="wg-avisos" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className="wg-aviso"><strong>{a.titulo}</strong><span>{a.corpo}</span></div>
        ))}
      </div>
      {modal}
    </div>
  );
}
