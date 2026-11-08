// SKYNET · marca visual: símbolo em SVG, wordmark e favicon.
// O símbolo é um nó de três voltas (rede + circuito), desenhado para funcionar
// em 16 px (favicon) e em 200 px (hero) sem depender de imagem externa.
import { useId } from "react";

export function Simbolo({ tamanho = 28, cor = "currentColor", fundo = null }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 48 48" role="img" aria-label="SKYNET">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity="1" />
          <stop offset="100%" stopColor={cor} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {fundo ? <circle cx="24" cy="24" r="23" fill={fundo} /> : null}
      <g fill="none" stroke={`url(#g${id})`} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 7c6 0 11 3.6 11 8s-4.9 8-11 8-11-3.6-11-8 5-8 11-8Z" />
        <path d="M13 15c-3 5.2-2.6 11.7 1.1 16.4C17.8 36.1 21 33 21 33" />
        <path d="M35 15c3 5.2 2.6 11.7-1.1 16.4C30.2 36.1 27 33 27 33" />
        <path d="M17.5 41h13" />
        <circle cx="24" cy="15" r="1.8" fill={cor} stroke="none" />
      </g>
    </svg>
  );
}

export function Wordmark({ tamanho = 16 }) {
  return (
    <span className="marca-palavra" style={{ fontSize: tamanho }}>
      SKY<span>NET</span>
    </span>
  );
}

export function Logotipo({ tamanho = 28, comPalavra = true, cor = "var(--red)" }) {
  return (
    <span className="marca" aria-label="SKYNET">
      <Simbolo tamanho={tamanho} cor={cor} />
      {comPalavra ? <Wordmark tamanho={Math.max(13, Math.round(tamanho * 0.56))} /> : null}
    </span>
  );
}

/** Favicon em data URI, aplicado em runtime quando o index não define um bom. */
export function faviconSvg(cor = "#dc2626") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#0a0a0a"/><g fill="none" stroke="${cor}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M24 9c5.6 0 10 3.1 10 7s-4.4 7-10 7-10-3.1-10-7 4.4-7 10-7Z"/><path d="M14.5 16.5c-2.6 4.6-2.2 10.4 1 14.6 3.2 4.2 6 1.4 6 1.4"/><path d="M33.5 16.5c2.6 4.6 2.2 10.4-1 14.6-3.2 4.2-6 1.4-6 1.4"/><path d="M18.5 39h11"/></g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function aplicarFavicon(cor) {
  if (typeof document === "undefined") return;
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/svg+xml";
  link.href = faviconSvg(cor);
}
