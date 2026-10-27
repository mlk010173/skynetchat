import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconBell, IconBook, IconChat, IconClose, IconCode, IconEdit, IconFolder,
  IconGift, IconHistory, IconImage, IconInstagram, IconLife, IconMoney,
  IconTheme, IconUser, IconUsers,
} from "./Icons.jsx";
import { api, getSession } from "../lib.js";

const items = [
  { label: "Novo chat", desc: "Inicie uma conversa do zero", icon: IconEdit },
  { label: "Indique e Ganhe", desc: "Convide amigos e ganhe assinatura PRO", icon: IconGift },
  { label: "Monetize com SKYNETchat", tag: "NOVO", icon: IconMoney },
  { label: "Atualizações", desc: "Veja as novidades e melhorias recentes", icon: IconBell },
  { label: "Imagens", tag: "BETA", desc: "Gere e explore imagens com IA", icon: IconImage },
  { label: "Conversas em grupo", tag: "NOVO", desc: "Colabore com múltiplos agentes", icon: IconUsers },
  { label: "Codex", tag: "NOVO", desc: "Terminal real e seguro", icon: IconCode },
  { label: "Projetos", tag: "NOVO", desc: "Organize tarefas e entregas", icon: IconFolder },
  { label: "Histórico de conversas", desc: "Revise chats anteriores", icon: IconHistory },
  { label: "Conheça o SKYNETchat", desc: "Descubra como funciona o projeto", icon: IconBook },
  { label: "Prompts", desc: "Prompts úteis para usar com a IA", icon: IconChat },
  { label: "Suporte", desc: "Tire dúvidas e fale com o suporte", icon: IconLife },
];

