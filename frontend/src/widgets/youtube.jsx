// Player oficial do YouTube (IFrame API) com tres camadas de garantia de som:
// 1) autoplay quando o player fica pronto; 2) botao ▶ que chama playVideo() no toque
// do usuario (gesto que libera o audio); 3) se o YouTube recusar o video (erros
// 101/150/153 ou o muro "confirme que voce nao e um robo"), o cartao cai para uma
// previa de audio real (iTunes/Deezer) que toca em <audio>, sem depender de embed.
import { useCallback, useEffect, useRef, useState } from "react";

const API_URL = "https://www.youtube.com/iframe_api";

let carregandoApi = null;
function carregarApi() {
  if (typeof window === "undefined") return Promise.reject(new Error("sem janela"));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (carregandoApi) return carregandoApi;
  carregandoApi = new Promise((ok, falhou) => {
    const antes = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (antes) antes();
      ok(window.YT);
    };
    const tag = document.createElement("script");
    tag.src = API_URL;
    tag.async = true;
    tag.onerror = () => falhou(new Error("api do youtube nao carregou"));
    document.head.appendChild(tag);
    setTimeout(() => (window.YT && window.YT.Player ? ok(window.YT) : falhou(new Error("tempo esgotado"))), 12000);
  });
  return carregandoApi;
}

export function idDoYoutube(url) {
  const m = String(url || "").match(/(?:v=|youtu\.be\/|live\/|shorts\/|embed\/)([\w-]{11})/);
  return m ? m[1] : "";
}

/** Previa de audio (30s) de fontes que tocam direto, sem bloqueio de embed. */
export async function buscarPrevia(consulta) {
  const termo = String(consulta || "").trim();
  if (!termo) return null;
  const limpa = termo.replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  try {
    const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(limpa)}&media=music&entity=song&limit=1`);
    if (r.ok) {
      const d = await r.json();
      const item = d && d.results && d.results[0];
      if (item && item.previewUrl) {
        return { url: item.previewUrl, titulo: `${item.trackName} — ${item.artistName}`, fonte: "Apple Music (prévia)" };
      }
    }
  } catch { /* tenta a proxima fonte */ }
  try {
    const r = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(limpa)}&limit=1`);
    if (r.ok) {
      const d = await r.json();
      const item = d && d.data && d.data[0];
      if (item && item.preview) {
        return { url: item.preview, titulo: `${item.title} — ${item.artist ? item.artist.name : ""}`, fonte: "Deezer (prévia)" };
      }
    }
  } catch { /* sem previa */ }
  return null;
}

export default function PlayerYoutube({ videoId, titulo, aoFalhar, aoTocar }) {
  const alvo = useRef(null);
  const player = useRef(null);
  const [estado, setEstado] = useState(-1);
  const [pronto, setPronto] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const montado = useRef(true);
  const falhaRef = useRef(aoFalhar);
  falhaRef.current = aoFalhar;

  const tocar = useCallback(() => {
    const p = player.current;
    if (!p) return;
    try {
      if (p.unMute) p.unMute();
      if (p.setVolume) p.setVolume(100);
      if (p.playVideo) p.playVideo();
      if (aoTocar) aoTocar();
    } catch { /* o link de abrir no site continua disponivel */ }
  }, [aoTocar]);

  useEffect(() => {
    montado.current = true;
    let relogio = null;
    if (!videoId) return undefined;

    carregarApi()
      .then((YT) => {
        if (!montado.current || !alvo.current) return;
        player.current = new YT.Player(alvo.current, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1, autoplay: 1, origin: window.location.origin },
          events: {
            onReady: (e) => {
              setPronto(true);
              try {
                if (e.target.unMute) e.target.unMute();
                if (e.target.setVolume) e.target.setVolume(100);
                if (e.target.playVideo) e.target.playVideo();
              } catch { /* o botao resolve */ }
            },
            onStateChange: (e) => setEstado(e.data),
            onError: () => {
              setFalhou(true);
              if (falhaRef.current) falhaRef.current();
            },
          },
        });
        relogio = setTimeout(() => {
          if (!montado.current) return;
          const p = player.current;
          const st = p && p.getPlayerState ? p.getPlayerState() : -1;
          const dados = p && p.getVideoData ? p.getVideoData() : {};
          const travado = st === -1 || st === 5 || dados.isPlayable === false;
          if (travado) {
            setFalhou(true);
            if (falhaRef.current) falhaRef.current();
          }
        }, 7000);
      })
      .catch(() => {
        setFalhou(true);
        if (falhaRef.current) falhaRef.current();
      });

    return () => {
      montado.current = false;
      if (relogio) clearTimeout(relogio);
      try { if (player.current && player.current.destroy) player.current.destroy(); } catch { /* ja removido */ }
      player.current = null;
    };
  }, [videoId]);

  const tocando = estado === 1 || estado === 3;

  return (
    <div className="yt-oficial">
      <div ref={alvo} className="yt-alvo" />
      {!tocando ? (
        <button type="button" className="mp-toque yt-play" onClick={tocar} aria-label={`Tocar ${titulo || "video"}`}>
          ▶ {pronto ? "Tocar com som" : "Carregando o player…"}
        </button>
      ) : null}
      {falhou ? (
        <p className="yt-aviso">O YouTube não liberou este vídeo aqui. Use a prévia abaixo ou abra no site.</p>
      ) : null}
    </div>
  );
}
