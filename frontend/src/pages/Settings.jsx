import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell.jsx";
import { getSession, supabase } from "../lib.js";

/** /settings — preferências reais persistidas no servidor (user_settings). */
export default function Settings() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState("black");
  const [notifs, setNotifs] = useState(true);
  const [status, setStatus] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSession().then(async (session) => {
      if (!session) { navigate("/login", { replace: true }); return; }
      const current = document.documentElement.dataset.theme || "black";
      setTheme(current);
      const { data } = await supabase.from("user_settings").select("notifications_enabled").eq("user_id", session.user.id).maybeSingle();
      if (data) setNotifs(data.notifications_enabled ?? true);
      setLoaded(true);
    });
  }, [navigate]);

  async function persist(patch) {
    const session = await getSession();
    if (!session) return;
    setStatus("salvando…");
    const { error } = await supabase.from("user_settings").upsert({
      user_id: session.user.id,
      ...(patch.theme !== undefined ? { theme: patch.theme } : {}),
      ...(patch.notifications_enabled !== undefined ? { notifications_enabled: patch.notifications_enabled } : {}),
      updated_at: new Date().toISOString(),
    });
    setStatus(error ? "Falha ao salvar: " + error.message : "// salvo no servidor");
  }

  function trocarTema(next) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("skynet-theme-bg", next);
    persist({ theme: next });
  }

  if (!loaded) {
    return <AuthShell title="CONFIGURAÇÕES" links={<Link to="/">VOLTAR AO CHAT</Link>}><p className="hint">carregando…</p></AuthShell>;
  }

  return (
    <AuthShell title="CONFIGURAÇÕES" links={<Link to="/">VOLTAR AO CHAT</Link>}>
      <div className="form-block">
        <div className="form-title">TEMA DE FUNDO</div>
        <div className="theme-picker">
          <button type="button" className={theme === "black" ? "on" : ""} onClick={() => trocarTema("black")}>BLACK</button>
          <button type="button" className={theme === "white" ? "on" : ""} onClick={() => trocarTema("white")}>WHITE</button>
        </div>
      </div>

      <div className="form-block">
        <div className="form-title">NOTIFICAÇÕES</div>
        <button type="button" className={notifs ? "on" : ""} onClick={() => { setNotifs(!notifs); persist({ notifications_enabled: !notifs }); }}>
          {notifs ? "ATIVADAS" : "DESATIVADAS"}
        </button>
        <p className="hint">O sino na barra superior mostra avisos da conta quando ativo.</p>
      </div>

      {status && <p className="hint">{status}</p>}
      <p className="hint">Preferências salvas no servidor e sincronizadas entre dispositivos.</p>
    </AuthShell>
  );
}
