import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib.js";
import { useAuth } from "../auth.jsx";

const ATALHOS = ["help", "ls", "tree", "du", "date", "curl https://example.com"];

export default function Sandbox() {
  const { autenticado } = useAuth();
  const [linhas, setLinhas] = useState([
    { tipo: "sys", texto: "Terminal isolado do SKYNET. Cada conta tem a própria pasta, nada roda na máquina do servidor." },
    { tipo: "sys", texto: 'Digite "help" para ver os comandos. Enter executa, ↑ repete o anterior.' },
  ]);
  const [cmd, setCmd] = useState("");
  const [cwd, setCwd] = useState("");
  const [rodando, setRodando] = useState(false);
  const [uso, setUso] = useState({ arquivos: [], bytes: 0, limite: 0 });
  const [historico, setHistorico] = useState([]);
  const [indiceHist, setIndiceHist] = useState(-1);
  const saidaRef = useRef(null);
  const inputRef = useRef(null);

  const carregar = useCallback(async () => {
    const d = await api("sandbox");
    if (d?.ok) {
      setUso({ arquivos: d.arquivos ?? [], bytes: d.uso ?? 0, limite: d.limite ?? 0 });
      setHistorico((d.historico ?? []).map((h) => h.comando).filter(Boolean));
    }
  }, []);

  useEffect(() => {
    if (autenticado) carregar();
  }, [autenticado, carregar]);

  useEffect(() => {
    if (saidaRef.current) saidaRef.current.scrollTop = saidaRef.current.scrollHeight;
  }, [linhas]);

  const executar = useCallback(
    async (comando) => {
      const texto = (comando ?? cmd).trim();
      if (!texto || rodando) return;
      setCmd("");
      setIndiceHist(-1);
      if (texto === "clear") {
        setLinhas([]);
        return;
      }
      setLinhas((prev) => [...prev, { tipo: "cmd", texto, cwd }]);
      setRodando(true);
      const r = await api("sandbox?action=exec", { method: "POST", body: { cmd: texto, cwd } });
      setRodando(false);
      if (!r?.ok && !r?.saida) {
        setLinhas((prev) => [...prev, { tipo: "erro", texto: r?.error || "não consegui executar" }]);
        return;
      }
      if (typeof r.cwd === "string") setCwd(r.cwd);
      const texto_saida = String(r.saida ?? "");
      setLinhas((prev) => {
        const novas = texto_saida
          ? [...prev, { tipo: r.ok ? "out" : "erro", texto: texto_saida }]
          : [...prev, { tipo: "out", texto: "(sem saída)" }];
        return novas.slice(-120);
      });
      carregar();
    },
    [api, cmd, cwd, rodando, carregar],
  );

  const tecla = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      executar();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const lista = historico.length ? historico : linhas.filter((l) => l.tipo === "cmd").map((l) => l.texto);
      if (!lista.length) return;
      const proximo = Math.min(indiceHist + 1, lista.length - 1);
      setIndiceHist(proximo);
      setCmd(lista[proximo] ?? "");
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const lista = historico.length ? historico : linhas.filter((l) => l.tipo === "cmd").map((l) => l.texto);
      const proximo = Math.max(indiceHist - 1, -1);
      setIndiceHist(proximo);
      setCmd(proximo < 0 ? "" : lista[proximo] ?? "");
    }
  };

  const kb = (uso.bytes / 1024).toFixed(1);
  const limiteKb = (uso.limite / 1024).toFixed(0);

  return (
    <div className="sbx">
      <header className="sbx-topo">
        <Link to="/" className="sbx-voltar" aria-label="Voltar ao chat">←</Link>
        <div>
          <h1>Terminal isolado</h1>
          <p>Sandbox do SKYNET · pasta por conta · {uso.arquivos.length} arquivo(s) · {kb} de {limiteKb} KB</p>
        </div>
        <button type="button" className="sbx-sec" onClick={carregar}>Atualizar</button>
      </header>

      {!autenticado ? (
        <div className="sbx-aviso" role="alert">
          <h2>Entre na sua conta</h2>
          <p>O sandbox é por conta: entre para ter a sua pasta isolada.</p>
          <Link to="/login" className="sbx-primario">Fazer login</Link>
        </div>
      ) : (
        <>
          <section className="sbx-palco" aria-label="Saída do terminal">
            <div className="sbx-linhas" ref={saidaRef}>
              {linhas.map((l, i) => (
                <div key={i} className={`sbx-linha sbx-${l.tipo}`}>
                  {l.tipo === "cmd" ? (
                    <><span className="sbx-prompt">/{l.cwd}</span><span className="sbx-cifrao">$</span> {l.texto}</>
                  ) : (
                    <pre>{l.texto}</pre>
                  )}
                </div>
              ))}
              {rodando ? <div className="sbx-ocupado" aria-live="polite">executando…</div> : null}
            </div>
          </section>

          <form className="sbx-barra" onSubmit={(e) => { e.preventDefault(); executar(); }}>
            <span className="sbx-prompt">/{cwd}</span>
            <span className="sbx-cifrao">$</span>
            <input
              ref={inputRef}
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              onKeyDown={tecla}
              placeholder="digite um comando e pressione Enter"
              aria-label="Comando do sandbox"
              autoComplete="off"
              spellCheck={false}
              disabled={rodando}
            />
            <button type="submit" className="sbx-enviar" disabled={rodando || !cmd.trim()}>Executar</button>
          </form>

          <div className="sbx-atalhos">
            {ATALHOS.map((a) => (
              <button key={a} type="button" onClick={() => executar(a)} className="sbx-chip">{a}</button>
            ))}
            <button type="button" onClick={() => executar("clear")} className="sbx-chip sbx-chip-fraco">limpar tela</button>
          </div>

          <section className="sbx-arquivos">
            <h2>Arquivos da sua pasta</h2>
            {uso.arquivos.length ? (
              <ul>
                {uso.arquivos.map((a) => (
                  <li key={a.caminho}>
                    <button type="button" onClick={() => executar(`cat ${a.caminho}`)}>cat {a.caminho}</button>
                    <em>{a.bytes ?? 0} B</em>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sbx-vazio">Nada por aqui ainda. Crie algo com <code>echo oi &gt; nota.txt</code>.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
