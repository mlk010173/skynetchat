import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth.jsx";

/**
 * Protege rotas que exigem conta.
 * - Enquanto a sessão é restaurada, mostra um aviso (evita redirecionar logado).
 * - Visitante vai para /login guardando a página pedida em state.from.
 * - Depois do login, o destino original é retomado.
 */
export default function ProtectedRoute({ children }) {
  const { autenticado, carregando } = useAuth();
  const local = useLocation();

  if (carregando) {
    return (
      <div className="auth-page">
        <section className="terminal" aria-busy="true">
          <div className="term-top">&gt;_ VERIFICANDO SESSÃO <span className="secure">SECURE</span></div>
          <p className="muted">Validando seu acesso…</p>
        </section>
      </div>
    );
  }

  if (!autenticado) {
    return <Navigate to="/login" replace state={{ from: `${local.pathname}${local.search}` }} />;
  }

  return children;
}
