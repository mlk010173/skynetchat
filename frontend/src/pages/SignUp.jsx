import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell.jsx";
import { codeAuth } from "../lib.js";
import { forcaDaSenha, useAuth } from "../auth.jsx";

/** /sign-up: cadastro com e-mail e senha (principal) ou geração de código (alternativo). */
export default function SignUp() {
  const { cadastrar } = useAuth();
  const navigate = useNavigate();

  const [metodo, setMetodo] = useState("senha");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [confirmarEmail, setConfirmarEmail] = useState(false);
  const [codigo, setCodigo] = useState("");

  const forca = forcaDaSenha(senha);
  const iguais = senha && senha === repetir;
  const podeCriar = /.+@.+\..+/.test(email) && forca.minimo && iguais && !busy;

  async function criarComSenha(e) {
    e?.preventDefault?.();
    if (!podeCriar) return;
    setBusy(true); setErro("");
    const r = await cadastrar(email, senha, nome);
    setBusy(false);
    if (!r.ok) { setErro(r.erro); return; }
    if (r.precisaConfirmar) { setConfirmarEmail(true); return; }
    navigate("/", { replace: true });
  }

  async function gerarCodigo() {
    if (busy) return;
    setBusy(true); setErro("");
    const data = await codeAuth("signup");
    setBusy(false);
    if (data.ok && data.code) setCodigo(data.code);
    else setErro(data.error || "Não foi possível gerar o código. Tente novamente.");
  }

  if (confirmarEmail) {
    return (
      <AuthShell title="CONFIRME SEU E-MAIL" links={<><Link to="/login">ENTRAR</Link><span>|</span><Link to="/sign-up" onClick={() => setConfirmarEmail(false)}>VOLTAR</Link></>}>
        <p>Enviamos um link de confirmação para <b>{email}</b>.</p>
        <p className="muted">
          Abra o e-mail e clique no link para ativar a conta. Se não chegar em alguns minutos,
          confira o spam ou entre em contato pelo suporte.
        </p>
        <button type="button" onClick={() => navigate("/login", { replace: true })}>IR PARA O LOGIN</button>
      </AuthShell>
    );
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
      <div className="auth-tabs" role="tablist" aria-label="Método de cadastro">
        <button type="button" role="tab" aria-selected={metodo === "senha"} className={metodo === "senha" ? "ativo" : ""} onClick={() => { setMetodo("senha"); setErro(""); }}>E-MAIL E SENHA</button>
        <button type="button" role="tab" aria-selected={metodo === "codigo"} className={metodo === "codigo" ? "ativo" : ""} onClick={() => { setMetodo("codigo"); setErro(""); }}>CÓDIGO SECRETO</button>
      </div>

      {metodo === "senha" ? (
        <form onSubmit={criarComSenha} className="auth-form">
          <p>Crie sua conta com e-mail e senha. Você recebe um link para confirmar o endereço.</p>
          <label className="code-label" htmlFor="cad-nome">NOME (OPCIONAL)</label>
          <input id="cad-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="como quer ser chamado" autoComplete="name" />
          <label className="code-label" htmlFor="cad-email">E-MAIL</label>
          <input id="cad-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" autoComplete="email" aria-label="E-mail" required />
          <label className="code-label" htmlFor="cad-senha">SENHA (MÍNIMO 8 CARACTERES)</label>
          <input id="cad-senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="crie uma senha forte" autoComplete="new-password" aria-label="Senha" required minLength={8} />
          <div className="forca" aria-hidden="true">
            {[1, 2, 3, 4].map((n) => <span key={n} className={forca.pontos >= n ? "on" : ""} />)}
          </div>
          <label className="code-label" htmlFor="cad-repetir">REPETIR SENHA</label>
          <input id="cad-repetir" type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} placeholder="repita a senha" autoComplete="new-password" aria-label="Repetir senha" required />
          {repetir && !iguais && <p className="erro">As senhas não coincidem.</p>}
          <button type="submit" disabled={!podeCriar}>{busy ? "CRIANDO…" : "CRIAR CONTA"}</button>
          <p className="muted">Ao criar a conta você confirma ter +18 anos e aceita os Termos de Serviço e Privacidade.</p>
        </form>
      ) : codigo ? (
        <div className="auth-form">
          <p>Guarde este código. Ele também é uma chave de acesso:</p>
          <div className="code-reveal">{codigo.slice(0, 4)}-{codigo.slice(4, 8)}-{codigo.slice(8)}</div>
          <p className="muted">A conta já foi criada e você entrou automaticamente.</p>
          <button type="button" onClick={() => navigate("/", { replace: true })}>ENTRAR NO CHAT</button>
        </div>
      ) : (
        <div className="auth-form">
          <p>Um código secreto de 12 dígitos será gerado. Ele é uma alternativa ao e-mail e senha.</p>
          <p className="muted">Ao gerar o código, você confirma ter +18 anos e aceita os Termos de Serviço e Privacidade.</p>
          <button type="button" onClick={gerarCodigo} disabled={busy}>{busy ? "GERANDO…" : "GERAR CÓDIGO DE ACESSO"}</button>
        </div>
      )}

      {erro && <p className="erro" role="alert">{erro}</p>}
    </AuthShell>
  );
}
