import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getSession, supabase, API } from "../lib.js";

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
  useEffect(() => {
    getSession().then((s) => { if (s?.user) setUser(s.user); else setGuest(true); });
  }, []);

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
            <div className="pro-row" style={guest ? { display: "none" } : undefined}><span>Membro desde</span><b>{desde}</b></div>
            <div className="pro-row" style={guest ? { display: "none" } : undefined}><span>Identidade</span><b>{user.id.slice(0, 8)}</b></div>
            <label className="code-label" style={guest ? { display: "none" } : undefined}>EMAIL DE RECUPERAÇÃO</label>
            <input style={guest ? { display: "none" } : undefined} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" aria-label="Email de recuperação" />
            <button style={guest ? { display: "none" } : undefined} className="pro-btn" onClick={salvarEmail} disabled={busy}>{busy ? "SALVANDO…" : "SALVAR"}</button>
            {saved && <p className="hint">// {saved}</p>}
            <p className="hint">Seu código de 12 dígitos é a única chave da conta. Guarde-o.</p>
            <button style={guest ? { display: "none" } : undefined} className="pro-btn danger" onClick={sair}>SAIR DA CONTA</button>
          </div>
        )}

        {tab === "seguranca" && (
          <div className="pro-body">
            {guest && <p className="hint">Sessão e segurança ficam visíveis após entrar. Autenticação por código de 12 dígitos, sem senha.</p>}
            {guest && <Link to="/login" className="pro-btn green" style={{ textAlign: "center" }}>ENTRAR</Link>}
            <div className="pro-row" style={guest ? { display: "none" } : undefined}><span>Sessão</span><b>ativa (persistente)</b></div>
            <div className="pro-row" style={guest ? { display: "none" } : undefined}><span>Autenticação</span><b>código de 12 dígitos</b></div>
            <div className="pro-row" style={guest ? { display: "none" } : undefined}><span>Limite de tentativas</span><b>10 por hora</b></div>
            <p className="hint">Sem senha: a conta é acessada apenas pelo seu código. Sessão expira conforme a política do Supabase.</p>
            <button style={guest ? { display: "none" } : undefined} className="pro-btn danger" onClick={sair}>ENCERRAR SESSÃO</button>
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
