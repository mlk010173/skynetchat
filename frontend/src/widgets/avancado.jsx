// Mídia avançada dos widgets: HLS ao vivo, imagem gerada por IA e ampliação.
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib.js";

const CDN_HLS = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";

function carregarHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (window.__hlsPromessa) return window.__hlsPromessa;
  window.__hlsPromessa = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CDN_HLS;
    s.async = true;
    s.onload = () => (window.Hls ? resolve(window.Hls) : reject(new Error("hls.js não carregou")));
    s.onerror = () => reject(new Error("falha ao baixar hls.js"));
    document.head.appendChild(s);
  });
  return window.__hlsPromessa;
}

/** Player HLS (transmissão ao vivo .m3u8) com velocidade, mudo, PiP e tela cheia. */
export function HlsPlayer({ src, poster, titulo }) {
  const video = useRef(null);
  const [estado, setEstado] = useState("carregando");
  const [erro, setErro] = useState("");
  const [mudo, setMudo] = useState(true);
  const [vel, setVel] = useState(1);
  const [teatro, setTeatro] = useState(false);

  useEffect(() => {
    let hls = null;
    let cancelado = false;
    const v = video.current;
    if (!v || !src) return undefined;
    if (v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = src;
      setEstado("pronto");
      return () => { v.removeAttribute("src"); v.load(); };
    }
    carregarHls()
      .then((Hls) => {
        if (cancelado || !Hls.isSupported()) throw new Error("HLS não suportado");
        hls = new Hls({ lowLatencyMode: true, enableWorker: true });
        hls.loadSource(src);
        hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, () => setEstado("pronto"));
        hls.on(Hls.Events.ERROR, (_e, d) => {
          if (d?.fatal) { setErro("transmissão interrompida"); setEstado("erro"); }
        });
      })
      .catch((e) => { setErro(String(e.message || e)); setEstado("erro"); });
    return () => {
      cancelado = true;
      hls?.destroy();
    };
  }, [src]);

  useEffect(() => { if (video.current) { video.current.muted = mudo; video.current.playbackRate = vel; } }, [mudo, vel]);

  const pip = async () => {
    const v = video.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch { setErro("PiP indisponível neste navegador"); }
  };

  return (
    <div className={`hls ${teatro ? "hls-teatro" : ""}`}>
      <video ref={video} className="hls-video" poster={poster} controls playsInline muted={mudo} autoPlay />
      <div className="hls-barra">
        <span className={`hls-selo ${estado}`}>
          {estado === "carregando" ? "conectando…" : estado === "erro" ? erro : "ao vivo"}
        </span>
        <span className="hls-titulo" title={titulo}>{titulo || "transmissão"}</span>
        <select aria-label="Velocidade" value={vel} onChange={(e) => setVel(Number(e.target.value))}>
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((x) => <option key={x} value={x}>{x}×</option>)}
        </select>
        <button type="button" onClick={() => setMudo((m) => !m)} title="Som">{mudo ? "🔇" : "🔊"}</button>
        <button type="button" onClick={pip} title="Picture-in-picture">⧉</button>
        <button type="button" onClick={() => setTeatro((t) => !t)} title="Tamanho">{teatro ? "⤡" : "⤢"}</button>
      </div>
    </div>
  );
}

const ESTILOS = [
  ["fotorrealista", "fotorrealista, lente 50mm, luz natural"],
  ["cinematográfico", "cinematográfico, anamórfico, contraste alto"],
  ["3D", "render 3D, octane, materiais realistas"],
  ["anime", "anime, traço limpo, cores vivas"],
  ["minimalista", "minimalista, fundo liso, poucos elementos"],
];

/** Widget de imagem ao vivo: gera por IA, aceita URL própria e atualiza sozinho. */
export function ImagemIaBody({ config, atualizarConfig }) {
  const [url, setUrl] = useState(config.url || "");
  const [prompt, setPrompt] = useState(config.prompt || "");
  const [estilo, setEstilo] = useState(config.estilo || "fotorrealista");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [info, setInfo] = useState("");
  const [zoom, setZoom] = useState(false);
  const ultimoTick = useRef(-1);

  const gerar = useCallback(async (texto) => {
    const p = String(texto || "").trim();
    if (!p || carregando) return;
    setCarregando(true); setErro(""); setInfo("");
    const descricao = `${p}, ${ESTILOS.find(([k]) => k === estilo)?.[1] || ""}`.trim();
    let d = await api("imagem", { method: "POST", body: { prompt: descricao, n: 1 } });
    if (!d?.ok) d = await api("agent", { method: "POST", body: { tool: "imagem", payload: { prompt: descricao } } });
    setCarregando(false);
    const link = d?.data_url || d?.url || d?.imagem || d?.resultado?.url || "";
    if (!link) { setErro(d?.erro || d?.error || "não foi possível gerar agora"); return; }
    setUrl(link);
    atualizarConfig({ url: link, prompt: p, estilo, geradoEm: new Date().toISOString() });
    setInfo(`${d?.provedor || d?.resultado?.provedor || "gerador"} · ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
  }, [carregando, estilo, atualizarConfig]);

  // atualização automática do widget
  useEffect(() => {
    const tick = Number(config.__tick ?? 0);
    if (tick === ultimoTick.current) return;
    ultimoTick.current = tick;
    if (tick > 0 && (config.prompt || "").trim()) gerar(config.prompt);
  }, [config.__tick, config.prompt, gerar]);

  return (
    <div className="ia-img">
      <div className="ia-img-tela">
        {url ? (
          <button type="button" className="ia-img-abrir" onClick={() => setZoom(true)} title="Ampliar">
            <img src={url} alt={prompt || "imagem gerada"} loading="lazy" />
          </button>
        ) : (
          <div className="ia-img-vazio" aria-hidden="true">descreva a imagem abaixo</div>
        )}
        {carregando && <div className="ia-img-carregando"><span /></div>}
      </div>

      <div className="ia-img-controles">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") gerar(prompt); }}
          placeholder="o que deve aparecer na imagem"
          aria-label="Descrição da imagem"
        />
        <button type="button" className="botao" disabled={carregando || !prompt.trim()} onClick={() => gerar(prompt)}>
          {carregando ? "gerando…" : url ? "gerar outra" : "gerar"}
        </button>
      </div>
      <div className="ia-img-estilos">
        {ESTILOS.map(([k]) => (
          <button key={k} type="button" className={estilo === k ? "ativo" : ""} onClick={() => setEstilo(k)}>{k}</button>
        ))}
      </div>
      {info ? <p className="wg-pe">{info}</p> : null}
      {erro ? <p className="wg-erro">{erro}</p> : null}

      {zoom && url ? (
        <div className="ia-img-zoom" role="dialog" aria-label="Imagem ampliada" onClick={() => setZoom(false)}>
          <img src={url} alt={prompt || "imagem"} />
          <span className="ia-img-zoom-dica">clique para fechar</span>
        </div>
      ) : null}
    </div>
  );
}

/** Ampliação de qualquer mídia estática (usada na galeria). */
export function Lightbox({ url, alt, onFechar }) {
  if (!url) return null;
  return (
    <div className="ia-img-zoom" role="dialog" aria-label="Mídia ampliada" onClick={onFechar}>
      <img src={url} alt={alt || ""} />
      <span className="ia-img-zoom-dica">clique para fechar</span>
    </div>
  );
}
