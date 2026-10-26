import { useState } from "react";
import { Link } from "react-router-dom";
import AuthShell from "../components/AuthShell.jsx";
import { codeAuth } from "../lib.js";

/** /recovery real: email de recuperação cadastrado recebe o código. */
export default function Recovery() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");

  async function send() {
    if (busy || !/.+@.+\..+/.test(email)) return;
    setBusy(true);
    const data = await codeAuth("recover", { email });
    setBusy(false);
    setSent(data.ok ? "pending" : "error");
  }

  return (
    <AuthShell
      title="RECUPERAÇÃO"
      links={
        <>
          <Link to="/login">ENTRAR</Link>
          <span>|</span>
          <Link to="/sign-up">CRIAR CONTA</Link>
        </>
      }
    >
      <p>Digite o email de recuperação cadastrado na sua conta para receber seu código de acesso.</p>
      <label className="code-label">EMAIL DE RECUPERAÇÃO</label>
      <input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="email@exemplo.com"
        aria-label="Email de recuperação"
      />
      <button type="button" onClick={send} disabled={busy || !/.+@.+\..+/.test(email)}>
        {busy ? "ENVIANDO…" : "ENVIAR CÓDIGO"}
      </button>
      {sent === "pending" && (
        <p className="hint">Email registrado. O envio por email está pendente de configuração do servidor — guarde bem seu código de acesso.</p>
      )}
      {sent === "error" && <p className="auth-error">Não foi possível processar agora. Tente novamente.</p>}
      <p className="hint">Não tem email de recuperação? Falar com o suporte</p>
    </AuthShell>
  );
}
