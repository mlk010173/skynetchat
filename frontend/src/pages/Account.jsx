import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getSession, supabase, contaAuth } from "../lib.js";

/** /account — modal de conta: abas Conta/Segurança/Assinatura. */
export default function Account() {
  const [tab, setTab] = useState("conta");
  const [user, setUser] = useState(null);
  const [saved, setSaved] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [proMsg, setProMsg] = useState("");
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => { if (params.get("tab")) setTab(params.get("tab")); }, [params]);
  const [guest, setGuest] = useState(false);
  const [nick, setNick] = useState("");
  const [nickBusy, setNickBusy] = useState(false);
  const [nickMsg, setNickMsg] = useState("");
  const [myCode, setMyCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);

  // --- e-mail de recuperacao com verificacao por codigo de 8 digitos ---
  const [email, setEmail] = useState("");
  const [verificado, setVerificado] = useState(null); // null = desconhecido
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [code8, setCode8] = useState("");
  const [verificando, setVerificando] = useState(false);

  useEffect(() => {
    getSession().then((s) => {
      if (s?.user) { setUser(s.user); setNick(String(s.user.user_metadata?.nickname ?? "")); }
      else setGuest(true);
    });
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const s = await getSession();
      if (!s?.access_token) return;
      const d = await contaAuth("session", {}, s.access_token);
      if (!vivo || !d?.ok || !d.user) return;
      setEmail(String(d.user.recoveryEmail ?? ""));
      if (typeof d.user.recoveryEmailVerified === "boolean") setVerificado(d.user.recoveryEmailVerified);
    })();
    return () => { vivo = false; };
  }, [user]);

  async function salvarNick() {
    if (nickBusy) return;
    setNickBusy(true); setNickMsg("");
    const { error } = await supabase.auth.updateUser({ data: { nickname: nick.trim() } });
    setNickBusy(false);
    setNickMsg(error ? "falha ao salvar" : "// salvo — a IA vai te chamar assim");
  }

  async function gerarNovoCodigo() {
    if (codeBusy) return;
    setCodeBusy(true); setErro(""); setSaved("");
    const s = await getSession();
    const d = await contaAuth("new-code", {}, s?.access_token ?? null);
    setCodeBusy(false);
    if (d?.ok && d.newCode) {
      setMyCode(d.newCode);
      setSaved(d.sentToEmail ? "novo codigo gerado e enviado para " + d.sentToEmail : "novo codigo gerado. Guarde agora: ele nao aparece de novo.");
    } else {
      setErro(d?.error || "Nao foi possivel gerar um novo codigo.");
      if (d?.error && /verifique seu e-mail/i.test(d.error)) setVerificado(false);
    }
  }

  /** Salva o e-mail de recuperacao e dispara o codigo de verificacao de 8 digitos. */
  async function salvarEmail() {
    if (busy || !/.+@.+\..+/.test(email)) return;
    setBusy(true); setSaved(""); setErro("");
    const s = await getSession();
    const d = await contaAuth("recovery-email", { email: email.trim().toLowerCase() }, s?.access_token ?? null);
    setBusy(false);
    if (d?.ok) {
      setVerificado(false);
      setCodigoEnviado(true);
      setSaved(d.aviso || "Codigo enviado. Verifique sua caixa de entrada.");
    } else {
      setErro(d?.error || "Nao foi possivel salvar o e-mail.");
    }
  }

  /** Confirma o codigo de 8 digitos e marca o e-mail como verificado. */
  async function confirmarCodigo() {
    if (verificando || code8.length !== 8) return;
    setVerificando(true); setErro(""); setSaved("");
    const s = await getSession();
    const d = await contaAuth("recovery-email-verify", { code: code8 }, s?.access_token ?? null);
    setVerificando(false);
    if (d?.ok && d.verified) {
      setVerificado(true);
      setCodigoEnviado(false);
      setCode8("");
      setSaved("e-mail verificado — recuperacao por e-mail liberada");
    } else {
      setErro(d?.error || "Codigo invalido.");
    }
  }

  async function sair() { await supabase.auth.signOut(); navigate("/", { replace: true }); }

  if (!user && !guest) return <div className="pro-modal-wrap"><p className="hint">carregando…</p></div>;
  const desde = user ? new Date(user.created_at).toLocaleDateString("pt-BR") : "";

  return (
    <div className="pro-modal-wrap">
      <div className="pro-modal">
        <button className="pro-close" onClick={() => navigate("/")} aria-label="Fechar">✕</button>

        <div className="pro-head">
          <div className="pro-badge">{user ? (user.email ? user.email[0].toUpperCase() : "S") : "?"}</div>
          <h2>Conta FREE</h2>
          <small>Plano gratuito</small>
        </div>

        <div className="pro-tabs" role="tablist">
          <button className={"pro-tab" + (tab === "conta" ? " on" : "")} onClick={() => setTab("conta")}>👤 Conta</button>
          <button className={"pro-tab" + (tab === "seguranca" ? " on" : "")} onClick={() => setTab("seguranca")}>🛡 Segurança</button>
          <button className={"pro-tab" + (tab === "assinatura" ? " on" : "")} onClick={() => setTab("assinatura")}>✦ Assinatura</button>
        </div>

        {tab === "conta" && (
          <div className="pro-body">
            {guest && <p className="hint">Entre na sua conta para ver seus dados.</p>}
            {guest && <Link to="/login" className="pro-btn green" style={{ textAlign: "center" }}>ENTRAR</Link>}
            {user && (
            <>
              <label className="pro-lbl">APELIDO</label>
              <div className="nick-box">
                <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="Definir apelido" aria-label="Apelido" maxLength={40} />
                <small>A IA vai te chamar pelo nome</small>
                <button type="button" className="pro-btn" onClick={salvarNick} disabled={nickBusy}>{nickBusy ? "salvando…" : "salvar apelido"}</button>
                {nickMsg && <small className="nick-msg">{nickMsg}</small>}
              </div>

              <label className="pro-lbl green">CÓDIGO DE ACESSO</label>
              <div className="code-box">
                {myCode ? (
                  <>
                    <b className="code-digits">{myCode.replace(/(\d{4})(?=\d)/g, "$1 ")}</b>
                    <small>Use este código para fazer login. Anote: ele não aparece de novo.</small>
                    <button type="button" className="pro-btn green-outline" onClick={() => { navigator.clipboard?.writeText(myCode); }}>⧉ Copiar código</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="pro-btn green-outline" onClick={gerarNovoCodigo} disabled={codeBusy || verificado !== true}>{codeBusy ? "…" : "gerar novo código"}</button>
                    {verificado !== true && <small>Verifique o e-mail de recuperação abaixo antes de gerar um código novo.</small>}
                  </>
                )}
              </div>
            </>
          )}
          {user && <div className="pro-row"><span>Membro desde</span><b>{desde}</b></div>}
            {user && <div className="pro-row"><span>Identidade</span><b>{user.id.slice(0, 8)}</b></div>}
            {user && <label className="code-label">EMAIL DE RECUPERAÇÃO</label>}
            {user && (
              <div className="nick-box">
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" aria-label="Email de recuperação" autoComplete="email" />
                <small>Recebe o código de verificação e o seu código de acesso.</small>
                <button type="button" className="pro-btn" onClick={salvarEmail} disabled={busy}>{busy ? "ENVIANDO…" : "SALVAR E ENVIAR CÓDIGO"}</button>
              </div>
            )}
            {user && verificado === true && <p className="aviso-ok" role="status">✓ e-mail verificado — recuperação por e-mail ativa</p>}
            {user && verificado === false && !codigoEnviado && <p className="hint">e-mail salvo, aguardando verificação</p>}
            {user && codigoEnviado && (
              <div className="code-box">
                <small>Digite o código de 8 dígitos que chegou no e-mail</small>
                <input
                  value={code8}
                  onChange={(e) => setCode8(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="00000000"
                  aria-label="Código de verificação de 8 dígitos"
                  style={{ letterSpacing: "6px", textAlign: "center" }}
                />
                <button type="button" className="pro-btn green-outline" onClick={confirmarCodigo} disabled={verificando || code8.length !== 8}>
                  {verificando ? "CONFERINDO…" : "CONFIRMAR CÓDIGO"}
                </button>
                <small>O código expira em 15 minutos e aceita 5 tentativas.</small>
              </div>
            )}
            {saved && <p className="aviso-ok" role="status">// {saved}</p>}
            {erro && <p className="erro" role="alert">{erro}</p>}
            <p className="hint">Seu código de 12 dígitos é a única chave da conta. Guarde-o.</p>
            {user && <button className="pro-btn danger" onClick={sair}>SAIR DA CONTA</button>}
          </div>
        )}

        {tab === "seguranca" && (
          <div className="pro-body">
            {guest && <p className="hint">Sessão e segurança ficam visíveis após entrar. Autenticação por código de 12 dígitos, sem senha.</p>}
            {guest && <Link to="/login" className="pro-btn green" style={{ textAlign: "center" }}>ENTRAR</Link>}
            {user && <div className="pro-row"><span>Sessão</span><b>ativa (persistente)</b></div>}
            {user && <div className="pro-row"><span>Autenticação</span><b>código de 12 dígitos</b></div>}
            {user && <div className="pro-row"><span>E-mail de recuperação</span><b>{verificado === true ? "verificado" : verificado === false ? "não verificado" : "—"}</b></div>}
            {user && <div className="pro-row"><span>Limite de tentativas</span><b>10 por hora</b></div>}
            <p className="hint">Sem senha: a conta é acessada apenas pelo seu código. Sessão expira conforme a política do Supabase.</p>
            {user && verificado !== true && <p className="hint">Gerar um novo código só é possível com o e-mail de recuperação verificado.</p>}
            {user && <button className="pro-btn danger" onClick={sair}>ENCERRAR SESSÃO</button>}
          </div>
        )}

        {tab === "assinatura" && (
          <div className="pro-body">
            <div className="pro-cta">
              <b>Seja PRO</b>
              <small>Desbloqueie todo o potencial</small>
            </div>
            <ul className="pro-list">
              <li><span className="check">✓</span> Mensagens ilimitadas</li>
              <li><span className="check">✓</span> Geração de imagens com IA</li>
              <li><span className="check">✓</span> 4.5 MAX com pesquisa profunda</li>
              <li><span className="check">✓</span> Memória da IA</li>
            </ul>
            <button className="pro-btn green" onClick={() => setProMsg("Pagamentos ainda não configurados neste projeto. Enquanto isso, tudo o que está na lista que já funciona (memória da IA, histórico) está ativo na sua conta.")}>ASSINAR PRO</button>
            {proMsg && <p className="hint">{proMsg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
