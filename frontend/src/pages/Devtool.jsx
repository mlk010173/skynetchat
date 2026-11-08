// Ferramentas de engenharia: o mesmo motor que o agente usa no chat, com interface própria.
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib.js";

const FERRAMENTAS = [
  { id: "json", nome: "JSON", dica: "formata, minifica e valida", campo: "JSON", extra: ["formatar", "minificar"] },
  { id: "base64", nome: "Base64", dica: "codifica e decodifica", campo: "Texto ou base64", extra: ["codificar", "decodificar", "urlsafe"] },
  { id: "hash", nome: "Hash", dica: "sha-256, sha-1, sha-512", campo: "Texto", extra: ["sha256", "sha1", "sha512"] },
  { id: "uuid", nome: "UUID", dica: "gera identificadores v4", campo: "Quantos?", extra: [] },
  { id: "jwt", nome: "JWT", dica: "lê header e payload", campo: "Cole o token", extra: [] },
  { id: "epoch", nome: "Data", dica: "epoch ↔ ISO (São Paulo)", campo: "Epoch ou data ISO", extra: ["para_iso", "para_epoch", "agora"] },
  { id: "cron", nome: "Cron", dica: "explica a expressão", campo: "min hora dia mês semana", extra: [] },
  { id: "cores", nome: "Cores", dica: "hex ↔ rgb ↔ hsl", campo: "#rrggbb ou rgb()", extra: [] },
  { id: "bytes", nome: "Medidas", dica: "converte tamanhos", campo: "ex: 1.5 GB em MB", extra: [] },
  { id: "case", nome: "Nomes", dica: "camel, snake, kebab", campo: "nome do campo", extra: [] },
  { id: "stats", nome: "Texto", dica: "conta palavras e bytes", campo: "Cole o texto", extra: [] },
  { id: "url", nome: "URL", dica: "codifica e faz parse", campo: "URL ou texto", extra: ["decodificar", "codificar", "parse"] },
];

export default function Devtool() {
  const [ferramenta, setFerramenta] = useState(FERRAMENTAS[0]);
  const [texto, setTexto] = useState("");
  const [extra, setExtra] = useState("");
  const [saida, setSaida] = useState(null);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  const trocar = (f) => { setFerramenta(f); setExtra(""); setSaida(null); setErro(""); };

  const rodar = async (e) => {
    e?.preventDefault();
    setBusy(true); setErro(""); setSaida(null);
    const r = await api(`devtool?acao=${ferramenta.id}`, {
      method: "POST",
      body: { texto: texto.slice(0, 8000), extra: extra || (ferramenta.extra[0] ?? "") },
    }).catch(() => null);
    if (r?.ok) setSaida(r); else setErro(r?.error || "Não consegui executar.");
    setBusy(false);
  };

  const bonito = () => {
    if (!saida) return "";
    if (saida.saida) return saida.saida;
    if (saida.uuids) return saida.uuids.join("\n");
    if (saida.explicacao) return `${saida.expressao} → ${saida.explicacao}`;
    if (saida.iso) return `${saida.iso} · ${saida.sao_paulo ?? ""}`;
    if (saida.hex) return `${saida.hex} · ${saida.rgb ?? ""} · ${saida.hsl ?? ""}`;
    if (saida.mb) return `${saida.mb} MB · ${saida.gb} GB · ${saida.bytes} bytes`;
    if (saida.camelCase) return `camelCase: ${saida.camelCase}\nsnake_case: ${saida.snake_case}\nkebab-case: ${saida["kebab-case"]}\nPascalCase: ${saida.PascalCase}\nCONSTANT: ${saida.CONSTANT_CASE}`;
    if (saida.palavras !== undefined) return `${saida.palavras} palavras · ${saida.caracteres} caracteres · ${saida.linhas} linha(s) · ${saida.bytes} bytes`;
    if (saida.linhas !== undefined && saida.resumo) return `${saida.linhas}\n\n${saida.resumo.iguais} iguais · +${saida.resumo.adicionadas} · -${saida.resumo.removidas}`;
    return JSON.stringify(saida, null, 2);
  };

  return (
    <main className="dev-page">
      <header className="dev-topo">
        <div>
          <h1>Ferramentas de engenharia</h1>
          <p className="dev-sub">O mesmo motor que o agente usa no chat: JSON, base64, hash, JWT, cron, conversões.</p>
        </div>
        <Link className="dev-voltar" to="/">Voltar ao chat</Link>
      </header>

      <nav className="dev-abas" aria-label="Ferramentas">
        {FERRAMENTAS.map((f) => (
          <button key={f.id} type="button" className={ferramenta.id === f.id ? "on" : ""} onClick={() => trocar(f)} title={f.dica}>
            {f.nome}
          </button>
        ))}
      </nav>

      <form className="dev-form" onSubmit={rodar}>
        <label className="dev-campo">
          <span>{ferramenta.campo}</span>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={ferramenta.id === "json" || ferramenta.id === "stats" ? 7 : 3}
            placeholder={ferramenta.id === "json" ? '{"exemplo": true}' : ferramenta.id === "jwt" ? "eyJhbGciOi..." : ""}
          />
        </label>
        {ferramenta.extra.length ? (
          <label className="dev-campo dev-campo-mini">
            <span>modo</span>
            <select value={extra || ferramenta.extra[0]} onChange={(e) => setExtra(e.target.value)}>
              {ferramenta.extra.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        ) : null}
        <button type="submit" className="dev-rodar" disabled={busy}>{busy ? "Executando…" : "Executar"}</button>
      </form>

      {erro ? <p className="dev-erro">{erro}</p> : null}

      {saida ? (
        <section className="dev-saida">
          <div className="dev-saida-topo">
            <b>{ferramenta.nome}</b>
            <button type="button" onClick={() => navigator.clipboard?.writeText(bonito())}>copiar</button>
          </div>
          <pre>{bonito()}</pre>
        </section>
      ) : null}
    </main>
  );
}
