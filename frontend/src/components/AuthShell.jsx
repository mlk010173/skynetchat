/** Moldura das telas de conta: marca à esquerda, formulário à direita. */
import { Link } from "react-router-dom";
import { IconCheck, IconGlobe, IconSpark, IconWrench } from "./Icons.jsx";

const PONTOS = [
  { icon: IconSpark, titulo: "Superagente com ferramentas", texto: "Pesquisa, abre sites, gera imagem e executa ações reais." },
  { icon: IconGlobe, titulo: "Fontes rastreáveis", texto: "Cada resposta mostra de onde veio e o que foi executado." },
  { icon: IconWrench, titulo: "Autorização por ação", texto: "O que é sensível só roda com a sua aprovação." },
  { icon: IconCheck, titulo: "Memória e histórico", texto: "Conversas, memória e arquivos ficam na sua conta." },
];

export default function AuthShell({ title, children, links, largo = false }) {
  return (
    <div className={`auth-page${largo ? " auth-page--largo" : ""}`}>
      {!largo && (
        <aside className="auth-lado" aria-hidden="true">
          <Link to="/" className="auth-logo auth-logo--grande">
            <img src={`${import.meta.env.BASE_URL}skynet-logo-vermelha.png`} alt="" />
            <span>SKYNETchat</span>
          </Link>
          <div className="auth-lado-corpo">
            <h2 className="auth-lado-titulo">Um agente que executa, não só responde.</h2>
            <p className="auth-lado-sub">Pesquisa na web, abre páginas, gera imagens e mostra cada etapa em tempo real.</p>
            <ul className="auth-lado-lista">
              {PONTOS.map(({ icon: Icon, titulo, texto }) => (
                <li key={titulo}>
                  <span className="auth-lado-icone"><Icon width={15} height={15} /></span>
                  <span>
                    <b>{titulo}</b>
                    <small>{texto}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="auth-lado-pe">SKYNETchat · agente multimodelo · acesso com autorização</p>
        </aside>
      )}

      <main className="auth-main">
        <div className={`auth-card${largo ? " largo" : ""}`}>
          <header className="auth-head">
            <Link to="/" className="auth-logo">
              <img src={`${import.meta.env.BASE_URL}skynet-logo-vermelha.png`} alt="" />
              <span>SKYNETchat</span>
            </Link>
            <span className="badge-online">online</span>
          </header>
          <h1 className="auth-title">{title}</h1>
          {children}
          {links && <nav className="auth-links">{links}</nav>}
        </div>
      </main>
    </div>
  );
}
