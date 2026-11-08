import { useState } from "react";
import { Link } from "react-router-dom";
import AuthShell from "../components/AuthShell.jsx";
import { contaAuth } from "../lib.js";
import { useAuth } from "../auth.jsx";

/** /recovery: redefinir senha por e-mail (principal) ou recuperar o código de 12 dígitos. */
export default function Recovery() {
  const { recuperarSenha } = useAuth();
  const [metodo, setMetodo] = useState("senha");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [estado, setEstado] = useState(""); // "" | "enviado" | "erro"
  const [detalhe, setDetalhe] = useState("");

  const emailValido = /.+@.+\..+/.test(email);

  async function enviarSenha() {
    if (busy || !emailValido) return;
    setBusy(true); setEstado(""); setDetalhe("");
    const r = await recuperarSenha(email);
    setBusy(false);
    if (r.ok) setEstado("enviado");
    else { setEstado("erro"); setDetalhe(r.erro); }
  }

  async function enviarCodigo() {
    if (busy || !emailValido) return;
    setBusy(true); setEstado(""); setDetalhe("");
    const data = await contaAuth("recovery-request", { email });
    setBusy(false);
    if (data.ok) { setEstado("enviado"); setDetalhe(data.aviso || data.mensagem || ""); }
    else { setEstado("erro"); setDetalhe(data.error || "Não foi possível solicitar a recuperação."); }
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
      <div className="auth-tabs" role="tablist" aria-label="Tipo de recuperação">
        <button type="button" role="tab" aria-selected={metodo === "senha"} className={metodo === "senha" ? "ativo" : ""} onClick={() => { setMetodo("senha"); setEstado(""); }}>REDEFINIR SENHA</button>
        <button type="button" role="tab" aria-selected={metodo === "codigo"} className={metodo === "codigo" ? "ativo" : ""} onClick={() => { setMetodo("codigo"); setEstado(""); }}>RECUPERAR CÓDIGO</button>
      </div>

      {metodo === "senha" ? (
        <div className="auth-form">
          <p>Informe o e-mail da conta. Enviamos um link para você criar uma nova senha.</p>
          <label className="code-label" htmlFor="rec-email">E-MAIL DA CONTA</label>
          <input id="rec-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" autoComplete="email" aria-label="E-mail da conta" />
          <button type="button" onClick={enviarSenha} disabled={busy || !emailValido}>
            {busy ? "ENVIANDO…" : "ENVIAR LINK DE REDEFINIÇÃO"}
          </button>
          {estado === "enviado" && (
            <p className="aviso-ok" role="status">
              Se este e-mail tiver conta, o link de redefinição foi enviado. Confira a caixa de entrada e o spam.
            </p>
          )}
        </div>
      ) : (
        <div className="auth-form">
          <p>Quem entrou pelo código de 12 dígitos pode solicitar a recuperação pelo e-mail cadastrado.</p>
          <label className="code-label" htmlFor="rec-email-cod">EMAIL DE RECUPERAÇÃO</label>
          <input id="rec-email-cod" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" aria-label="Email de recuperação" />
          <button type="button" onClick={enviarCodigo} disabled={busy || !emailValido}>
            {busy ? "ENVIANDO…" : "SOLICITAR RECUPERAÇÃO"}
          </button>
          {estado === "enviado" && (
            <p className="aviso-ok" role="status">{detalhe || "Pedido registrado. O código novo chega pelo e-mail cadastrado."}</p>
          )}
        </div>
      )}

      {estado === "erro" && <p className="erro" role="alert">{detalhe}</p>}
      <p className="hint">Se você ainda tem seu código de 12 dígitos, pode entrar direto em <Link to="/login">/login</Link>.</p>
    </AuthShell>
  );
}
