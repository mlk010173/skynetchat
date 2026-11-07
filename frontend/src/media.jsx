// Player de mídia do SKYNET: YouTube, Spotify, SoundCloud, Vimeo e arquivos.
// Funciona no chat (quadro "midia" e links), nos widgets e sozinho com busca.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SUPA_ANON, SUPA_URL } from "./lib.js";
import { HlsPlayer } from "./widgets/avancado.jsx";
import PlayerYoutube, { buscarPrevia, idDoYoutube } from "./widgets/youtube.jsx";

const PROVEDORES = [
  { id: "youtube", rotulo: "YouTube" },
  { id: "spotify", rotulo: "Spotify" },
  { id: "soundcloud", rotulo: "SoundCloud" },
];

function provedorDaUrl(url) {
  const u = String(url || "");
  if (/open\.spotify\.com|spotify\.com/i.test(u)) return "spotify";
  if (/soundcloud\.com/i.test(u)) return "soundcloud";
  if (/vimeo\.com/i.test(u)) return "vimeo";
  if (/(youtube\.com|youtu\.be)/i.test(u)) return "youtube";
  if (/\.m3u8(\?|$)/i.test(u)) return "hls";
  if (/twitch\.tv\//i.test(u)) return "twitch";
  if (/\.(mp3|m4a|ogg|wav|opus)(\?|$)/i.test(u)) return "audio";
  if (/\.(mp4|webm)(\?|$)/i.test(u)) return "video";
  return "";
}

/** Monta o endereço de embed a partir de qualquer link de mídia. */
export function embedDeMidia(url) {
  const p = provedorDaUrl(url);
  if (p === "spotify") {
    const m = String(url).match(/open\.spotify\.com\/(track|album|playlist|episode|show|artist)\/(\w+)/);
    return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&theme=0` : "";
  }
  if (p === "soundcloud") return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23ff4d4d&hide_related=true&show_comments=false`;
  if (p === "youtube") {
    const id = String(url).match(/(?:v=|youtu\.be\/|live\/|shorts\/|embed\/)([\w-]{11})/)?.[1];
    // autoplay: o clique em "enviar" conta como gesto do usuário e libera o som
    return id ? `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1` : "";
  }
  if (p === "twitch") {
    const canal = String(url).match(/twitch\.tv\/([\w]+)/i)?.[1];
    return canal ? `https://player.twitch.tv/?channel=${canal}&parent=${location.hostname}&autoplay=false` : "";
  }
  if (p === "vimeo") {
    const id = String(url).match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : "";
  }
  return "";
}

/** Pergunta ao backend a melhor mídia para o texto. */
export async function buscarMidia(consulta, provedor = "youtube") {
  try {
    const r = await fetch(`${SUPA_URL}/functions/v1/midia`, {
      method: "POST",
      headers: { apikey: SUPA_ANON, "content-type": "application/json" },
      body: JSON.stringify({ consulta, provedor }),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, mensagem: String(e).slice(0, 90) };
  }
}

/** Altura natural do embed por provedor (Spotify e SoundCloud não são 16:9). */
function alturaDe(provedor, embed) {
  if (provedor === "spotify") return /embed\/(track|episode)\//.test(embed) ? 152 : 352;
  if (provedor === "soundcloud") return 166;
  return null;
}

export default function MediaPlayer({ provedor, url, embed, titulo, aviso, compacto = false, onTocar }) {
  const [atual, setAtual] = useState(() => ({
    provedor: provedor || provedorDaUrl(url) || "youtube",
    url: url || "",
    embed: embed || (url ? embedDeMidia(url) : ""),
    titulo: titulo || "",
    aviso: aviso || "",
  }));
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [precisaToque, setPrecisaToque] = useState(false);
  const [previa, setPrevia] = useState(null);
  const frameRef = useRef(null);
  const caixaRef = useRef(null);

  // ao abrir o player, leva ele para a tela (no celular ele nascia abaixo do campo de texto)
  useEffect(() => {
    if (!atual.embed) return;
    const alvo = caixaRef.current;
    const t = !compacto && alvo
      ? setTimeout(() => alvo.scrollIntoView({ behavior: "smooth", block: "center" }), 220)
      : null;
    // o navegador bloqueia som em iframe sem toque: oferece o botão já de saída
    const t2 = setTimeout(() => setPrecisaToque(true), 1800);
    return () => { if (t) clearTimeout(t); clearTimeout(t2); };
  }, [atual.embed, compacto]);

  // O toque é gesto do usuário: recarregar o embed com autoplay aqui dentro
  // é o caminho que o navegador aceita para liberar som (postMessage sozinho é ignorado).
  const tocarComSom = useCallback(() => {
    const f = frameRef.current;
    try {
      f?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), "*");
      f?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "unMute", args: [] }), "*");
    } catch { /* iframe de outro domínio: o reload abaixo resolve */ }
    setAtual((a) => {
      if (!a.embed) return a;
      try {
        const u = new URL(a.embed);
        u.searchParams.set("autoplay", "1");
        u.searchParams.delete("mute");
        if (/youtube\.com/.test(u.host)) {
          u.searchParams.set("enablejsapi", "1");
          u.searchParams.set("origin", location.origin);
        }
        u.searchParams.set("_tocar", String(Date.now()));
        return { ...a, embed: u.toString() };
      } catch {
        return a;
      }
    });
    setPrecisaToque(false);
  }, []);
  const [lista, setLista] = useState([]);
  const caixa = useRef(null);

  useEffect(() => {
    if (embed || url) setAtual({ provedor: provedor || provedorDaUrl(url), url, embed: embed || embedDeMidia(url), titulo: titulo || "", aviso: aviso || "" });
  }, [embed, url, provedor, titulo, aviso]);

  const tocar = useCallback(async (consulta, prov) => {
    const termo = String(consulta || "").trim();
    if (!termo) return;
    setOcupado(true); setErro("");
    const r = await buscarMidia(termo, prov);
    setOcupado(false);
    if (!r?.ok || !r.embed) {
      setErro(r?.mensagem || "não encontrei essa mídia");
      return;
    }
    setAtual({ provedor: r.provedor, url: r.url, embed: r.embed, titulo: r.titulo || termo, aviso: r.aviso || "" });
    setLista((l) => [{ titulo: r.titulo || termo, embed: r.embed, provedor: r.provedor, url: r.url }, ...l.filter((x) => x.embed !== r.embed)].slice(0, 12));
    onTocar?.(r);
  }, [onTocar]);

  const altura = alturaDe(atual.provedor, atual.embed || "");
  const ehHls = atual.provedor === "hls" || /\.m3u8(\?|$)/i.test(atual.url || "");
  const ehArquivo = /\.(mp3|mp4|m4a|ogg|wav|webm)(\?|$)/i.test(atual.url || "");
  const ehAudio = ehArquivo && /\.(mp3|m4a|ogg|wav)(\?|$)/i.test(atual.url || "");

  const idYt = atual.provedor === "youtube" ? idDoYoutube(atual.url || atual.embed) : "";

  const liberarPlanoB = useCallback(() => {
    setPrevia((atualPrevia) => atualPrevia || { carregando: true });
    buscarPrevia(atual.titulo || atual.url)
      .then((r) => setPrevia(r || { vazio: true }))
      .catch(() => setPrevia({ vazio: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual.titulo, atual.url]);

  const midia = useMemo(() => {
    if (ehHls && atual.url) return <HlsPlayer src={atual.url} titulo={atual.titulo} />;
    if (idYt) {
      return <PlayerYoutube videoId={idYt} titulo={atual.titulo} aoFalhar={liberarPlanoB} aoTocar={() => setPrecisaToque(false)} />;
    }
    if (!atual.embed) return null;
    if (ehArquivo) {
      return ehAudio
        ? <audio className="mp-audio" src={atual.url} controls preload="none" />
        : <video className="mp-video" src={atual.url} controls playsInline />;
    }
    return (
      <iframe
        ref={frameRef}
        className="mp-frame"
        src={atual.embed}
        title={atual.titulo || "player"}
        style={altura ? { height: `${altura}px` } : undefined}
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        loading="eager"
      />
    );
  }, [atual, altura, ehArquivo, ehAudio, ehHls]);

  return (
    <section ref={caixaRef} className={`mp ${compacto ? "mp-compacto" : ""}`} aria-label="Player de mídia">
      <header className="mp-top">
        <span className="mp-badge">{atual.provedor}</span>
        <p className="mp-titulo" title={atual.titulo}>{atual.titulo || "player pronto"}</p>
        {atual.url ? (
          <a className="mp-abrir" href={atual.url} target="_blank" rel="noopener noreferrer">abrir no site</a>
        ) : null}
      </header>

      {midia || (
        <div className="mp-vazio">
          <p>Escolha o serviço e diga o que tocar. O player abre aqui dentro, sem sair da conversa.</p>
        </div>
      )}

      {previa?.carregando ? (
        <p className="yt-aviso">Procurando uma prévia que toque aqui…</p>
      ) : null}

      {previa?.url ? (
        <div className="mp-previa">
          <p className="mp-previa-rotulo">
            ▶ {previa.titulo} <span>({previa.fonte})</span>
          </p>
          <audio className="mp-audio" src={previa.url} controls autoPlay preload="auto" />
        </div>
      ) : null}

      {previa?.vazio ? (
        <p className="yt-aviso">Também não encontrei prévia em áudio. Toque em "abrir no site" para ouvir no YouTube.</p>
      ) : null}

      {precisaToque && !idYt && atual.embed && /vimeo/.test(atual.provedor) ? (
        <button type="button" className="mp-toque" onClick={tocarComSom}>
          ▶ Tocar com som
        </button>
      ) : null}

      {/spotify|soundcloud/.test(atual.provedor) && atual.embed ? (
        <p className="mp-dica">
          Toque no ▶ dentro do player do {atual.provedor} para ouvir — esses serviços sempre exigem um toque.
        </p>
      ) : null}

      {!atual.embed && atual.url ? (
        <a className="mp-toque" href={atual.url} target="_blank" rel="noopener noreferrer">
          ▶ Abrir e tocar no {atual.provedor}
        </a>
      ) : null}

      <div className="mp-busca">
        <div className="mp-chips">
          {PROVEDORES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={atual.provedor === p.id ? "ativo" : ""}
              onClick={() => { setAtual((a) => ({ ...a, provedor: p.id })); caixa.current?.focus(); }}
            >{p.rotulo}</button>
          ))}
        </div>
        <div className="mp-linha">
          <input
            ref={caixa}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") tocar(texto, atual.provedor); }}
            placeholder={atual.provedor === "spotify" ? "artista, faixa, álbum ou playlist" : "nome da música, vídeo ou filme"}
          />
          <button type="button" className="botao" disabled={ocupado || !texto.trim()} onClick={() => tocar(texto, atual.provedor)}>
            {ocupado ? "…" : "Tocar"}
          </button>
        </div>
        {atual.aviso ? <p className="mp-aviso">{atual.aviso}</p> : null}
        {erro ? <p className="wg-erro">{erro}</p> : null}
      </div>

      {lista.length > 1 ? (
        <ul className="mp-lista">
          {lista.slice(1).map((l) => (
            <li key={l.embed}>
              <button type="button" onClick={() => setAtual({ provedor: l.provedor, url: l.url, embed: l.embed, titulo: l.titulo })}>
                ▸ {l.titulo}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
