import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell.jsx";
import { codeAuth } from "../lib.js";

export function formatCode(value) {
  const digits = value.replace(/\D/g, "").slice(0, 12);
  return digits.replace(/(\d{4})(?=\d)/g, "$1-");
}

/** /login real: código de 12 dígitos (0000-0000-0000) validado no servidor. */
export default function Login() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const digits = code.replace(/\D/g, "");

  async function enter() {
    if (digits.length !== 12 || busy) return;
    setBusy(true);
    setError("");
    const data = await codeAuth("login", { code: digits });
    setBusy(false);
    if (data.ok && data.session) navigate("/", { replace: true });
    else setError(data.error || "Não foi possível entrar. Verifique o código.");
  }

  return (
    <AuthShell
      title="AUTENTICAÇÃO"
      links={
        <>
          <Link to="/sign-up">CRIAR CONTA</Link>
          <span>|</span>
          <Link to="/recovery">RECUPERAR ACESSO</Link>
        </>
      }
    >
      <p>Insira seu código de ativação de 12 dígitos para acessar a sua conta.</p>
      <label className="code-label">CÓDIGO DE ACESSO {digits.length}/12</label>
      <input
        inputMode="tel"
        value={code}
        onChange={(event) => setCode(formatCode(event.target.value))}
        onKeyDown={(event) => { if (event.key === "Enter") enter(); }}
        placeholder="0000-0000-0000"
        aria-label="Código de acesso"
      />
      <button type="button" disabled={digits.length !== 12 || busy} onClick={enter}>
        {busy ? "VERIFICANDO…" : "ENTRAR"}
      </button>
      {error && <p className="auth-error">{error}</p>}
    </AuthShell>
  );
}
