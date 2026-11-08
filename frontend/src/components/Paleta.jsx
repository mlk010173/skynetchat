// SKYNET · paleta de comandos (Ctrl+K / Cmd+K): pula entre chat, painel,
// prompts, memória e ações rápidas sem sair do teclado.
import { useEffect, useMemo, useRef, useState } from "react";
import { lerMemoria } from "../memoria.js";
import { todosPrompts } from "../prompts.js";
import "./Paleta.css";

export default function Paleta({ aberta, aoFechar, aoEscolher, conversa }) {
  const [busca, setBusca] = useState("");
  const [ativo, setAtivo] = useState(0);
  const campo = useRef(null);

  const acoes = useMemo(() => {
    const base = [
      { id: "chat", titulo: "Ir para o chat", grupo: "navegar", dica: "conversa atual", acao: () => aoEscolher({ tipo: "rota", valor: "/" }) },
      { id: "painel", titulo: "Painel do agente", grupo: "navegar", dica: "ferramentas, comportamento, memória", acao: () => aoEscolher({ tipo: "rota", valor: "/ferramentas" }) },
      { id: "widgets", titulo: "Widgets do chat", grupo: "navegar", dica: "notícias, clima, gráficos", acao: () => aoEscolher({ tipo: "rota", valor: "/widgets" }) },
      { id: "exportar", titulo: "Exportar conversa (.md)", grupo: "ação", dica: "baixa o histórico atual", acao: () => aoEscolher({ tipo: "exportar" }) },
      { id: "sistema", titulo: "Copiar instrução de sistema", grupo: "ação", dica: "tom e memória em texto", acao: () => aoEscolher({ tipo: "sistema" }) },
      { id: "limpar", titulo: "Limpar memória", grupo: "ação", dica: `${lerMemoria().length} fato(s) guardado(s)`, acao: () => aoEscolher({ tipo: "limparMemoria" }) },
    ];
    const prompts = todosPrompts().map((p) => ({
      id: "p-" + p.id,
      titulo: p.titulo,
      grupo: "prompt",
      dica: p.texto.slice(0, 70),
      acao: () => aoEscolher({ tipo: "prompt", valor: p.texto }),
    }));
    const memorias = lerMemoria().map((m) => ({
      id: "m-" + m.id,
      titulo: m.texto,
      grupo: "memória",
      dica: "usar como contexto",
      acao: () => aoEscolher({ tipo: "prompt", valor: `${m.texto}\n\n` }),
    }));
    return [...base, ...prompts, ...memorias];
  }, [aoEscolher, aberta]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return acoes.slice(0, 12);
    return acoes
      .filter((a) => (a.titulo + " " + a.dica + " " + a.grupo).toLowerCase().includes(q))
      .slice(0, 14);
  }, [acoes, busca]);

  useEffect(() => {
    if (!aberta) return;
    setBusca("");
    setAtivo(0);
    const t = setTimeout(() => campo.current?.focus(), 40);
    return () => clearTimeout(t);
  }, [aberta]);

  useEffect(() => {
    if (!aberta) return;
    const onKey = (e) => {
      if (e.key === "Escape") { aoFechar(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setAtivo((i) => Math.min(filtradas.length - 1, i + 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((i) => Math.max(0, i - 1)); }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = filtradas[ativo];
        if (item) { item.acao(); aoFechar(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberta, filtradas, ativo, aoFechar]);

  if (!aberta) return null;

  return (
    <div className="paleta-fundo" onClick={aoFechar}>
      <div className="paleta" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="paleta de comandos">
        <input
          ref={campo}
          className="paleta-campo"
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setAtivo(0); }}
          placeholder="buscar ação, prompt ou memória…"
          aria-label="buscar comando"
        />
        <ul className="paleta-lista">
          {filtradas.map((a, i) => (
            <li key={a.id}>
              <button
                type="button"
                className={i === ativo ? "on" : ""}
                onMouseEnter={() => setAtivo(i)}
                onClick={() => { a.acao(); aoFechar(); }}
              >
                <span className="paleta-titulo">{a.titulo}</span>
                <span className="paleta-grupo">{a.grupo}</span>
                <span className="paleta-dica">{a.dica}</span>
              </button>
            </li>
          ))}
          {!filtradas.length ? <li className="paleta-vazio">nada encontrado</li> : null}
        </ul>
        <footer className="paleta-pe">
          <span>↑ ↓ navegar</span>
          <span>enter abrir</span>
          <span>esc fechar</span>
          {conversa ? <span>{conversa} mensagens</span> : null}
        </footer>
      </div>
    </div>
  );
}
