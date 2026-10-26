import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { codeAuth, getSession, supabase } from "../lib.js";

/** /account — modal de conta no estilo do site real: abas Conta/Segurança/Assinatura. */
export default function Account() {
  const [tab, setTab] = useState("conta");
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState("");
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
  useEffect(() => {
    getSession().then((s) => {
      if (s?.user) { setUser(s.user); setNick(String(s.user.user_metadata?.nickname ?? "")); }
      else setGuest(true);
    });
  }, []);

  async function salvarNick() {
    if (nickBusy) return;
    setNickBusy(true); setNickMsg("");
    const { error } = await supabase.auth.updateUser({ data: { nickname: nick.trim() } });
    setNickBusy(false);
    setNickMsg(error ? "falha ao salvar" : "// salvo — a IA vai te chamar assim");
  }

  async function carregarCodigo() {
    setCodeBusy(true);
    const s = await getSession();
    if (!s) { setCodeBusy(false); return; }
    const d = await codeAuth("get_code", {}, s.access_token);
    if (d?.ok && d.code) setMyCode(d.code);
    setCodeBusy(false);
  }

  async function salvarEmail() {
    if (busy || !/.+@.+\..+/.test(email)) return;
    setBusy(true); setSaved("");
    const session = await getSession();
    const res = await fetch(`${API}/auth-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ action: "set_recovery_email", email }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setSaved(data.ok ? "salvo na conta" : (data.error || "falha ao salvar"));
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
                    <small>Use este código para fazer login</small>
                    <button type="button" className="pro-btn green-outline" onClick={() => { navigator.clipboard?.writeText(myCode); }}>⧉ Copiar código</button>
                  </>
                ) : (
                  <button type="button" className="pro-btn green-outline" onClick={carregarCodigo} disabled={codeBusy}>{codeBusy ? "…" : "mostrar meu código"}</button>
                )}
              </div>
            </>
          )}
          {user && <div className="pro-row"><span>Membro desde</span><b>{desde}</b></div>}
            {user && <div className="pro-row"><span>Identidade</span><b>{user.id.slice(0, 8)}</b></div>}
            {user && <label className="code-label">EMAIL DE RECUPERAÇÃO</label>}
            {user && <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" aria-label="Email de recuperação" />}
            {user && <button className="pro-btn" onClick={salvarEmail} disabled={busy}>{busy ? "SALVANDO…" : "SALVAR"}</button>}
            {saved && <p className="hint">// {saved}</p>}
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
            {user && <div className="pro-row"><span>Limite de tentativas</span><b>10 por hora</b></div>}
            <p className="hint">Sem senha: a conta é acessada apenas pelo seu código. Sessão expira conforme a política do Supabase.</p>
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