/** Drawer lateral: interface do site real com backend próprio. */
export default function Sidebar({ open, onClose, active, onSelect, logged, onLogout, say, onOpenConv, draftFill }) {
  const [view, setView] = useState("menu");
  const [convs, setConvs] = useState([]);

  // Estados do Terminal
  const [termCmd, setTermCmd] = useState("ls");
  const [termStatus, setTermStatus] = useState("idle"); // idle, executando, concluido, erro
  const [termOutput, setTermOutput] = useState("");
  const [termMs, setTermMs] = useState(null);

  const loadConvs = useCallback(async () => {
    if (!logged) { setConvs([]); return; }
    const session = await getSession();
    if (!session) return;
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/conversations`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json().catch(() => null);
    if (data?.ok && Array.isArray(data.conversations)) setConvs(data.conversations);
  }, [logged]);

  useEffect(() => { if (view === "history") loadConvs(); }, [view, loadConvs]);

  const soon = (label) => {
    say(`"${label}" ainda não existe nesta versão. O que já funciona: chat com IA real, histórico, prompts, atualizações e Terminal Codex.`);
    onClose();
  };

  const executarComando = async (e) => {
    if (e) e.preventDefault();
    const cmd = termCmd.trim();
    if (!cmd || termStatus === "executando") return;

    setTermStatus("executando");
    setTermOutput("");
    setTermMs(null);

    try {
      const data = await api("agent-exec", {
        method: "POST",
        body: { command: cmd },
      });

      if (data.ok) {
        setTermStatus("concluido");
        setTermOutput(data.stdout || data.stderr || "(comando executado sem saída)");
        setTermMs(data.ms ?? null);
      } else {
        setTermStatus("erro");
        setTermOutput(data.error || data.stderr || "Erro ao executar o comando.");
        setTermMs(data.ms ?? null);
      }
    } catch (err) {
      setTermStatus("erro");
      setTermOutput(String(err?.message || err));
    }
  };

  return (
    <>
      <div className={`scrim ${open ? "show" : ""}`} onClick={onClose} />
      <aside className={`drawer ${open ? "open" : ""}`} aria-hidden={!open}>
        <div className="drawer-head">
          <div className="brand">
            <img src={`${import.meta.env.BASE_URL}skynet-logo-vermelha.png`} alt="" className="brand-logo" />
            <span>SKYNETchat</span>
          </div>
          <button type="button" className="icon-btn muted" onClick={onClose} aria-label="Fechar menu">
            <IconClose />
          </button>
        </div>

        {view === "menu" && (
          <nav className="drawer-list">
            {items.map(({ label, desc, tag, icon: Icon }) => (
              <button
                key={label}
                type="button"
                className={`drawer-item ${active === label ? "active" : ""}`}
                onClick={() => {
                  onSelect(label);
                  if (label === "Histórico de conversas") { setView("history"); }
                  else if (label === "Novo chat") onClose();
                  else if (label === "Atualizações") { setView("updates"); }
                  else if (label === "Prompts") { setView("prompts"); }
                  else if (label === "Suporte") { setView("support"); }
                  else if (label === "Conheça o SKYNETchat") { setView("about"); }
                  else if (label === "Codex") { setView("terminal"); }
                  else if (label !== "Fazer login") soon(label);
                }}
              >
                <Icon className="di-icon" />
                <span className="di-text">
                  <span className="di-title">
                    {label}
                    {tag && <em className="tag">{tag}</em>}
                  </span>
                  {desc && <small>{desc}</small>}
                </span>
              </button>
            ))}
          </nav>
        )}

        {view === "terminal" && (
          <div className="drawer-list panel">
            <button type="button" className="drawer-item" onClick={() => setView("menu")}>
              <IconClose className="di-icon" />
              <span className="di-text"><span className="di-title">Voltar ao menu</span></span>
            </button>
            <p className="panel-title">TERMINAL REAL</p>

            {!logged ? (
              <div className="panel-card">
                <p style={{ color: "#a3a3a3", fontSize: "13px", margin: 0 }}>
                  Requer login para acessar o Terminal Real. Por favor, entre na sua conta para executar comandos.
                </p>
              </div>
            ) : (
              <div className="panel-card">
                <form onSubmit={executarComando}>
                  <div style={{ marginBottom: "10px" }}>
                    <label style={{ fontSize: "11px", color: "#8d8d8d", display: "block", marginBottom: "4px" }}>Comando:</label>
                    <input
                      type="text"
                      value={termCmd}
                      onChange={(e) => setTermCmd(e.target.value)}
                      placeholder="Ex: ls, cat README.md, python3 --version..."
                      disabled={termStatus === "executando"}
                      style={{
                        width: "100%",
                        background: "#050505",
                        border: "1px solid #282828",
                        borderRadius: "6px",
                        padding: "8px 10px",
                        color: "#fff",
                        fontFamily: "var(--mono)",
                        fontSize: "13px",
                        boxSizing: "border-box"
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={termStatus === "executando" || !termCmd.trim()}
                    style={{
                      width: "100%",
                      background: termStatus === "executando" ? "#444" : "var(--red)",
                      color: "#000",
                      fontWeight: "bold",
                      border: "none",
                      borderRadius: "6px",
                      padding: "8px 12px",
                      cursor: termStatus === "executando" ? "not-allowed" : "pointer",
                      fontFamily: "var(--mono)",
                      fontSize: "12px",
                      marginBottom: "12px"
                    }}
                  >
                    {termStatus === "executando" ? "Executando..." : "Executar"}
                  </button>
                </form>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", fontSize: "12px" }}>
                  <span style={{ color: "#8d8d8d" }}>Estado:</span>
                  {termStatus === "idle" && <span style={{ color: "#666" }}>Aguardando</span>}
                  {termStatus === "executando" && <span style={{ color: "#eab308", fontWeight: "bold" }}>● Executando...</span>}
                  {termStatus === "concluido" && <span style={{ color: "#22c55e", fontWeight: "bold" }}>✓ Concluído {termMs !== null ? `(${termMs}ms)` : ""}</span>}
                  {termStatus === "erro" && <span style={{ color: "#ef4444", fontWeight: "bold" }}>✕ Erro</span>}
                </div>

                {termOutput !== "" && (
                  <div>
                    <span style={{ fontSize: "11px", color: "#8d8d8d", display: "block", marginBottom: "4px" }}>Saída:</span>
                    <pre
                      style={{
                        background: "#050505",
                        border: "1px solid #1f1f1f",
                        borderRadius: "6px",
                        padding: "10px",
                        color: termStatus === "erro" ? "#f87171" : "#a3e635",
                        fontFamily: "var(--mono)",
                        fontSize: "11px",
                        maxHeight: "220px",
                        overflowY: "auto",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                        margin: 0
                      }}
                    >
                      {termOutput}
                    </pre>
                  </div>
                )}

                <p style={{ color: "#666", fontSize: "10px", marginTop: "10px", marginBottom: 0 }}>
                  Binários permitidos: ls, cat, grep, find, head, tail, wc, echo, node, python3, git, npm, df, du.
                </p>
              </div>
            )}
          </div>
        )}

        {view === "history" && (
          <div className="drawer-list">
            <button type="button" className="drawer-item" onClick={() => setView("menu")}>
              <IconClose className="di-icon" />
              <span className="di-text"><span className="di-title">Voltar ao menu</span></span>
            </button>
            {!logged && <p className="panel-empty">Entre para salvar e revisar conversas.</p>}
            {logged && convs.length === 0 && <p className="panel-empty">Nenhuma conversa ainda.</p>}
            {convs.map((c) => (
              <button key={c.id} type="button" className="drawer-item" onClick={() => { onOpenConv(c.id); }}>
                <IconHistory className="di-icon" />
                <span className="di-text"><span className="di-title conv-title">{c.title}</span></span>
              </button>
            ))}
          </div>
        )}

        {view === "updates" && (
          <div className="drawer-list panel">
            <button type="button" className="drawer-item" onClick={() => setView("menu")}>
              <IconClose className="di-icon" />
              <span className="di-text"><span className="di-title">Voltar</span></span>
            </button>
            <p className="panel-title">ATUALIZAÇÕES</p>
            <div className="panel-card">
              <div className="panel-head"><span>25 DE OUTUBRO</span><b>Admin <i className="mini-badge">ADMIN</i></b></div>
              <strong className="panel-tag">SKYNETchat</strong>
              <p>Novo frontend do projeto: interface fiel do SKYNETchat (menu, hero, composer) sobre código próprio.</p>
              <p>Login por código de 12 dígitos, igual ao modelo real. Chat em streaming, histórico e sessão persistente no Supabase.</p>
            </div>
            <div className="panel-card">
              <div className="panel-head"><span>24 DE OUTUBRO</span><b>Admin <i className="mini-badge">ADMIN</i></b></div>
              <strong className="panel-tag">SKYNETchat</strong>
              <p>Memória de longo prazo (vetorial), busca em português no histórico e sincronização em tempo real entre dispositivos.</p>
            </div>
          </div>
        )}

        {view === "prompts" && (
          <div className="drawer-list panel">
            <button type="button" className="drawer-item" onClick={() => setView("menu")}>
              <IconClose className="di-icon" />
              <span className="di-text"><span className="di-title">Voltar</span></span>
            </button>
            <p className="panel-title">PROMPTS</p>
            <div className="panel-card">
              <div className="panel-head"><span>PROMPTS ÚTEIS</span><b>SKYNETchat</b></div>
              <p>Quanto mais contexto você der, melhores serão as respostas.</p>
              <button className="prompt-btn" onClick={() => { draftFill("Explique como se eu tivesse 10 anos: "); }}>Explique como se eu tivesse 10 anos: …</button>
              <button className="prompt-btn" onClick={() => { draftFill("Revisar e melhorar este texto: "); }}>Revisar e melhorar este texto: …</button>
              <button className="prompt-btn" onClick={() => { draftFill("Resuma em tópicos, em português claro: "); }}>Resuma em tópicos: …</button>
            </div>
          </div>
        )}

        {view === "support" && (
          <div className="drawer-list panel">
            <button type="button" className="drawer-item" onClick={() => setView("menu")}>
              <IconClose className="di-icon" />
              <span className="di-text"><span className="di-title">Voltar</span></span>
            </button>
            <p className="panel-title">SUPORTE</p>
            <div className="panel-card">
              <div className="panel-head"><b>Suporte SKYNETchat</b></div>
              <p className="panel-status">Online · resposta na hora</p>
              <p className="panel-msg">Oi! 👋 Sou o suporte do SKYNETchat. Como posso te ajudar? (conta, acesso…)</p>
              <button className="prompt-btn" onClick={() => { onClose(); say("Guarde seu código de 12 dígitos: é a única chave da conta."); }}>Perdi meu código</button>
              <a className="prompt-btn" href="mailto:suporte@skynet.app?subject=Suporte%20SKYNETchat">Falar com atendente</a>
            </div>
          </div>
        )}

        {view === "about" && (
          <div className="drawer-list panel">
            <button type="button" className="drawer-item" onClick={() => setView("menu")}>
              <IconClose className="di-icon" />
              <span className="di-text"><span className="di-title">Voltar</span></span>
            </button>
            <p className="panel-title">CONHEÇA O SKYNETchat</p>
            <div className="panel-card">
              <p>O SKYNETchat é um chat de IA em português com conta própria, histórico persistente e resposta em streaming.</p>
              <p>Autenticação por código de 12 dígitos (sem senha), sessão persistente e histórico sincronizado entre dispositivos via Supabase.</p>
              <p>Sem simulações: tudo que aparece na interface está conectado ao backend real.</p>
            </div>
          </div>
        )}

        <div className="drawer-foot">
          {logged ? (
            <>
              <p className="account-line">Conta ativa · acesso por código</p>
              <button type="button" className="drawer-item plain" onClick={() => { onClose(); onLogout(); }}>
                <IconUser className="di-icon" />
                <span className="di-title">Sair da conta</span>
              </button>
            </>
          ) : (
            <Link to="/login" className="drawer-item plain" onClick={onClose}>
              <IconUser className="di-icon" />
              <span className="di-title">Fazer login / Criar conta</span>
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
