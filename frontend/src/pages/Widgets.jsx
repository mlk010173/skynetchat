import { Link } from "react-router-dom";
import WidgetBoard from "../widgets/WidgetBoard.jsx";

/** /widgets: painel pessoal de widgets do SKYNET. */
export default function Widgets() {
  return (
    <div className="wg-shell">
      <nav className="wg-nav">
        <Link to="/" className="wg-marca">SKYNETCHAT</Link>
        <div className="wg-nav-links">
          <Link to="/">Chat</Link>
          <Link to="/dashboard">Painel</Link>
          <Link to="/account">Conta</Link>
          <Link to="/settings">Ajustes</Link>
        </div>
      </nav>
      <WidgetBoard />
    </div>
  );
}
