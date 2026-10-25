"use client";

// AUTENTICAÇÃO — mesmo layout do skynetchat.net (terminal SECURE),
// auth 100% real via Supabase. Rotas: /login, /sign-up, /recover.
import { useState } from "react";
import { getSupabase } from "@/lib/client-auth";
import { BASE } from "@/lib/api";

export type AuthMode = "entrar" | "criar" | "recuperar";

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const supabase = getSupabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !supabase) return;
    setStatus("");
    setBusy(true);
    try {
      if (mode === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setStatus(error.message.includes("Invalid login") ? "Credenciais inválidas." : error.message);
          return;
        }
        location.replace(BASE + "/");
      } else if (mode === "criar") {
        if (password.length < 8) { setStatus("A senha precisa ter ao menos 8 caracteres."); return; }
        if (password !== password2) { setStatus("As senhas não coincidem."); return; }
        if (!accepted) { setStatus("Confirme os termos para criar sua conta."); return; }
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) { setStatus(error.message); return; }
        location.replace(BASE + "/");
      } else {
        if (!email) { setStatus("Informe seu e-mail."); return; }
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}${BASE}/reset`,
        });
        setStatus(error ? error.message : "Link de recuperação enviado. Verifique seu e-mail.");
      }
    } finally {
      setBusy(false);
    }
  }

  const cfg = {
    entrar: {
      title: ">_ AUTENTICAÇÃO",
      hint: "Autentique-se com e-mail e senha da sua conta real.",
      action: "ENTRAR ▸",
    },
    criar: {
      title: ">_ CRIAR CONTA",
      hint: "Defina e-mail e senha — a sua chave de acesso real, protegida no servidor.",
      action: "CRIAR CONTA ▸",
    },
    recuperar: {
      title: ">_ RECUPERAR ACESSO",
      hint: "Enviaremos um link de recuperação para o seu e-mail.",
      action: "ENVIAR LINK ▸",
    },
  }[mode];

  return (
    <main className="auth-shell">
      <header className="auth-header">
        <div className="auth-logo" aria-hidden="true">S</div>
        <div>
          <div className="auth-brand">SKYNETCHAT</div>
          <div className="auth-online">● ONLINE</div>
        </div>
      </header>

      <p className="auth-manifesto">
        O DIREITO À PRIVACIDADE E O ACESSO IRRESTRITO À INFORMAÇÃO É UM DIREITO UNIVERSAL DE TODOS.
      </p>

      <form className="auth-card" onSubmit={submit}>
        <div className="auth-card-head">
          <span>{cfg.title}</span>
          <span className="auth-secure">📡 SECURE</span>
        </div>

        <p className="auth-hint">{cfg.hint}</p>

        <label className="auth-label" htmlFor="email">E-MAIL</label>
        <input
          id="email" type="email" required
          autoComplete="email" placeholder="voce@exemplo.com"
          className="auth-input" value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {mode !== "recuperar" && (
          <>
            <label className="auth-label" htmlFor="password">SENHA</label>
            <input
              id="password" type="password" required minLength={8}
              autoComplete={mode === "criar" ? "new-password" : "current-password"}
              placeholder="••••••••" className="auth-input"
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
            <div className="auth-meter">{password.length}/8</div>
          </>
        )}

        {mode === "criar" && (
          <>
            <label className="auth-label" htmlFor="password2">CONFIRMAR SENHA</label>
            <input
              id="password2" type="password" required minLength={8}
              autoComplete="new-password" placeholder="••••••••"
              className="auth-input" value={password2}
              onChange={(e) => setPassword2(e.target.value)}
            />
            <label className="auth-check">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
              Confirmo ter +18 anos e aceito os <a href={`${BASE}/terms/`} className="auth-inline-link">Termos de Serviço e Privacidade</a>.
            </label>
            <p className="auth-note">Sua conta será salva no sistema e você entrará automaticamente.</p>
          </>
        )}

        <button className="auth-submit" disabled={busy} type="submit">{cfg.action}</button>
        {status && <div className="auth-status">{status}</div>}

        <div className="auth-links">
          {mode !== "entrar" && <a href={`${BASE}/login/`}>ENTRAR</a>}
          {mode !== "entrar" && <span className="auth-sep">|</span>}
          {mode !== "criar" && <a href={`${BASE}/sign-up/`}>CRIAR CONTA</a>}
          {mode !== "criar" && <span className="auth-sep">|</span>}
          {mode !== "recuperar" && <a href={`${BASE}/recover/`}>RECUPERAR ACESSO</a>}
        </div>
      </form>

      <footer className="auth-badges">
        <span>○ E2E</span>
        <span className="auth-sep">|</span>
        <span>🔏 AES-256</span>
        <span className="auth-sep">|</span>
        <span>⇌ ZERO-TRUST</span>
      </footer>

      <a href={`${BASE}/`} className="auth-back">← voltar ao chat (modo anônimo)</a>
    </main>
  );
}
