// Renderização rica das respostas: transforma o texto em blocos visuais.
// Suporta imagem, galeria, vídeo (YouTube/Vimeo/MP4), áudio, código, links e destaque.
import { useMemo, useState } from "react";
import { ArtefatoFrame } from "./artefato.jsx";

const RE_CODIGO = /```([a-z0-9+#-]*)\n?([\s\S]*?)```/gi;
const RE_IMG_MD = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi;
const RE_URL = /(https?:\/\/[^\s<>"')]+)/gi;

const ehImagem = (u) => /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(u) || /^data:image\//i.test(u);
const ehVideo = (u) => /\.(mp4|webm|mov|m3u8)(\?|$)/i.test(u);
const ehAudio = (u) => /\.(mp3|wav|ogg|m4a|flac)(\?|$)/i.test(u);
const youtube = (u) => {
  const m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/i);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
};
const vimeo = (u) => {
  const m = u.match(/vimeo\.com\/(\d+)/i);
  return m ? `https://player.vimeo.com/video/${m[1]}` : null;
};

/** Negrito, itálico e código inline, sem HTML cru. */
function inline(texto, chaveBase) {
  const partes = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g;
  let ultimo = 0;
  let m;
  let i = 0;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    const t = m[0];
    if (t.startsWith("**")) partes.push(<strong key={`${chaveBase}-b${i}`}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) partes.push(<code key={`${chaveBase}-c${i}`} className="inline-code">{t.slice(1, -1)}</code>);
    else partes.push(<em key={`${chaveBase}-i${i}`}>{t.slice(1, -1)}</em>);
    ultimo = m.index + t.length;
    i += 1;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

/** Linha com links clicáveis (imagem solta vira figura). */
function linhaComLinks(texto, chave) {
  const partes = [];
  let ultimo = 0;
  let m;
  let i = 0;
  while ((m = RE_URL.exec(texto))) {
    if (m.index > ultimo) partes.push(...inline(texto.slice(ultimo, m.index), `${chave}-t${i}`));
    const url = m[1];
    if (ehImagem(url)) {
      partes.push(<img key={`${chave}-img${i}`} src={url} alt="" className="rich-img" loading="lazy" />);
    } else if (ehVideo(url)) {
      partes.push(<video key={`${chave}-vid${i}`} src={url} controls playsInline className="rich-video" />);
    } else if (ehAudio(url)) {
      partes.push(<audio key={`${chave}-aud${i}`} src={url} controls className="rich-audio" />);
    } else {
      partes.push(
        <a key={`${chave}-a${i}`} href={url} target="_blank" rel="noopener noreferrer" className="rich-link">{url.replace(/^https?:\/\//, "").slice(0, 60)}</a>,
      );
    }
    ultimo = m.index + url.length;
    i += 1;
  }
  if (ultimo < texto.length) partes.push(...inline(texto.slice(ultimo), `${chave}-tf`));
  return partes;
}

const LINGUAGENS_DE_INTERFACE = ["html", "htm", "svg", "xhtml"];

function BlocoCodigo({ linguagem, codigo }) {
  const [copiado, setCopiado] = useState(false);
  const l = String(linguagem || "").toLowerCase();
  // código de interface vira artefato rodando; nunca despejamos HTML cru na tela
  if (LINGUAGENS_DE_INTERFACE.includes(l) && String(codigo).length > 240) {
    return <ArtefatoFrame html={codigo} linguagem={l === "svg" ? "svg" : "html"} />;
  }
  return (
    <div className="rich-code">
      <div className="rich-code-top">
        <span>{linguagem || "código"}</span>
        <button
          type="button"
          onClick={async () => {
            try { await navigator.clipboard.writeText(codigo); setCopiado(true); setTimeout(() => setCopiado(false), 1500); } catch { /* ignorado */ }
          }}
        >{copiado ? "copiado" : "copiar"}</button>
      </div>
      <pre><code>{codigo}</code></pre>
    </div>
  );
}

/**
 * Converte o texto em nós. `vivo` anima o cursor no fim enquanto o stream corre.
 */
import { embedDeMidia } from "./media.jsx";

export default function RichText({ texto = "", vivo = false }) {
  // fallback: se o modelo devolver um documento HTML solto (sem cerca), vira artefato também
  const textoOriginal = String(texto || "");
  const htmlCru = (() => {
    const bruto = textoOriginal;
    if (bruto.length < 400) return "";
    const m = bruto.match(/(<!doctype html[\s\S]*<\/html>|<html[\s>][\s\S]*<\/html>)/i);
    if (!m) return "";
    if (/```\s*(html|htm|svg)/i.test(bruto)) return "";
    return m[1];
  })();
  const textoVisivel = htmlCru ? String(texto).replace(htmlCru, "").trim() : texto;
  const blocos = useMemo(() => {
    // quando o documento HTML virou artefato, ele sai do texto (nunca mostramos HTML cru)
    const texto = htmlCru ? "" : textoOriginal;
    const saida = [];
    let cursor = 0;
    let chave = 0;
    RE_CODIGO.lastIndex = 0;
    let m;
    const empurrarTexto = (trecho) => {
      if (!trecho) return;
      // imagem em markdown ![alt](url)
      const pedacos = [];
      let ultimo = 0;
      let mi;
      RE_IMG_MD.lastIndex = 0;
      while ((mi = RE_IMG_MD.exec(trecho))) {
        if (mi.index > ultimo) pedacos.push({ tipo: "texto", valor: trecho.slice(ultimo, mi.index) });
        pedacos.push({ tipo: "figura", alt: mi[1], url: mi[2] });
        ultimo = mi.index + mi[0].length;
      }
      if (ultimo < trecho.length) pedacos.push({ tipo: "texto", valor: trecho.slice(ultimo) });
      for (const p of pedacos) {
        if (p.tipo === "texto") {
          for (const paragrafo of p.valor.split(/\n{2,}/)) {
            const limpo = paragrafo.replace(/^\n+|\n+$/g, "");
            if (!limpo.trim()) continue;
            const ehItem = /^\s*[-*•]\s+/m.test(limpo);
            const ehNum = /^\s*\d+[.)]\s+/m.test(limpo);
            if (ehItem || ehNum) {
              const itens = limpo.split("\n").filter((l) => l.trim());
              saida.push({
                tipo: "lista",
                ordenada: ehNum,
                itens: itens.map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")),
                chave: chave++,
              });
            } else {
              saida.push({ tipo: "paragrafo", valor: limpo, chave: chave++ });
            }
          }
        } else {
          saida.push({ ...p, chave: chave++ });
        }
      }
    };
    while ((m = RE_CODIGO.exec(texto))) {
      empurrarTexto(texto.slice(cursor, m.index));
      saida.push({ tipo: "codigo", linguagem: m[1], codigo: m[2].replace(/\n$/, ""), chave: chave++ });
      cursor = m.index + m[0].length;
    }
    empurrarTexto(texto.slice(cursor));
    return saida;
  }, [texto, textoOriginal, htmlCru]);

  const embedDeMidiaSeguro = (url) => {
    try {
      return embedDeMidia(url) || "";
    } catch {
      return "";
    }
  };

  const embedDe = (url) => youtube(url) || vimeo(url) || embedDeMidiaSeguro(url);

  return (
    <div className={`rich${vivo ? " vivo" : ""}`}>
      {htmlCru ? <ArtefatoFrame html={htmlCru} /> : null}
      {blocos.map((b) => {
        if (b.tipo === "codigo") return <BlocoCodigo key={b.chave} linguagem={b.linguagem} codigo={b.codigo} />;
        if (b.tipo === "figura") {
          return (
            <figure key={b.chave} className="rich-figura">
              <a href={b.url} target="_blank" rel="noopener noreferrer"><img src={b.url} alt={b.alt || ""} loading="lazy" /></a>
              {b.alt ? <figcaption>{b.alt}</figcaption> : null}
            </figure>
          );
        }
        if (b.tipo === "lista") {
          const Tag = b.ordenada ? "ol" : "ul";
          return (
            <Tag key={b.chave} className="rich-lista">
              {b.itens.map((item, i) => <li key={i}>{linhaComLinks(item, `l${b.chave}-${i}`)}</li>)}
            </Tag>
          );
        }
        // parágrafo: vídeo do YouTube/Vimeo vira player, mesmo citado no meio do texto
        const urls = b.valor.match(RE_URL) || [];
        const players = [...new Set(urls.map(embedDe).filter(Boolean))];
        const soVideo = players.length === 1 && b.valor.replace(RE_URL, "").trim().length < 4;
        return (
          <div key={b.chave} className="rich-bloco">
            {!soVideo && (
              <p className="rich-p">{linhaComLinks(b.valor, `p${b.chave}`)}</p>
            )}
            {players.map((src, i) => (
              <div key={`emb${i}`} className="rich-embed">
                <iframe src={src} title="vídeo" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
              </div>
            ))}
          </div>
        );
      })}
      {vivo && <span className="caret" aria-hidden="true" />}
    </div>
  );
}
