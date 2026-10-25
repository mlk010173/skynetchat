"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/client-auth";

export default function LoginPage() {
  const supabase = getSupabase();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setMsg({ text: "Supabase não configurado no servidor. Contate o administrador.", ok: false });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) setMsg({ text: error.message, ok: false });
        else setMsg({ text: "Conta criada! Confirme pelo seu email e entre. Se o projeto não exigir confirmação, entre direto.", ok: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMsg({ text: error.message, ok: false });
        else {
          setMsg({ text: "Acesso liberado. Redirecionando…", ok: true });
          window.location.href = "/";
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <h1>SKYHUB<span style={{ color: "var(--red)" }}>_</span></h1>
        <p className="sub">console de acesso — conta real no Supabase</p>

        <div className="login-tabs">
          <button
            className={`login-tab ${mode === "signin" ? "active" : ""}`}
            onClick={() => { setMode("signin"); setMsg(null); }}
          >ENTRAR</button>
          <button
            className={`login-tab ${mode === "signup" ? "active" : ""}`}
            onClick={() => { setMode("signup"); setMsg(null); }}
          >CRIAR CONTA</button>
        </div>

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
            />
          </div>
          <div className="field">
            <label htmlFor="password">senha</label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="mínimo 6 caracteres"
            />
          </div>
          <button className="btn btn-primary btn-full" disabled={busy}>
            {busy ? "…" : mode === "signin" ? "ENTRAR ▸" : "CRIAR CONTA ▸"}
          </button>
        </form>

        <div className={`login-msg ${msg?.ok ? "ok" : "err"}`}>{msg?.text ?? ""}</div>

        <div className="login-alt">
          <a href="/">← voltar ao chat (modo anônimo)</a>
        </div>
      </div>
    </div>
  );
}
