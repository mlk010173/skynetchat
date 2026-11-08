// Painel de lembretes: o que o chat anotou aparece aqui, com prazo e cobrança.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib.js";

const FUSO = "America/Sao_Paulo";

const quandoCurto = (iso) => {
  if (!iso) return "sem data";
  const d = new Date(iso);
  const hoje = new Date();
  const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }).format(d);
  const mesmoDia = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short" }).format(d) ===
    new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short" }).format(hoje);
  return `${mesmoDia ? "hoje" : dia} · ${hora}`;
};

const atrasado = (l) => !l.feito && l.quando && new Date(l.quando).getTime() < Date.now();

export default function Lembretes() {
  const [lista, setLista] = useState([]);
  const [resumo, setResumo] = useState({});
  const [aba, setAba] = useState("abertos");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [titulo, setTitulo] = useState("");
  const [quando, setQuando] = useState("");
  const [filtro, setFiltro] = useState("");

  const carregar = useCallback(async (estado = aba) => {
    setBusy(true);
    const r = await api(`lembretes?estado=${estado}`).catch(() => null);
    if (r?.ok) { setLista(r.lembretes ?? []); setResumo(r.resumo ?? {}); setErro(""); }
    else setErro(r?.error || "Não consegui carregar seus lembretes.");
    setBusy(false);
  }, [aba]);

  useEffect(() => { carregar(aba); }, [aba, carregar]);

  const criar = async (e) => {
    e.preventDefault();
    const texto = titulo.trim();
    if (!texto) return;
    setBusy(true);
    const r = await api("lembretes?acao=criar", {
      method: "POST",
      body: { titulo: texto, quando: quando ? new Date(quando).toISOString() : null, origem: "painel" },
    }).catch(() => null);
    if (r?.ok) { setTitulo(""); setQuando(""); await carregar(aba); }
    else setErro(r?.error || "Não consegui salvar.");
    setBusy(false);
  };

  const acao = async (id, o) => {
    setBusy(true);
    const r = await api(`lembretes?acao=${o}&id=${encodeURIComponent(id)}`, { method: "POST", body: o === "adiar" ? { minutos: 15 } : {} }).catch(() => null);
    if (r?.ok) await carregar(aba);
    setBusy(false);
  };

  const visiveis = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    return t ? lista.filter((l) => `${l.titulo} ${l.detalhe ?? ""}`.toLowerCase().includes(t)) : lista;
  }, [lista, filtro]);

  const vencidos = visiveis.filter(atrasado);
  const resto = visiveis.filter((l) => !atrasado(l));

  const cartao = (l) => (
    <li key={l.id} className={`lem-card${atrasado(l) ? " atrasado" : ""}${l.feito ? " feito" : ""}`}>
      <div className="lem-info">
        <b>{l.titulo}</b>
        <span className="lem-quando">{quandoCurto(l.quando)}{atrasado(l) ? " · atrasado" : ""}</span>
        {l.detalhe && l.detalhe !== l.titulo ? <span className="lem-det">{l.detalhe}</span> : null}
      </div>
      <div className="lem-acoes">
        {l.feito
          ? <button type="button" onClick={() => acao(l.id, "reabrir")}>reabrir</button>
          : (
            <>
              <button type="button" className="lem-ok" onClick={() => acao(l.id, "concluir")}>concluir</button>
              <button type="button" onClick={() => acao(l.id, "adiar")}>+15 min</button>
            </>
          )}
        <button type="button" className="lem-x" onClick={() => acao(l.id, "excluir")} aria-label="Excluir lembrete">×</button>
      </div>
    </li>
  );

  return (
    <main className="lem-page">
      <header className="lem-topo">
        <div>
          <h1>Lembretes</h1>
          <p className="lem-sub">
            O que você pede no chat cai aqui. {resumo.abertos ?? 0} em aberto
            {resumo.vencidos ? ` · ${resumo.vencidos} atrasado${resumo.vencidos > 1 ? "s" : ""}` : ""}.
          </p>
        </div>
        <Link className="lem-voltar" to="/">Voltar ao chat</Link>
      </header>

      <form className="lem-form" onSubmit={criar}>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="O que devo lembrar? (ex: pagar o boleto)"
          aria-label="Título do lembrete"
        />
        <input
          type="datetime-local"
          value={quando}
          onChange={(e) => setQuando(e.target.value)}
          aria-label="Quando lembrar"
        />
        <button type="submit" disabled={busy || !titulo.trim()}>Adicionar</button>
      </form>

      <div className="lem-barra">
        {["abertos", "hoje", "vencidos", "todos"].map((a) => (
          <button
            key={a}
            type="button"
            className={aba === a ? "on" : ""}
            onClick={() => setAba(a)}
          >
            {a === "abertos" ? "Em aberto" : a === "hoje" ? "Hoje" : a === "vencidos" ? "Atrasados" : "Todos"}
          </button>
        ))}
        <input
          className="lem-busca"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="filtrar…"
          aria-label="Filtrar lembretes"
        />
      </div>

      {erro ? <p className="lem-erro">{erro}</p> : null}
      {busy && !visiveis.length ? <p className="lem-vazio">Carregando…</p> : null}

      {!busy && !visiveis.length && !erro ? (
        <p className="lem-vazio">
          Nada aqui. Peça no chat: <em>"me lembre de ligar para o contador amanhã às 9h"</em>.
        </p>
      ) : null}

      {vencidos.length ? <section><h2 className="lem-titulo-secao">Atrasados</h2><ul className="lem-lista">{vencidos.map(cartao)}</ul></section> : null}
      {resto.length ? (
        <section>
          {vencidos.length ? <h2 className="lem-titulo-secao">Na fila</h2> : null}
          <ul className="lem-lista">{resto.map(cartao)}</ul>
        </section>
      ) : null}
    </main>
  );
}
