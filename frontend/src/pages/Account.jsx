import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell.jsx";
import { getSession, supabase, API } from "../lib.js";

/** /account — perfil real da sessão (recuperado da versão anterior do projeto). */
export default function Account() {
  const navigate = useNavigate();
  const [since, setSince] = useState("");
  const [recovery, setRecovery] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSession().then(async (session) => {
      if (!session) { navigate("/login", { replace: true }); return; }
      setSince(new Date(session.user.created_at).toLocaleDateString("pt-BR"));
      const { data } = await supabase.from("user_settings").select("user_id").eq("user_id", session.user.id).maybeSingle();
      if (!data) await supabase.from("user_settings").insert({ user_id: session.user.id });
    });
  }, [navigate]);

  async function saveRecovery() {
    if (busy || !/.+@.+\..+/.test(recovery)) return;
    setBusy(true);
    const session = await getSession();
    if (!session) return setBusy(false);
    const res = await fetch(`${API}/auth-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: "set_recovery_email", email: recovery }),
    });
    const data = await res.json().catch(() => ({ ok: false }));
    setSaved(data.ok ? "Email de recuperação salvo na conta." : "Falha ao salvar: " + (data.error || "tente novamente"));
    setBusy(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  }

  return (
    <AuthShell title="CONTA E PERFIL" links={<Link to="/">VOLTAR AO CHAT</Link>}>
      <section className="profile-block">
        <div className="profile-avatar" aria-hidden="true">S</div>
        <div className="profile-info">
          <div className="profile-email">conta de código</div>
          <div className="profile-meta">membro desde {since || "…"}</div>
        </div>
      </section>

      <p className="hint">
        Seu código de acesso de 12 dígitos é a única chave da conta. Guarde-o em local seguro —
        sem ele o acesso só é possível pelo email de recuperação.
      </p>

      <div className="form-block">
        <div className="form-title">EMAIL DE RECUPERAÇÃO</div>
        <input
          type="email"
          value={recovery}
          onChange={(event) => setRecovery(event.target.value)}
          placeholder="email@exemplo.com"
          aria-label="Email de recuperação"
        />
        <button type="button" onClick={saveRecovery} disabled={busy || !/.+@.+\..+/.test(recovery)}>
          {busy ? "SALVANDO…" : "SALVAR"}
        </button>
        {saved && <p className="hint">{saved}</p>}
      </div>

      <button type="button" className="ghost-btn" onClick={logout}>SAIR DA CONTA</button>
    </AuthShell>
  );
}
