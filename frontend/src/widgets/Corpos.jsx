// Corpos dos widgets: cada tipo sabe buscar seus dados e se desenhar.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, askOnce, SUPA_URL, SUPA_ANON } from "../lib.js";
import MediaPlayer from "../media.jsx";
import { ImagemIaBody } from "./avancado.jsx";

/* ---------- utilidades ---------- */

export function useRelogio(intervalo, ativo = true) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!ativo || !intervalo) return;
    const t = setInterval(() => setTick((n) => n + 1), intervalo * 1000);
    return () => clearInterval(t);
  }, [intervalo, ativo]);
  return tick;
}

function quando(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function Skeleton({ linhas = 3 }) {
  return (
    <div className="wg-skel" aria-hidden="true">
      {Array.from({ length: linhas }).map((_, i) => <span key={i} />)}
    </div>
  );
}

/* ---------- status do sistema ---------- */

export function StatusBody({ config, tick }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const buscar = useCallback(async () => {
    const d = await api("status");
    if (d?.ok) { setDados(d); setErro(""); } else setErro(d?.error || "sem resposta");
  }, []);
  useEffect(() => { buscar(); }, [buscar, tick]);

  if (!dados && !erro) return <Skeleton />;
  if (erro) return <p className="wg-erro">{erro}</p>;
  const linhas = [
    { nome: "banco", ok: dados.banco === "ok", nota: dados.banco },
    ...(dados.integracoes ?? []).map((i) => ({ nome: i.motor, ok: i.ok, nota: i.ms ? `${i.ms}ms` : i.erro })),
  ];
  return (
    <div className="wg-status">
      {linhas.map((l) => (
        <div key={l.nome} className="wg-linha">
          <span className={`wg-dot ${l.ok ? "on" : "off"}`} />
          <span className="wg-nome">{l.nome}</span>
          <span className="wg-nota">{String(l.nota ?? "").slice(0, 26)}</span>
        </div>
      ))}
      {dados.numeros ? (
        <p className="wg-pe">{dados.numeros.contas} contas · {dados.numeros.conversas} conversas · {dados.numeros.mensagens} mensagens</p>
      ) : null}
      <p className="wg-pe">verificado {quando(dados.verificado_em)}</p>
    </div>
  );
}

/* ---------- métricas com gráfico ---------- */

export function MetricasBody({ config, tick }) {
  const [serie, setSerie] = useState([]);
  const [erro, setErro] = useState("");
  useEffect(() => {
    let ativo = true;
    (async () => {
      const d = await api("status");
      if (!ativo) return;
      if (!d?.ok) { setErro(d?.error || "sem resposta"); return; }
      const valor = config.metrica === "chamadas" ? d.uso_24h?.chamadas_api ?? 0
        : config.metrica === "erros" ? d.uso_24h?.erros ?? 0
        : d.resposta_ms ?? 0;
      setSerie((s) => [...s.slice(-39), { t: Date.now(), v: Number(valor) || 0 }]);
      setErro("");
    })();
    return () => { ativo = false; };
  }, [config.metrica, tick]);

  const max = Math.max(1, ...serie.map((p) => p.v));
  const min = Math.min(...serie.map((p) => p.v), 0);
  const pontos = useMemo(() => {
    if (serie.length < 2) return "";
    const larg = 100, alt = 34;
    return serie.map((p, i) => {
      const x = (i / (serie.length - 1)) * larg;
      const y = alt - ((p.v - min) / Math.max(1, max - min)) * alt;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }, [serie, max, min]);

  const ultimo = serie[serie.length - 1]?.v ?? 0;
  return (
    <div className="wg-metricas">
      <div className="wg-num">
        <strong>{ultimo}</strong>
        <span>{config.rotulo || config.metrica}</span>
      </div>
      {pontos ? (
        <svg viewBox="0 0 100 34" preserveAspectRatio="none" className="wg-spark" role="img" aria-label="série temporal">
          <polyline points={pontos} fill="none" stroke="var(--wg-accent, #ff4d4d)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
        </svg>
      ) : <p className="wg-pe">coletando…</p>}
      <p className="wg-pe">{serie.length} amostra(s)</p>
      {erro ? <p className="wg-erro">{erro}</p> : null}
    </div>
  );
}

/* ---------- notícias ao vivo ---------- */

export function NoticiasBody({ config, tick }) {
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    let ativo = true;
    (async () => {
      const r = await api("agent", { method: "POST", body: { tool: "web_pesquisar", payload: { consulta: config.consulta } } });
      if (!ativo) return;
      const lista = r?.resultado?.resultados ?? r?.resultados ?? [];
      if (Array.isArray(lista) && lista.length) {
        setItens(lista.slice(0, Number(config.limite) || 5).map((x) => ({ titulo: x.titulo || x.title, url: x.url || x.link })));
        setErro("");
      } else setErro(r?.error || r?.resultado?.erro || "sem manchetes agora");
    })();
    return () => { ativo = false; };
  }, [config.consulta, config.limite, tick]);

  if (erro) return <p className="wg-erro">{erro}</p>;
  if (!itens) return <Skeleton linhas={4} />;
  return (
    <ul className="wg-noticias">
      {itens.map((n, i) => (
        <li key={i}>
          <a href={n.url} target="_blank" rel="noopener noreferrer">{n.titulo}</a>
        </li>
      ))}
    </ul>
  );
}

/* ---------- GitHub ---------- */

export function GithubBody({ config, tick }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    let ativo = true;
    (async () => {
      const repo = String(config.repo || "").trim();
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { setErro("use o formato dono/repositório"); return; }
      const base = visao => `https://api.github.com/repos/${repo}${visao}`;
      const alvo = config.visao === "arquivos" ? "/contents/" + (config.caminho || "") : config.visao === "commits" ? "/commits?per_page=6" : "";
      try {
        const r = await fetch(base(alvo), { headers: { Accept: "application/vnd.github+json" } });
        const d = await r.json();
        if (!ativo) return;
        if (!r.ok) { setErro(d?.message || `HTTP ${r.status}`); return; }
        setDados(d); setErro("");
      } catch (e) { setErro(String(e).slice(0, 70)); }
    })();
    return () => { ativo = false; };
  }, [config.repo, config.visao, config.caminho, tick]);

  if (erro) return <p className="wg-erro">{erro}</p>;
  if (!dados) return <Skeleton />;
  if (config.visao === "commits") {
    return (
      <ul className="wg-lista">
        {dados.map((c) => (
          <li key={c.sha}>
            <a href={c.html_url} target="_blank" rel="noopener noreferrer">{String(c.commit?.message || "").split("\n")[0].slice(0, 70)}</a>
            <small>{c.commit?.author?.name} · {quando(c.commit?.author?.date)}</small>
          </li>
        ))}
      </ul>
    );
  }
  if (config.visao === "arquivos") {
    return (
      <ul className="wg-lista">
        {dados.slice(0, 30).map((f) => (
          <li key={f.path}>
            <a href={f.html_url} target="_blank" rel="noopener noreferrer">{f.type === "dir" ? "▸ " : ""}{f.name}</a>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="wg-repo">
      <a className="wg-repo-nome" href={dados.html_url} target="_blank" rel="noopener noreferrer">{dados.full_name}</a>
      <p className="wg-pe">{dados.description || "sem descrição"}</p>
      <p className="wg-pe">★ {dados.stargazers_count} · forks {dados.forks_count} · {dados.language || "—"} · atualizado {quando(dados.updated_at)}</p>
    </div>
  );
}

/* ---------- vídeo / live ---------- */

export function VideoBody({ config }) {
  const url = String(config.url || "");
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/live\/)([\w-]{6,})/i);
  const vimeo = url.match(/vimeo\.com\/(\d+)/i);
  const src = yt ? `https://www.youtube.com/embed/${yt[1]}` : vimeo ? `https://player.vimeo.com/video/${vimeo[1]}` : null;
  if (src) {
    return (
      <div className="wg-embed">
        <iframe src={src} title={config.titulo || "vídeo"} allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowFullScreen />
      </div>
    );
  }
  if (/\.(mp4|webm)(\?|$)/i.test(url)) return <video className="wg-video" src={url} controls playsInline />;
  return <p className="wg-erro">cole um link do YouTube, Vimeo ou um arquivo .mp4</p>;
}

/* ---------- player de mídia ---------- */

export function MidiaBody({ config, atualizarConfig }) {
  return (
    <MediaPlayer
      provedor={config.provedor || "youtube"}
      url={config.url || ""}
      titulo={config.titulo || ""}
      onTocar={(r) => atualizarConfig({ provedor: r.provedor, url: r.url, titulo: r.titulo || "" })}
    />
  );
}

/* ---------- imagem por IA ---------- */

export function ImagemBody({ config, atualizarConfig, tick }) {
  return <ImagemIaBody config={{ ...config, __tick: tick }} atualizarConfig={atualizarConfig} />;
}

/* ---------- galeria multimídia ---------- */

const ehImagem = (u) => /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(u) || /^data:image\//i.test(u);

export function GaleriaBody({ config, atualizarConfig }) {
  const itens = Array.isArray(config.itens) ? config.itens : [];
  const [novo, setNovo] = useState("");
  const [modo, setModo] = useState("auto");

  const adicionar = () => {
    const v = novo.trim();
    if (!v) return;
    atualizarConfig({ itens: [...itens, v].slice(0, 12) });
    setNovo("");
  };
  const remover = (i) => atualizarConfig({ itens: itens.filter((_, j) => j !== i) });

  return (
    <div className="wg-galeria">
      <div className="wg-galeria-add">
        <input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") adicionar(); }}
          placeholder="cole um link de vídeo, música ou imagem"
        />
        <button type="button" className="botao" onClick={adicionar} disabled={!novo.trim()}>Adicionar</button>
      </div>
      {itens.length === 0 ? (
        <p className="wg-pe">Nada na galeria ainda. YouTube, Spotify, SoundCloud, Vimeo, MP4, MP3 e imagens entram aqui, em grade.</p>
      ) : (
        <div className={`wg-galeria-grade ${modo === "video" ? "so-video" : ""}`}>
          {itens.map((url, i) => (
            <figure key={`${url}-${i}`} className="wg-galeria-item">
              <button type="button" className="wg-galeria-x" title="Remover" onClick={() => remover(i)}>×</button>
              {ehImagem(url) ? (
                <img src={url} alt="" loading="lazy" />
              ) : (
                <MediaPlayer compacto url={url} titulo={url.split("/").pop()} />
              )}
            </figure>
          ))}
        </div>
      )}
      {itens.length > 1 ? (
        <button type="button" className="wg-galeria-modo" onClick={() => setModo(modo === "video" ? "auto" : "video")}>
          {modo === "video" ? "mostrar tudo" : "só o primeiro em destaque"}
        </button>
      ) : null}
    </div>
  );
}

/* ---------- terminal (com aprovação) ---------- */

export function TerminalBody({ config, pedirAprovacao, tick }) {
  const [saida, setSaida] = useState("");
  const [estado, setEstado] = useState("parado");
  const executar = useCallback(async () => {
    const cmd = String(config.comando || "").trim();
    if (!cmd) return;
    const isolado = config.sandbox !== false;
    const alvo = isolado
      ? `mkdir -p /tmp/skynet-sandbox && cd /tmp/skynet-sandbox && ${cmd}`
      : cmd;
    const liberado = await pedirAprovacao({
      titulo: isolado ? "Executar no sandbox isolado" : "Executar comando no servidor",
      detalhe: cmd,
    });
    if (!liberado) return;
    setEstado("rodando"); setSaida("");
    const r = await api("agent", { method: "POST", body: { tool: "terminal", payload: { cmd: alvo } } });
    const out = r?.resultado?.saida ?? r?.resultado?.stdout ?? r?.error ?? "";
    setSaida(String(out).slice(0, 4000) || "(sem saída)");
    setEstado("pronto");
  }, [config.comando, pedirAprovacao]);

  return (
    <div className="wg-terminal">
      <div className="wg-term-top">
        <code>$ {config.comando || "—"}</code>
        <button type="button" onClick={executar} disabled={estado === "rodando"}>{estado === "rodando" ? "…" : "executar"}</button>
      </div>
      <pre className="wg-saida">{saida || "aguardando execução"}</pre>
      <p className="wg-pe">{config.sandbox === false ? "roda no diretório do agente" : "sandbox: pasta temporária /tmp/skynet-sandbox por execução"} · cada execução pede aprovação</p>
    </div>
  );
}

/* ---------- widget de IA ---------- */

export function IaBody({ config, tick }) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const ultimoTick = useRef(-1);
  useEffect(() => {
    if (tick === ultimoTick.current) return;
    ultimoTick.current = tick;
    let ativo = true;
    setCarregando(true);
    (async () => {
      const r = await askOnce({ content: config.pergunta });
      if (!ativo) return;
      setCarregando(false);
      if (r?.ok === false) { setErro(r.erro || "falha ao perguntar"); return; }
      setTexto(String(r?.texto ?? r ?? "").slice(0, 1200));
      setErro("");
    })();
    return () => { ativo = false; };
  }, [config.pergunta, tick]);

  return (
    <div className="wg-ia">
      <p className="wg-pe">{config.pergunta}</p>
      {carregando && !texto ? <Skeleton linhas={3} /> : <p className="wg-texto">{texto || "…"}</p>}
      {erro ? <p className="wg-erro">{erro}</p> : null}
    </div>
  );
}

/* ---------- nota ---------- */

export function TextoBody({ config, onChange }) {
  const [valor, setValor] = useState(config.texto || "");
  return (
    <textarea
      className="wg-nota"
      value={valor}
      placeholder="sua anotação…"
      onChange={(e) => setValor(e.target.value)}
      onBlur={() => onChange({ texto: valor })}
    />
  );
}

export { Skeleton, quando, SUPA_URL, SUPA_ANON };
