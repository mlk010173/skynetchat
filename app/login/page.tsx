"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/client-auth";

type Mode = "signin" | "signup" | "forgot";

export default function LoginPage() {
  const supabase = getSupabase();
  const [mode, setMode] = useState<Mode>("signin");
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
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset`,
        });
        if (error) setMsg({ text: error.message, ok: false });
        else setMsg({ text: "Link de recuperação enviado! Confira seu email.", ok: true });
        return;
      }
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) setMsg({ text: error.message, ok: false });
        else setMsg({ text: "Conta criada! Se o projeto exigir confirmação, confirme pelo email antes de entrar.", ok: true });
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

  const tabs: { id: Mode; label: string }[] = [
    { id: "signin", label: "ENTRAR" },
    { id: "signup", label: "CRIAR CONTA" },
  ];

  return (
    <div className="login-page">
      <div className="login-box">
        <h1>SKY<span>HUB</span></h1>
        <p className="sub">
          {mode === "forgot" ? "recuperação de senha" : "console de acesso — conta real no Supabase"}
        </p>

        {mode !== "forgot" && (
          <div className="login-tabs">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`login-tab ${mode === t.id ? "active" : ""}`}
                onClick={() => { setMode(t.id); setMsg(null); }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

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

          {mode !== "forgot" && (
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
          )}

          <button className="btn-primary-full" disabled={busy}>
            {busy
              ? "…"
              : mode === "signin"
                ? "ENTRAR ▸"
                : mode === "signup"
                  ? "CRIAR CONTA ▸"
                  : "ENVIAR LINK ▸"}
          </button>
        </form>

        <div className={`login-msg ${msg?.ok ? "ok" : "err"}`}>{msg?.text ?? ""}</div>

        <div className="login-alt">
          {mode === "forgot" ? (
            <a href="/login" onClick={() => setMode("signin")}>← voltar ao login</a>
          ) : (
            <a href="#" onClick={(e) => { e.preventDefault(); setMode("forgot"); setMsg(null); }}>
              esqueci minha senha
            </a>
          )}
          <br />
          <a href="/">← voltar ao chat (modo anônimo)</a>
        </div>
      </div>
    </div>
  );
}
