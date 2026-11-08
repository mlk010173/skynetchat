import { Link } from "react-router-dom";
import FerramentasAgente from "../components/FerramentasAgente.jsx";

/** /ferramentas — o que o agente sabe fazer, teste ao vivo e ajustes da pesquisa. */
export default function Ferramentas() {
  return (
    <main className="pagina-ferramentas">
      <header className="pagina-topo">
        <Link to="/" className="pagina-voltar">← voltar ao chat</Link>
        <h1>Agente SKYNET</h1>
        <p>
          Cada ferramenta abaixo roda no seu navegador, sem chave de API. Teste com um tema real,
          veja a latência e ajuste a profundidade da pesquisa.
        </p>
      </header>
      <FerramentasAgente />
    </main>
  );
}
