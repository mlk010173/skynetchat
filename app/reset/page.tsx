"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/client-auth";

/**
 * Página de redefinição de senha.
 * O link enviado por email cai aqui; o supabase-js detecta o token na URL
 * e estabelece a sessão de recuperação automaticamente.
 * Requer que a URL de produção esteja na lista de redirect URLs do Supabase.
 */
export default function ResetPage() {
  const supabase = getSupabase();
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!supabase) { setChecking(false); return; }
      // aguarda o supabase-js processar o token da URL, se houver
      await supabase.auth.getSession();
      setChecking(false);
    })();
  }, [supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setMsg({ text: "Supabase não configurado.", ok: false });
      return;
    }
    if (password.length < 6) {
      setMsg({ text: "A senha precisa de no mínimo 6 caracteres.", ok: false });
      return;
    }
    if (password !== confirm) {
      setMsg({ text: "As senhas não conferem.", ok: false });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMsg({ text: error.message, ok: false });
      } else {
        setMsg({ text: "Senha atualizada! Redirecionando…", ok: true });
        setTimeout(() => { window.location.href = "/"; }, 1200);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <h1>Nova <span>senha</span></h1>
        <p className="sub">defina sua nova senha de acesso</p>

        {checking ? (
          <p className="sub">validando link de recuperação…</p>
        ) : (
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="password">nova senha</label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="mínimo 6 caracteres"
              />
            </div>
            <div className="field">
              <label htmlFor="confirm">confirmar senha</label>
              <input
                id="confirm"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="repita a senha"
              />
            </div>
            <button className="btn-primary-full" disabled={busy}>
              {busy ? "…" : "ATUALIZAR SENHA ▸"}
            </button>
          </form>
        )}

        <div className={`login-msg ${msg?.ok ? "ok" : "err"}`}>{msg?.text ?? ""}</div>
        <div className="login-alt"><a href="/login">← voltar ao login</a></div>
      </div>
    </div>
  );
}
