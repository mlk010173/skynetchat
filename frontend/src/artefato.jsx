// Artefatos de interface e navegador ao vivo dentro do chat.
// - ArtefatoFrame: transforma um bloco ```html/svg em interface rodando em iframe isolado.
// - NavegadorAoVivo: captura a página de tempos em tempos e mostra o quadro atualizado.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CHAVE_ARTEFATOS = "skynet-artefatos";

function hashSimples(texto) {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function salvarArtefato(html) {
  try {
    const bruto = localStorage.getItem(CHAVE_ARTEFATOS);
    const lista = bruto ? JSON.parse(bruto) : [];
    const id = hashSimples(html);
    if (lista.some((a) => a.id === id)) return id;
    const titulo = (html.match(/<title[^>]*>([^<]{0,80})<\/title>/i)?.[1] || "").trim() || "artefato";
    lista.unshift({ id, titulo, html, em: new Date().toISOString() });
    localStorage.setItem(CHAVE_ARTEFATOS, JSON.stringify(lista.slice(0, 30)));
    return id;
  } catch { return null; }
}

/** Bloco ```html ou ```svg vira interface viva, não código na tela. */
export function ArtefatoFrame({ html, linguagem = "html" }) {
  const [expandido, setExpandido] = useState(false);
  const [verCodigo, setVerCodigo] = useState(false);
  const [versao, setVersao] = useState(0);
  const [salvo, setSalvo] = useState("");
  const ref = useRef(null);

  const doc = useMemo(() => {
    const base = '<base target="_blank">';
    if (linguagem === "svg") {
      return `<!doctype html><html><head><meta charset="utf-8">${base}<style>html,body{margin:0;height:100%;display:grid;place-items:center;background:#0b0b0c}svg{max-width:100%;max-height:100%}</style></head><body>${html}</body></html>`;
    }
    const temDoc = /<html[\s>]/i.test(html);
    const comBase = html.replace(/<head([^>]*)>/i, `<head$1>${base}`);
    return temDoc ? comJoin(comBase) : `<!doctype html><html><head><meta charset="utf-8">${base}<meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%;font-family:system-ui,sans-serif;background:#0b0b0c;color:#f4f4f5}</style></head><body>${html}</body></html>`;
  }, [html, linguagem]);

  useEffect(() => { const id = salvarArtefato(doc); if (id) setSalvo(id); }, [doc]);

  const baixar = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([doc], { type: "text/html" }));
    a.download = `artefato-${hashSimples(doc)}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const quadro = (alto) => (
    <iframe
      key={`${versao}-${alto}`}
      ref={ref}
      title="Artefato"
      className={`art-frame ${alto ? "art-cheio" : ""}`}
      sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
      srcDoc={doc}
      loading="lazy"
    />
  );

  return (
    <div className="art">
      <div className="art-topo">
        <span className="art-selo">interface ao vivo</span>
        <span className="art-nome">{linguagem.toUpperCase()}</span>
        <div className="art-acoes">
          <button type="button" onClick={() => setVersao((v) => v + 1)} title="Recarregar">↻</button>
          <button type="button" onClick={() => setExpandido((v) => !v)} title="Tamanho">{expandido ? "⤡" : "⤢"}</button>
          <button type="button" onClick={() => setVerCodigo((v) => !v)} title="Ver o código">{verCodigo ? "▤" : "</>"}</button>
          <button type="button" onClick={baixar} title="Baixar .html">↓</button>
        </div>
      </div>
      {verCodigo ? (
        <pre className="art-codigo"><code>{html}</code></pre>
      ) : (
        <div className="art-tela">{quadro(false)}</div>
      )}
      {salvo ? <p className="art-nota">guardado no seu navegador · artefato {salvo}</p> : null}
      {expandido ? (
        <div className="art-overlay" role="dialog" aria-label="Artefato em tela cheia" onClick={() => setExpandido(false)}>
          <div className="art-overlay-caixa" onClick={(e) => e.stopPropagation()}>
            {quadro(true)}
            <button type="button" className="art-fechar" onClick={() => setExpandido(false)}>fechar ✕</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function comJoin(x) { return x; }

/** Captura a página em intervalos e atualiza o quadro, com selo ao vivo. */
export function NavegadorAoVivo({ alvo, inicial, provedor = "" }) {
  const [url, setUrl] = useState(inicial || "");
  const [segundos, setSegundos] = useState(0);
  const [intervalo, setIntervalo] = useState(10);
  const [rodando, setRodando] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [cheio, setCheio] = useState(false);
  const [capturas, setCapturas] = useState(1);

  const capturar = useCallback(async () => {
    if (!alvo || carregando) return;
    setCarregando(true); setErro("");
    try {
      const base = (import.meta?.env?.VITE_SUPABASE_URL) || "";
      const anon = (import.meta?.env?.VITE_SUPABASE_ANON_KEY) || "";
      const r = await fetch(`${base}/functions/v1/print?url=${encodeURIComponent(alvo)}&t=${Date.now()}`, {
        headers: anon ? { apikey: anon } : {},
      });
      const d = await r.json().catch(() => null);
      if (d?.ok && d.url) { setUrl(d.url); setCapturas((c) => c + 1); }
      else setErro(d?.erro || "não foi possível capturar agora");
    } catch (e) { setErro("falha de rede na captura"); }
    setCarregando(false);
  }, [alvo, carregando]);

  useEffect(() => {
    if (!rodando || !alvo) return undefined;
    const t = setInterval(capturar, intervalo * 1000);
    return () => clearInterval(t);
  }, [rodando, intervalo, alvo, capturar]);

  useEffect(() => {
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const tela = (
    <div className="nav-ao-vivo">
      {url ? (
        <img className="nav-quadro" src={url} alt={`Captura de ${alvo}`} />
      ) : (
        <div className="nav-vazio">capturando a primeira imagem…</div>
      )}
      <div className="nav-topo">
        <span className={`nav-selo ${rodando ? "ligado" : ""}`}>{rodando ? "AO VIVO" : "PAUSADO"}</span>
        <span className="nav-alvo" title={alvo}>{alvo?.replace(/^https?:\/\//, "")}</span>
        <button type="button" onClick={capturar} disabled={carregando}>{carregando ? "…" : "atualizar"}</button>
        <select aria-label="Intervalo" value={intervalo} onChange={(e) => setIntervalo(Number(e.target.value))}>
          {[5, 10, 30, 60].map((s) => <option key={s} value={s}>{s}s</option>)}
        </select>
        <button type="button" onClick={() => setRodando((v) => !v)}>{rodando ? "❚❚" : "▶"}</button>
        <button type="button" onClick={() => setCheio(true)} title="Tela cheia">⤢</button>
      </div>
      <p className="nav-nota">
        captura real · {capturas} quadro{capturas > 1 ? "s" : ""} · {segundos}s
        {provedor ? ` · ${provedor}` : ""}{erro ? ` · ${erro}` : ""}
      </p>
    </div>
  );

  if (!cheio) return tela;
  return (
    <div className="nav-cheio" role="dialog" aria-label="Navegador ao vivo" onClick={() => setCheio(false)}>
      <div className="nav-cheio-caixa" onClick={(e) => e.stopPropagation()}>
        {tela}
        <button type="button" className="art-fechar" onClick={() => setCheio(false)}>fechar ✕</button>
      </div>
    </div>
  );
}

export function listarArtefatos() {
  try { return JSON.parse(localStorage.getItem(CHAVE_ARTEFATOS) || "[]"); } catch { return []; }
}
