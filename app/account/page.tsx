"use client";

// CONTA / PERFIL — dados reais da sessão Supabase, troca de senha real.
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/client-auth";
import { BASE } from "@/lib/api";

export default function AccountPage() {
  const supabase = getSupabase();
  const [email, setEmail] = useState("");
  const [since, setSince] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase?.auth.getSession().then(async ({ data }) => {
      if (!data.session) { location.replace(BASE + "/login/"); return; }
      setEmail(data.session.user.email ?? "");
      setSince(new Date(data.session.user.created_at).toLocaleDateString("pt-BR"));
    });
  }, [supabase]);

  async function changePassword() {
    if (busy || !supabase) return;
    if (newPass.length < 8) { setStatus("A nova senha precisa ter ao menos 8 caracteres."); return; }
    if (newPass !== newPass2) { setStatus("As senhas não coincidem."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setStatus(error ? error.message : "Senha alterada com sucesso.");
    if (!error) { setNewPass(""); setNewPass2(""); }
    setBusy(false);
  }

  async function logout() {
    await supabase?.auth.signOut();
    location.replace(BASE + "/");
  }

  const initial = email ? email[0].toUpperCase() : "S";

  return (
    <main className="page-shell">
      <div className="page-card">
        <div className="page-head">
          <span>&gt;_ CONTA E PERFIL</span>
          <a href={`${BASE}/`} className="page-close">✕</a>
        </div>

        <section className="profile-block">
          <div className="profile-avatar" aria-hidden="true">{initial}</div>
          <div className="profile-info">
            <div className="profile-email">{email || "…"}</div>
            <div className="profile-meta">membro desde {since || "…"}</div>
          </div>
        </section>

        <div className="form-block">
          <div className="form-title">TROCAR SENHA</div>
          <label className="auth-label" htmlFor="np">NOVA SENHA</label>
          <input id="np" type="password" className="auth-input" value={newPass} minLength={8}
            placeholder="••••••••" onChange={(e) => setNewPass(e.target.value)} autoComplete="new-password" />
          <label className="auth-label" htmlFor="np2">CONFIRMAR NOVA SENHA</label>
          <input id="np2" type="password" className="auth-input" value={newPass2} minLength={8}
            placeholder="••••••••" onChange={(e) => setNewPass2(e.target.value)} autoComplete="new-password" />
          <button className="auth-submit" disabled={busy} type="button" onClick={changePassword}>ALTERAR ▸</button>
          {status && <div className="auth-status">{status}</div>}
        </div>

        <section className="form-block">
          <div className="form-title">SESSÃO</div>
          <button className="danger-btn" onClick={logout}>SAIR DA CONTA</button>
          <p className="page-note">
            Dados e histórico ficam salvos no seu perfil no servidor — ao entrar de novo, tudo volta.
          </p>
        </section>

        <a href={`${BASE}/settings/`} className="page-link">⚙ CONFIGURAÇÕES</a>
      </div>
    </main>
  );
}
