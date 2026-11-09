// SKYNET · Arquivo: os dossiês que o agente montou ficam guardados no próprio
// navegador. Aqui dá para procurar, reabrir no chat, baixar em markdown e apagar.
import { useMemo, useState } from "react";
import { lerArquivo, removerDossie, limparArquivo, specDoArquivo } from "../historico.js";
import { baixarArquivo, paraMarkdown } from "../habilidades.js";
import { IconFolder, IconChat, IconClose, IconHistory } from "../components/Icons.jsx";

const quando = (iso) => {
  try {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

const dominiosDe = (item) => {
  const mapa = new Map();
  (item.itens || []).forEach((f) => {
    if (!f.domain) return;
    mapa.set(f.domain, (mapa.get(f.domain) || 0) + 1);
  });
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
};

const markdownDoItem = (item) => {
  const spec = specDoArquivo(item);
  return paraMarkdown(item.titulo || "Dossiê", [
    { tipo: "par", texto: `Pedido: ${item.pedido || "—"}` },
    { tipo: "par", texto: `${item.fontes} fontes · ${item.lidas} lidas na íntegra · ${quando(item.quando)}` },
    ...(spec?.itens || []).map((f) => ({ tipo: "par", texto: `- [${f.titulo}](${f.url}) — ${f.domain || ""}${f.excerto ? `\n  ${f.excerto.slice(0, 300)}` : ""}` })),
  ]);
};

export default function Arquivo() {
  const [versao, setVersao] = useState(0);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(null);

  const itens = useMemo(() => lerArquivo(), [versao]);
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((i) => `${i.titulo} ${i.pedido}`.toLowerCase().includes(q));
  }, [itens, busca]);

  const reabrir = (item) => {
    window.location.hash = `#/?dossie=${item.id}`;
  };

  const apagar = (id) => {
    removerDossie(id);
    setVersao((v) => v + 1);
  };

  const apagarTudo = () => {
    if (!window.confirm(`Apagar os ${itens.length} dossiês do arquivo? Isso não afeta o histórico de conversas.`)) return;
    limparArquivo();
    setVersao((v) => v + 1);
  };

  return (
    <div className="arquivo-pagina">
      <header className="arquivo-topo">
        <div>
          <h1><IconFolder width={20} height={20} /> Arquivo de dossiês</h1>
          <p>{itens.length} no navegador · até 60 · nada sai do seu aparelho</p>
        </div>
        <div className="arquivo-topo-acoes">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="buscar por tema…"
            aria-label="Buscar dossiê"
          />
          {itens.length > 0 && <button type="button" className="ghost" onClick={apagarTudo}>limpar tudo</button>}
        </div>
      </header>

      {!itens.length ? (
        <div className="arquivo-vazio">
          <IconHistory width={26} height={26} />
          <b>Nada arquivado ainda</b>
          <p>Peça uma pesquisa no chat. Cada dossiê concluído entra aqui sozinho, com as fontes e os trechos lidos.</p>
          <button type="button" onClick={() => { window.location.hash = "#/"; }}>ir para o chat</button>
        </div>
      ) : (
        <ul className="arquivo-lista">
          {filtrados.map((item) => (
            <li key={item.id} className="arquivo-item">
              <div className="arquivo-item-topo">
                <b>{item.titulo}</b>
                <small>{quando(item.quando)}</small>
              </div>
              {item.pedido ? <p className="arquivo-pedido">{item.pedido}</p> : null}
              <div className="arquivo-selos">
                <em>{item.fontes} fontes</em>
                <em>{item.lidas} lidas na íntegra</em>
                {dominiosDe(item).map(([d, n]) => <em key={d}>{d} · {n}</em>)}
              </div>
              <div className="arquivo-acoes">
                <button type="button" onClick={() => reabrir(item)}><IconChat width={14} height={14} /> abrir no chat</button>
                <button type="button" onClick={() => baixarArquivo(`dossie-${item.id}.md`, markdownDoItem(item))}>baixar .md</button>
                <button type="button" className="perigo" onClick={() => apagar(item.id)} aria-label={`apagar ${item.titulo}`}><IconClose width={13} height={13} /></button>
              </div>
              {aberto === item.id ? (
                <ul className="arquivo-fontes">
                  {(item.itens || []).map((f, i) => (
                    <li key={i}>
                      <a href={f.url} target="_blank" rel="noopener noreferrer">{f.titulo}</a>
                      <small>{f.domain}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <button type="button" className="arquivo-ver" onClick={() => setAberto(aberto === item.id ? null : item.id)}>
                  {aberto === item.id ? "esconder fontes" : `ver ${item.fontes} fontes`}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
