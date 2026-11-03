import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell.jsx";
import { formatCode } from "../code-format.js";
import { codeAuth } from "../lib.js";
import { useAuth } from "../auth.jsx";
import { destinoSeguro } from "../auth-helpers.js";

/** /login: e-mail + senha (principal) e código de 12 dígitos (alternativo). */
export default function Login() {
  const { entrar, reenviarConfirmacao } = useAuth();
  const navigate = useNavigate();
  const local = useLocation();
  const destino = destinoSeguro(local.state?.from);

  const [metodo, setMetodo] = useState("senha");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [naoConfirmado, setNaoConfirmado] = useState(false);

  const digits = codigo.replace(/\D/g, "");
  const confirmado = new URLSearchParams(local.search).get("confirmado") === "1";

  async function entrarComSenha(e) {
    e?.preventDefault?.();
    if (busy || !/.+@.+\..+/.test(email) || senha.length < 6) return;
    setBusy(true); setErro(""); setAviso(""); setNaoConfirmado(false);
    const r = await entrar(email, senha);
    setBusy(false);
    if (!r.ok) { setErro(r.erro); return; }
    if (r.precisaConfirmar) {
      setNaoConfirmado(true);
      setAviso("Sua conta existe, mas o e-mail ainda não foi confirmado.");
      return;
    }
    navigate(destino, { replace: true });
  }

  async function entrarComCodigo() {
    if (digits.length !== 12 || busy) return;
    setBusy(true); setErro(""); setAviso("");
    const data = await codeAuth("login", { code: digits });
    setBusy(false);
    if (data.ok && data.session) navigate(destino, { replace: true });
    else setErro(data.error || "Não foi possível entrar. Verifique o código.");
  }

  async function reenviar() {
    const r = await reenviarConfirmacao(email);
    setAviso(r.ok ? "Confirmação reenviada. Confira a caixa de entrada e o spam." : r.erro);
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
      {confirmado && !erro && (
        <p className="aviso-ok">E-mail confirmado. Faça login para continuar.</p>
      )}

      <div className="auth-tabs" role="tablist" aria-label="Método de acesso">
        <button type="button" role="tab" aria-selected={metodo === "senha"} className={metodo === "senha" ? "ativo" : ""} onClick={() => { setMetodo("senha"); setErro(""); }}>E-MAIL E SENHA</button>
        <button type="button" role="tab" aria-selected={metodo === "codigo"} className={metodo === "codigo" ? "ativo" : ""} onClick={() => { setMetodo("codigo"); setErro(""); }}>CÓDIGO DE 12 DÍGITOS</button>
      </div>

      {metodo === "senha" ? (
        <form onSubmit={entrarComSenha} className="auth-form">
          <p>Acesse com o e-mail e a senha da sua conta.</p>
          <label className="code-label" htmlFor="login-email">E-MAIL</label>
          <input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" aria-label="E-mail" required />
          <label className="code-label" htmlFor="login-senha">SENHA</label>
          <input id="login-senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="sua senha" aria-label="Senha" required minLength={6} />
          <button type="submit" disabled={busy || !/.+@.+\..+/.test(email) || senha.length < 6}>
            {busy ? "ENTRANDO…" : "ENTRAR"}
          </button>
          <p className="hint"><Link to="/recovery">Esqueci minha senha</Link></p>
        </form>
      ) : (
        <div className="auth-form">
          <p>Insira seu código de ativação de 12 dígitos para acessar a sua conta.</p>
          <label className="code-label">CÓDIGO DE ACESSO {digits.length}/12</label>
          <input
            inputMode="tel"
            value={codigo}
            onChange={(event) => setCodigo(formatCode(event.target.value))}
            onKeyDown={(event) => { if (event.key === "Enter") entrarComCodigo(); }}
            placeholder="0000-0000-0000"
            aria-label="Código de acesso"
          />
          <button type="button" onClick={entrarComCodigo} disabled={digits.length !== 12 || busy}>
            {busy ? "VERIFICANDO…" : "ENTRAR COM CÓDIGO"}
          </button>
          <p className="hint">O código é o mesmo usado antes. Nada mudou para quem já tem conta.</p>
        </div>
      )}

      {erro && <p className="erro" role="alert">{erro}</p>}
      {aviso && <p className="hint" role="status">{aviso}</p>}
      {naoConfirmado && (
        <button type="button" className="link-secundario" onClick={reenviar}>REENVIAR E-MAIL DE CONFIRMAÇÃO</button>
      )}
    </AuthShell>
  );
}
