"use client";

// LOGIN — mesmo layout do skynetchat.net (terminal de autenticação),
// autenticação 100% real via Supabase (entrar / criar conta / recuperar acesso).
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/client-auth";
import { BASE } from "@/lib/api";

type Mode = "entrar" | "criar" | "recuperar";

export default function LoginPage() {
  const supabase = getSupabase();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // já logado → direto ao chat
    supabase?.auth.getSession().then(({ data }) => {
      if (data.session) router.replace(BASE + "/");
    });
  }, [supabase, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !supabase) return;
    setStatus("");
    setBusy(true);

    try {
      if (mode === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setStatus(error.message.includes("Invalid login")
            ? "Credenciais inválidas."
            : error.message);
          return;
        }
        router.replace(BASE + "/");
      } else if (mode === "criar") {
        if (password.length < 8) { setStatus("A senha precisa ter ao menos 8 caracteres."); return; }
        if (password !== password2) { setStatus("As senhas não coincidem."); return; }
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) { setStatus(error.message); return; }
        router.replace(BASE + "/");
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

  const labels =
    mode === "criar"
      ? { action: "CRIAR CONTA ▸", hint: "Defina e-mail e senha para criar sua conta real." }
      : mode === "recuperar"
        ? { action: "ENVIAR LINK ▸", hint: "Enviaremos um link de recuperação para o seu e-mail." }
        : { action: "ENTRAR ▸", hint: "Autentique-se com e-mail e senha da sua conta." };

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
          <span>&gt;_ AUTENTICAÇÃO</span>
          <span className="auth-secure">📡 SECURE</span>
        </div>

        <p className="auth-hint">{labels.hint}</p>

        <label className="auth-label" htmlFor="email">E-MAIL</label>
        <input
          id="email"
          type="email"
          required={mode !== "recuperar"}
          autoComplete="email"
          placeholder="voce@exemplo.com"
          className="auth-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {mode !== "recuperar" && (
          <>
            <label className="auth-label" htmlFor="password">SENHA</label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "criar" ? "new-password" : "current-password"}
              placeholder="••••••••"
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="auth-meter">{password.length}/8</div>
          </>
        )}

        {mode === "criar" && (
          <>
            <label className="auth-label" htmlFor="password2">CONFIRMAR SENHA</label>
            <input
              id="password2"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="••••••••"
              className="auth-input"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
            />
          </>
        )}

        <button className="auth-submit" disabled={busy} type="submit">
          {labels.action}
        </button>

        {status && <div className="auth-status">{status}</div>}

        <div className="auth-links">
          <button type="button" className={mode === "entrar" ? "active" : ""} onClick={() => { setMode("entrar"); setStatus(""); }}>ENTRAR</button>
          <span className="auth-sep">|</span>
          <button type="button" className={mode === "criar" ? "active" : ""} onClick={() => { setMode("criar"); setStatus(""); }}>CRIAR CONTA</button>
          <span className="auth-sep">|</span>
          <button type="button" className={mode === "recuperar" ? "active" : ""} onClick={() => { setMode("recuperar"); setStatus(""); }}>RECUPERAR ACESSO</button>
        </div>
      </form>

      <footer className="auth-badges">
        <span>○ E2E</span>
        <span className="auth-sep">|</span>
        <span>🔏 AES-256</span>
        <span className="auth-sep">|</span>
        <span>⇌ ZERO-TRUST</span>
      </footer>

      <Link href={BASE + "/"} className="auth-back">← voltar ao chat (modo anônimo)</Link>
    </main>
  );
}
