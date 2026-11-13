// SKYNET COMPUTER: navegador real (Chromium no worker) com tela ao vivo e DevTools.
// Nada aqui é simulado: se o browser não sobe, a página mostra o motivo real.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../lib.js";

const ALVOS = [
  ["dom", "DOM"], ["console", "Console"], ["rede", "Rede"],
  ["a11y", "Acessibilidade"], ["performance", "Desempenho"], ["responsivo", "Responsivo"],
];
const L = 1280, A = 800;

const chamar = (acao, extra = {}) => api("computer", { method: "POST", body: { acao, ...extra } }).catch(() => ({ ok: false, erro: "Sem conexão com o servidor." }));

export default function Computador() {
  const loc = useLocation();
  const [aba, setAba] = useState(loc.pathname.startsWith("/inspecionar") ? "inspecionar" : "tela");
  const [sessao, setSessao] = useState(false);
  const [tela, setTela] = useState("");
  const [url, setUrl] = useState("https://example.com");
  const [titulo, setTitulo] = useState("");
  const [abas, setAbas] = useState([]);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [alvo, setAlvo] = useState("dom");
  const [seletor, setSeletor] = useState("");
  const [saida, setSaida] = useState(null);
  const [vivo, setVivo] = useState(true);
  const imgRef = useRef(null);

  const aplicar = useCallback((r) => {
    if (!r) return false;
    if (r.ok === false) {
      setErro(r.motivo === "browser_indisponivel"
        ? `O navegador do servidor não subiu: ${r.detalhe || "sem detalhe"}`
        : r.detalhe || r.erro || "Falhou.");
      return false;
    }
    setErro("");
    const dataUrl = r.tela?.data_url || r.data_url;
    if (dataUrl) setTela(dataUrl);
    if (r.url) setUrl(r.url);
    if (r.titulo !== undefined) setTitulo(r.titulo);
    if (r.abas) setAbas(r.abas);
    return true;
  }, []);

  const rodar = async (acao, extra) => {
    setBusy(true);
    const r = await chamar(acao, extra);
    const ok = aplicar(r);
    setBusy(false);
    return ok ? r : null;
  };

  // sessão que o servidor já tem aberta para esta conta (sobrevive a recarregar a página)
  useEffect(() => {
    let vivo = true;
    api("computer").then((r) => {
      if (!vivo || !r?.ok || !r.sessao) return;
      setSessao(true);
      if (r.sessao.url) setUrl(r.sessao.url);
      chamar("tela").then((t) => vivo && aplicar(t));
    }).catch(() => {});
    return () => { vivo = false; };
  }, [aplicar]);

  // o Render gratuito dorme: o primeiro "iniciar" pode estourar o tempo enquanto o navegador sobe.
  // Tenta de novo sozinho (a 2ª chamada reaproveita a sessão que o servidor acabou de abrir).
  const iniciar = async () => {
    setBusy(true); setErro("Acordando o servidor e abrindo o navegador… pode levar até 1 minuto.");
    let r = null;
    for (let i = 0; i < 3; i++) {
      r = await chamar("iniciar", { url });
      if (r?.ok !== false) break;
      if (!["worker_indisponivel", "browser_indisponivel"].includes(r?.motivo)) break;
      await new Promise((ok) => setTimeout(ok, 4000));
    }
    const ok = aplicar(r);
    if (ok) setSessao(true);
    setBusy(false);
  };
  const encerrar = async () => { await rodar("encerrar"); setSessao(false); setTela(""); setAbas([]); };

  // tela ao vivo: atualiza a cada 2s enquanto a aba está visível
  useEffect(() => {
    if (!sessao || !vivo || aba !== "tela") return undefined;
    let parar = false;
    const t = setInterval(async () => {
      if (document.hidden || busy || parar) return;
      const r = await chamar("tela");
      if (!parar && r?.ok !== false) aplicar(r);
    }, 2000);
    return () => { parar = true; clearInterval(t); };
  }, [sessao, vivo, aba, busy, aplicar]);

  const navegar = (e) => { e.preventDefault(); if (sessao) rodar("navegar", { url }); else iniciar(); };

  const clicarNaTela = (e) => {
    if (!sessao || !imgRef.current) return;
    const r = imgRef.current.getBoundingClientRect();
    rodar("clique", { x: Math.round(((e.clientX - r.left) / r.width) * L), y: Math.round(((e.clientY - r.top) / r.height) * A) });
  };

  const digitar = (e) => { e.preventDefault(); if (texto) { rodar("digitar", { texto }); setTexto(""); } };

  const inspecionar = async (qual = alvo) => {
    setAlvo(qual); setSaida(null);
    const r = await rodar("inspecionar", { alvo: qual, ...(seletor && qual === "dom" ? { seletor } : {}) });
    if (r) setSaida(r.dados ?? r);
  };

  return (
    <main className="pc-page">
      <header className="pc-topo">
        <Link to="/" className="pc-voltar" aria-label="Voltar ao chat">←</Link>
        <h1>SKYNET Computer</h1>
        <span className={`pc-estado ${sessao ? "on" : ""}`}>{sessao ? "navegador ativo" : "desligado"}</span>
        <div className="pc-abas" role="tablist">
          {[["tela", "Tela"], ["inspecionar", "Inspecionar"]].map(([id, nome]) => (
            <button key={id} role="tab" aria-selected={aba === id} className={aba === id ? "ativo" : ""} onClick={() => setAba(id)}>{nome}</button>
          ))}
        </div>
      </header>

      <form className="pc-barra" onSubmit={navegar}>
        <button type="button" disabled={!sessao || busy} onClick={() => rodar("voltar")} aria-label="Voltar">‹</button>
        <button type="button" disabled={!sessao || busy} onClick={() => rodar("avancar")} aria-label="Avançar">›</button>
        <button type="button" disabled={!sessao || busy} onClick={() => rodar("recarregar")} aria-label="Recarregar">↻</button>
        <input value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Endereço" inputMode="url" spellCheck={false} />
        <button type="submit" className="pc-primario" disabled={busy}>{sessao ? "Ir" : "Ligar"}</button>
        {sessao ? <button type="button" onClick={encerrar} disabled={busy}>Encerrar</button> : null}
      </form>

      {erro ? <p className="pc-erro" role="alert">{erro}</p> : null}

      {aba === "tela" ? (
        <section className="pc-tela-area">
          <div className="pc-abas-nav">
            {abas.map((a) => (
              <button key={a.indice} className={a.atual ? "ativo" : ""} onClick={() => rodar("trocar_aba", { indice: a.indice })} title={a.url}>
                {(a.titulo || a.url || "aba").slice(0, 22)}
              </button>
            ))}
            {sessao ? <button onClick={() => rodar("nova_aba", { url: "about:blank" })} aria-label="Nova aba">+</button> : null}
            {sessao ? (
              <label className="pc-vivo"><input type="checkbox" checked={vivo} onChange={(e) => setVivo(e.target.checked)} /> ao vivo</label>
            ) : null}
          </div>
          <div className="pc-moldura">
            {tela ? (
              <img ref={imgRef} src={tela} alt={titulo ? `Tela: ${titulo}` : "Tela do navegador"} onClick={clicarNaTela} draggable={false} />
            ) : (
              <p className="pc-vazio">{busy ? "Abrindo o navegador…" : "Ligue o navegador para ver a tela real aqui."}</p>
            )}
          </div>
          <div className="pc-controles">
            <form onSubmit={digitar} className="pc-digitar">
              <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Texto para digitar no campo focado" disabled={!sessao || busy} aria-label="Texto a digitar" />
              <button disabled={!sessao || busy || !texto}>Digitar</button>
            </form>
            <div className="pc-teclas">
              {["Enter", "Tab", "Escape"].map((t) => <button key={t} disabled={!sessao || busy} onClick={() => rodar("tecla", { tecla: t })}>{t}</button>)}
              <button disabled={!sessao || busy} onClick={() => rodar("rolar", { dy: -400 })} aria-label="Rolar para cima">↑</button>
              <button disabled={!sessao || busy} onClick={() => rodar("rolar", { dy: 400 })} aria-label="Rolar para baixo">↓</button>
            </div>
          </div>
          {titulo ? <p className="pc-titulo">{titulo}</p> : null}
        </section>
      ) : (
        <section className="pc-insp">
          <div className="pc-alvos" role="tablist">
            {ALVOS.map(([id, nome]) => (
              <button key={id} role="tab" aria-selected={alvo === id} className={alvo === id ? "ativo" : ""} disabled={!sessao || busy} onClick={() => inspecionar(id)}>{nome}</button>
            ))}
          </div>
          {alvo === "dom" ? (
            <input className="pc-seletor" value={seletor} onChange={(e) => setSeletor(e.target.value)} placeholder="Seletor CSS opcional (ex: h1, #menu)" aria-label="Seletor CSS" />
          ) : null}
          {!sessao ? <p className="pc-vazio">Ligue o navegador na aba Tela para inspecionar a página aberta.</p> : null}
          {sessao && !saida ? <p className="pc-vazio">Escolha o que inspecionar acima.</p> : null}
          {saida ? <pre className="pc-saida">{JSON.stringify(saida, null, 2).slice(0, 20000)}</pre> : null}
        </section>
      )}
    </main>
  );
}
