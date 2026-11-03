import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell.jsx";
import { forcaDaSenha, useAuth } from "../auth.jsx";

/** /reset-password: cria a nova senha depois do link enviado por e-mail. */
export default function ResetPassword() {
  const { autenticado, carregando, recuperacao, definirNovaSenha, sair } = useAuth();
  const navigate = useNavigate();
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [pronto, setPronto] = useState(false);

  const forca = forcaDaSenha(senha);
  const iguais = senha && senha === repetir;
  const podeSalvar = forca.minimo && iguais && !busy;
  const linkValido = autenticado || recuperacao;

  useEffect(() => {
    if (!pronto) return;
    const t = setTimeout(() => navigate("/", { replace: true }), 1800);
    return () => clearTimeout(t);
  }, [pronto, navigate]);

  async function salvar(e) {
    e?.preventDefault?.();
    if (!podeSalvar) return;
    setBusy(true); setErro("");
    const r = await definirNovaSenha(senha);
    setBusy(false);
    if (!r.ok) { setErro(r.erro); return; }
    setPronto(true);
  }

  return (
    <AuthShell title="NOVA SENHA" links={<><Link to="/login">ENTRAR</Link><span>|</span><Link to="/recovery">PEDIR OUTRO LINK</Link></>}>
      {carregando ? (
        <p className="muted">Validando o link…</p>
      ) : !linkValido ? (
        <>
          <p>Este link expirou ou já foi usado.</p>
          <p className="muted">Peça um novo link de redefinição para o seu e-mail.</p>
          <Link className="botao" to="/recovery">PEDIR NOVO LINK</Link>
        </>
      ) : pronto ? (
        <>
          <p className="aviso-ok" role="status">Senha atualizada. Entrando na sua conta…</p>
        </>
      ) : (
        <form onSubmit={salvar} className="auth-form">
          <p>Escolha uma nova senha para a sua conta.</p>
          <label className="code-label" htmlFor="nova-senha">NOVA SENHA (MÍNIMO 8 CARACTERES)</label>
          <input id="nova-senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" aria-label="Nova senha" required minLength={8} />
          <div className="forca" aria-hidden="true">
            {[1, 2, 3, 4].map((n) => <span key={n} className={forca.pontos >= n ? "on" : ""} />)}
          </div>
          <label className="code-label" htmlFor="rep-senha">REPETIR NOVA SENHA</label>
          <input id="rep-senha" type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} autoComplete="new-password" aria-label="Repetir nova senha" required />
          {repetir && !iguais && <p className="erro">As senhas não coincidem.</p>}
          <button type="submit" disabled={!podeSalvar}>{busy ? "SALVANDO…" : "SALVAR NOVA SENHA"}</button>
          <p className="hint">Depois de salvar, você continua logado neste dispositivo.</p>
          {autenticado && (
            <button type="button" className="link-secundario" onClick={async () => { await sair(); navigate("/login", { replace: true }); }}>
              SAIR DESTA CONTA
            </button>
          )}
        </form>
      )}
      {erro && <p className="erro" role="alert">{erro}</p>}
    </AuthShell>
  );
}
