import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell.jsx";
import { codeAuth } from "../lib.js";

/** /sign-up real: gera código secreto de 12 dígitos no servidor e entra. */
export default function SignUp() {
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function generate() {
    if (busy) return;
    setBusy(true);
    setError("");
    const data = await codeAuth("signup");
    setBusy(false);
    if (data.ok && data.code) setCode(data.code);
    else setError(data.error || "Não foi possível gerar o código. Tente novamente.");
  }

  return (
    <AuthShell
      title="CRIAR CONTA"
      links={
        <>
          <Link to="/login">ENTRAR</Link>
          <span>|</span>
          <Link to="/recovery">RECUPERAR ACESSO</Link>
        </>
      }
    >
      {code ? (
        <>
          <p>Guarde este código. Ele é sua única chave de acesso:</p>
          <div className="code-reveal">{code.slice(0, 4)}-{code.slice(4, 8)}-{code.slice(8)}</div>
          <p className="muted">A conta já foi criada e você entrou automaticamente.</p>
          <button type="button" onClick={() => navigate("/", { replace: true })}>ENTRAR NO CHAT</button>
        </>
      ) : (
        <>
          <p>Um código secreto de 12 dígitos será gerado. Ele é sua única chave de acesso.</p>
          <p className="muted">
            Ao gerar o código, você confirma ter +18 anos e aceita os Termos de Serviço e Privacidade.
          </p>
          <button type="button" onClick={generate} disabled={busy}>
            {busy ? "GERANDO…" : "GERAR CÓDIGO DE ACESSO"}
          </button>
          <p className="hint">Seu código será salvo no sistema e você entrará automaticamente.</p>
          {error && <p className="auth-error">{error}</p>}
        </>
      )}
    </AuthShell>
  );
}
