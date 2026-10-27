import React, { useMemo, useState } from "react";
import catalog from "../data/connectors.json";
import "./ConnectorExplorer.css";

const LABELS = {
  api_key: "API key",
  oauth2_or_api_key: "OAuth 2.0 / API key",
  api_key_or_oauth2: "API key / OAuth 2.0",
  webhook_http_mcp: "Webhook / HTTP / MCP",
};

/**
 * Explore the connector catalog without pretending catalog entries are active.
 * Props: onClose?: () => void
 */
export default function ConnectorExplorer({ onClose }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todas as categorias");
  const [onlyWithDocs, setOnlyWithDocs] = useState(false);

  const categories = useMemo(
    () => ["Todas as categorias", ...new Set(catalog.connectors.map((c) => c.category))].sort((a, b) => {
      if (a === "Todas as categorias") return -1;
      if (b === "Todas as categorias") return 1;
      return a.localeCompare(b, "pt-BR");
    }),
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    return catalog.connectors.filter((item) => {
      const matchesText = !q || `${item.name} ${item.category} ${item.integrationMode}`.toLocaleLowerCase("pt-BR").includes(q);
      const matchesCategory = category === "Todas as categorias" || item.category === category;
      const matchesDocs = !onlyWithDocs || Boolean(item.officialDocsUrl);
      return matchesText && matchesCategory && matchesDocs;
    });
  }, [query, category, onlyWithDocs]);

  return (
    <section className="skynet-connector-explorer" aria-label="Catálogo de conectores">
      <header className="skynet-connector-header">
        <div>
          <p className="skynet-connector-eyebrow">SKYNET / EXPLORAR</p>
          <h2>Catálogo de conectores</h2>
          <p className="skynet-connector-subtitle">
            {catalog.total} serviços catalogados. Uma entrada só fica ativa depois de configurar o adaptador, as credenciais e os testes.
          </p>
        </div>
        {onClose ? <button type="button" className="skynet-connector-close" onClick={onClose} aria-label="Fechar catálogo">×</button> : null}
      </header>

      <div className="skynet-connector-filters">
        <label className="skynet-connector-search">
          <span className="sr-only">Pesquisar serviços</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar serviço, categoria ou tipo…" />
        </label>
        <label className="skynet-connector-select-label">
          <span className="sr-only">Filtrar por categoria</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="skynet-connector-check">
          <input type="checkbox" checked={onlyWithDocs} onChange={(e) => setOnlyWithDocs(e.target.checked)} />
          <span>Com documentação</span>
        </label>
      </div>

      <div className="skynet-connector-resultline" aria-live="polite">
        <span>{filtered.length} resultado(s)</span>
        <span className="skynet-connector-count"><i /> Catálogo · não conectado</span>
      </div>

      <div className="skynet-connector-grid">
        {filtered.map((item) => (
          <article className="skynet-connector-card" key={item.id}>
            <div className="skynet-connector-cardtop">
              <span className="skynet-connector-icon" aria-hidden="true">{item.name.slice(0, 1).toUpperCase()}</span>
              <span className="skynet-connector-status">CATÁLOGO</span>
            </div>
            <h3>{item.name}</h3>
            <p className="skynet-connector-category">{item.category}</p>
            <p className="skynet-connector-mode">{LABELS[item.integrationMode] || item.integrationMode}</p>
            <div className="skynet-connector-cardbottom">
              <span>{item.credentialsExpected ? "Autenticação/credencial" : "Configuração necessária"}</span>
              {item.officialDocsUrl ? (
                <a href={item.officialDocsUrl} target="_blank" rel="noopener noreferrer">Documentação ↗</a>
              ) : <span className="skynet-connector-no-docs">Link não cadastrado</span>}
            </div>
          </article>
        ))}
        {!filtered.length ? <div className="skynet-connector-empty">Nenhum serviço corresponde à pesquisa. Tente outro termo ou categoria.</div> : null}
      </div>

      <p className="skynet-connector-disclaimer">
        Segurança: credenciais de API e tokens devem ficar no backend/secret manager, nunca no navegador nem no repositório. Este catálogo não realiza chamadas externas por conta própria.
      </p>
    </section>
  );
}
