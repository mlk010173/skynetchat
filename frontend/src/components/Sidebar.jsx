import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  IconBell, IconBook, IconChat, IconClose, IconCode, IconEdit, IconFolder,
  IconGift, IconHistory, IconImage, IconInstagram, IconLife, IconMail, IconMoney,
  IconPlug, IconTheme, IconUser, IconUsers,
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
  { label: "Integrações", tag: "REAL", desc: "Central de integrações e estado ao vivo", icon: IconPlug },
  { label: "E-mail", tag: "REAL", desc: "Painel de E-mail via Gmail API", icon: IconMail },

  { label: "Projetos", tag: "NOVO", desc: "Organize tarefas e entregas", icon: IconFolder },
  { label: "Histórico de conversas", desc: "Revise chats anteriores", icon: IconHistory },
  { label: "Conheça o SKYNETchat", desc: "Descubra como funciona o projeto", icon: IconBook },
  { label: "Prompts", desc: "Prompts úteis para usar com a IA", icon: IconChat },
  { label: "Suporte", desc: "Tire dúvidas e fale com o suporte", icon: IconLife },
];

/** Drawer lateral: interface do site real com backend próprio. */
export default function Sidebar({ open, onClose, active, onSelect, logged, onLogout, say, onOpenConv, draftFill }) {
  const navigate = useNavigate();
  const [view, setView] = useState("menu");
  const [convs, setConvs] = useState([]);


  // Estados do E-mail
  const [emailSubView, setEmailSubView] = useState("list"); // list, read, draft
  const [emailList, setEmailList] = useState([]);
  const [emailSearch, setEmailSearch] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailStateMsg, setEmailStateMsg] = useState("");
  const [selectedEmail, setSelectedEmail] = useState(null);

  const [draftTo, setDraftTo] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftId, setDraftId] = useState(null);
  const [draftStatus, setDraftStatus] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [sending, setSending] = useState(false);

  const loadEmails = useCallback(async (query = "") => {
    if (!logged) return;
    setEmailLoading(true);
    setEmailStateMsg("");
    try {
      const data = await api("email", {
        method: "POST",
        body: { action: query ? "search" : "list", q: query }
      });
      if (data.estado === "token_expirado") {
        setEmailStateMsg("token_expirado");
        setEmailList([]);
      } else if (data.estado === "pendente_configuracao") {
        setEmailStateMsg("pendente_configuracao");
        setEmailList([]);
      } else if (data.ok && Array.isArray(data.messages)) {
        setEmailList(data.messages);
      } else {
        setEmailStateMsg(data.error || "Erro ao carregar e-mails.");
      }
    } catch (err) {
      setEmailStateMsg(String(err?.message || err));
    } finally {
      setEmailLoading(false);
    }
  }, [logged]);

  useEffect(() => {
    if (view === "email" && emailSubView === "list") {
      loadEmails(emailSearch);
    }
  }, [view, emailSubView, loadEmails]);

  const readEmail = async (msgId) => {
    setEmailLoading(true);
    try {
      const data = await api("email", {
        method: "POST",
        body: { action: "read", id: msgId }
      });
      if (data.estado === "token_expirado") {
        setEmailStateMsg("token_expirado");
      } else if (data.ok) {
        setSelectedEmail(data);
        setEmailSubView("read");
      } else {
        alert(data.error || "Erro ao ler e-mail.");
      }
    } catch (err) {
      alert(String(err?.message || err));
    } finally {
      setEmailLoading(false);
    }
  };

  const handleCreateDraft = async (e) => {
    if (e) e.preventDefault();
    if (!draftTo.trim()) return;
    setDraftStatus("Criando rascunho...");
    try {
      const data = await api("email", {
        method: "POST",
        body: { action: "draft", to: draftTo, subject: draftSubject, body: draftBody }
      });
      if (data.estado === "token_expirado") {
        setDraftStatus("Token expirado.");
        setEmailStateMsg("token_expirado");
      } else if (data.ok) {
        setDraftId(data.id);
        setDraftStatus("Rascunho criado com sucesso! ID: " + data.id);
      } else {
        setDraftStatus("Erro: " + (data.error || "Falha ao criar rascunho"));
      }
    } catch (err) {
      setDraftStatus("Erro: " + String(err?.message || err));
    }
  };

  const handleSendDraftClick = async () => {
    if (!draftTo.trim()) {
      alert("Informe o destinatário para enviar o e-mail.");
      return;
    }
    if (!draftId) {
      setDraftStatus("Salvando rascunho antes de enviar...");
      try {
        const data = await api("email", {
          method: "POST",
          body: { action: "draft", to: draftTo, subject: draftSubject, body: draftBody }
        });
        if (data.ok) {
          setDraftId(data.id);
          setShowConfirmModal(true);
        } else {
          alert(data.error || "Falha ao salvar rascunho.");
        }
      } catch (err) {
        alert(String(err?.message || err));
      }
    } else {
      setShowConfirmModal(true);
    }
  };

  const confirmSend = async () => {
    if (!draftId) return;
    setSending(true);
    try {
      const data = await api("email", {
        method: "POST",
        body: { action: "send", id: draftId }
      });
      if (data.ok) {
        alert("E-mail enviado com sucesso!");
        setShowConfirmModal(false);
        setDraftTo("");
        setDraftSubject("");
        setDraftBody("");
        setDraftId(null);
        setDraftStatus("");
        setEmailSubView("list");
        loadEmails(emailSearch);
      } else {
        alert(data.error || "Erro ao enviar e-mail.");
      }
    } catch (err) {
      alert(String(err?.message || err));
    } finally {
      setSending(false);
    }
  };

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
    say(`"${label}" ainda não existe nesta versão. O que já funciona: chat com IA real, histórico, prompts, atualizações, Terminal Codex e Integrações.`);
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
                  else if (label === "Integrações") { navigate("/integracoes"); onClose(); }
                  else if (label === "E-mail") { setView("email"); }
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

        
        {view === "email" && (
          <div className="drawer-list panel">
            <button type="button" className="drawer-item" onClick={() => { setView("menu"); setEmailSubView("list"); }}>
              <IconClose className="di-icon" />
              <span className="di-text"><span className="di-title">Voltar ao menu</span></span>
            </button>
            <p className="panel-title">E-MAIL REAL (GMAIL API)</p>

            {!logged ? (
              <div className="panel-card">
                <p style={{ color: "#a3a3a3", fontSize: "13px", margin: 0 }}>
                  Faça login para acessar o painel de E-mail real via Gmail API.
                </p>
              </div>
            ) : emailStateMsg === "token_expirado" ? (
              <div className="panel-card" style={{ borderLeft: "3px solid #ef4444" }}>
                <p style={{ color: "#f87171", fontWeight: "bold", fontSize: "13px", margin: "0 0 4px 0" }}>
                  Token do Gmail Expirado
                </p>
                <p style={{ color: "#a3a3a3", fontSize: "12px", margin: 0 }}>
                  O token de acesso OAuth possui validade de ~1h e expirou. Por favor, atualize o secret <code>GMAIL_ACCESS_TOKEN</code> no Supabase.
                </p>
              </div>
            ) : emailStateMsg === "pendente_configuracao" ? (
              <div className="panel-card" style={{ borderLeft: "3px solid #f59e0b" }}>
                <p style={{ color: "#fbbf24", fontWeight: "bold", fontSize: "13px", margin: "0 0 4px 0" }}>
                  Pendente Configuração
                </p>
                <p style={{ color: "#a3a3a3", fontSize: "12px", margin: 0 }}>
                  A integração aguarda o secret <code>GMAIL_ACCESS_TOKEN</code> no Supabase.
                </p>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
                  <button
                    type="button"
                    onClick={() => setEmailSubView("list")}
                    style={{
                      flex: 1, padding: "6px", borderRadius: "4px", border: "1px solid #333",
                      background: emailSubView === "list" ? "#222" : "transparent", color: "#fff", fontSize: "12px"
                    }}
                  >
                    Caixa de Entrada
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEmailSubView("draft"); setDraftStatus(""); }}
                    style={{
                      flex: 1, padding: "6px", borderRadius: "4px", border: "1px solid #333",
                      background: emailSubView === "draft" ? "#222" : "transparent", color: "#fff", fontSize: "12px"
                    }}
                  >
                    + Novo Rascunho
                  </button>
                </div>

                {emailSubView === "list" && (
                  <div>
                    <form
                      onSubmit={(e) => { e.preventDefault(); loadEmails(emailSearch); }}
                      style={{ display: "flex", gap: "6px", marginBottom: "12px" }}
                    >
                      <input
                        type="text"
                        value={emailSearch}
                        onChange={(e) => setEmailSearch(e.target.value)}
                        placeholder="Buscar e-mails (ex: github)..."
                        style={{
                          flex: 1, background: "#050505", border: "1px solid #282828",
                          borderRadius: "4px", padding: "6px 8px", color: "#fff", fontSize: "12px"
                        }}
                      />
                      <button
                        type="submit"
                        disabled={emailLoading}
                        style={{
                          background: "#333", color: "#fff", border: "none",
                          borderRadius: "4px", padding: "6px 10px", fontSize: "12px", cursor: "pointer"
                        }}
                      >
                        Buscar
                      </button>
                    </form>

                    {emailLoading ? (
                      <p style={{ color: "#8d8d8d", fontSize: "12px" }}>Carregando e-mails...</p>
                    ) : emailList.length === 0 ? (
                      <p style={{ color: "#8d8d8d", fontSize: "12px" }}>Nenhum e-mail encontrado.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {emailList.map((msg) => (
                          <div
                            key={msg.id}
                            onClick={() => readEmail(msg.id)}
                            style={{
                              background: "#080808", border: "1px solid #222", borderRadius: "6px",
                              padding: "8px 10px", cursor: "pointer", transition: "background 0.2s"
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                              <strong style={{ color: "#e5e5e5", fontSize: "12px" }}>{msg.from || "Desconhecido"}</strong>
                              <small style={{ color: "#666", fontSize: "10px" }}>{msg.date ? new Date(msg.date).toLocaleDateString("pt-BR") : ""}</small>
                            </div>
                            <div style={{ color: "#60a5fa", fontSize: "12px", fontWeight: "bold", marginBottom: "4px" }}>
                              {msg.subject || "(sem assunto)"}
                            </div>
                            <div style={{ color: "#a3a3a3", fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {msg.snippet}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {emailSubView === "read" && selectedEmail && (
                  <div className="panel-card" style={{ background: "#050505", border: "1px solid #222" }}>
                    <button
                      type="button"
                      onClick={() => setEmailSubView("list")}
                      style={{ background: "#222", color: "#ccc", border: "none", borderRadius: "4px", padding: "4px 8px", fontSize: "11px", marginBottom: "8px", cursor: "pointer" }}
                    >
                      ← Voltar à lista
                    </button>
                    <div style={{ marginBottom: "6px" }}>
                      <small style={{ color: "#8d8d8d", display: "block" }}>De: {selectedEmail.from}</small>
                      <small style={{ color: "#8d8d8d", display: "block" }}>Data: {selectedEmail.date}</small>
                    </div>
                    <h4 style={{ color: "#fff", margin: "8px 0", fontSize: "14px" }}>{selectedEmail.subject}</h4>
                    <hr style={{ borderColor: "#222", margin: "8px 0" }} />
                    <pre style={{
                      color: "#d4d4d4", fontSize: "12px", fontFamily: "sans-serif",
                      whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: "250px", overflowY: "auto"
                    }}>
                      {selectedEmail.body || selectedEmail.snippet}
                    </pre>
                  </div>
                )}

                {emailSubView === "draft" && (
                  <div className="panel-card">
                    <form onSubmit={handleCreateDraft}>
                      <div style={{ marginBottom: "8px" }}>
                        <label style={{ fontSize: "11px", color: "#8d8d8d", display: "block", marginBottom: "2px" }}>Para:</label>
                        <input
                          type="email"
                          required
                          value={draftTo}
                          onChange={(e) => setDraftTo(e.target.value)}
                          placeholder="destinatario@exemplo.com"
                          style={{ width: "100%", background: "#050505", border: "1px solid #282828", borderRadius: "4px", padding: "6px", color: "#fff", fontSize: "12px" }}
                        />
                      </div>
                      <div style={{ marginBottom: "8px" }}>
                        <label style={{ fontSize: "11px", color: "#8d8d8d", display: "block", marginBottom: "2px" }}>Assunto:</label>
                        <input
                          type="text"
                          required
                          value={draftSubject}
                          onChange={(e) => setDraftSubject(e.target.value)}
                          placeholder="Assunto do e-mail"
                          style={{ width: "100%", background: "#050505", border: "1px solid #282828", borderRadius: "4px", padding: "6px", color: "#fff", fontSize: "12px" }}
                        />
                      </div>
                      <div style={{ marginBottom: "10px" }}>
                        <label style={{ fontSize: "11px", color: "#8d8d8d", display: "block", marginBottom: "2px" }}>Mensagem:</label>
                        <textarea
                          rows={4}
                          required
                          value={draftBody}
                          onChange={(e) => setDraftBody(e.target.value)}
                          placeholder="Digite a mensagem..."
                          style={{ width: "100%", background: "#050505", border: "1px solid #282828", borderRadius: "4px", padding: "6px", color: "#fff", fontSize: "12px", resize: "vertical" }}
                        />
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="submit"
                          style={{ flex: 1, background: "#333", color: "#fff", border: "none", borderRadius: "4px", padding: "8px", fontSize: "12px", cursor: "pointer" }}
                        >
                          Salvar Rascunho
                        </button>
                        <button
                          type="button"
                          onClick={handleSendDraftClick}
                          style={{ flex: 1, background: "var(--red)", color: "#000", fontWeight: "bold", border: "none", borderRadius: "4px", padding: "8px", fontSize: "12px", cursor: "pointer" }}
                        >
                          Enviar E-mail (2 cliques)
                        </button>
                      </div>
                    </form>
                    {draftStatus && (
                      <p style={{ marginTop: "8px", fontSize: "11px", color: "#60a5fa" }}>{draftStatus}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {showConfirmModal && (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999
          }}>
            <div style={{ background: "#111", border: "1px solid #333", borderRadius: "8px", padding: "16px", maxWidth: "320px", width: "90%" }}>
              <h4 style={{ margin: "0 0 8px 0", color: "#fff", fontSize: "14px" }}>Confirmar envio para {draftTo}?</h4>
              <p style={{ color: "#a3a3a3", fontSize: "12px", margin: "0 0 16px 0" }}>
                Assunto: {draftSubject || "(sem assunto)"}<br />
                Esta ação enviará o e-mail imediatamente via Gmail API.
              </p>
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  disabled={sending}
                  style={{ background: "#222", color: "#ccc", border: "none", borderRadius: "4px", padding: "6px 12px", fontSize: "12px", cursor: "pointer" }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmSend}
                  disabled={sending}
                  style={{ background: "var(--red)", color: "#000", fontWeight: "bold", border: "none", borderRadius: "4px", padding: "6px 12px", fontSize: "12px", cursor: "pointer" }}
                >
                  {sending ? "Enviando..." : "Confirmar Envio"}
                </button>
              </div>
            </div>
          </div>
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

                <p style={{ color: "#666", fontSize: "10px", marginTop: "10px", marginBottom: "0" }}>
                  Binários permitidos: ls, cat, grep, find, head, tail, wc, echo, node, python3, git, npm, df, du.
                </p>
              </div>
            )}
          </div>
        )}

        {view === "history" && (
          <div className="drawer-list panel">
            <button type="button" className="drawer-item" onClick={() => setView("menu")}>
              <IconClose className="di-icon" />
              <span className="di-text"><span className="di-title">Voltar ao menu</span></span>
            </button>
            <p className="panel-title">HISTÓRICO</p>
            {!logged ? (
              <p className="panel-msg">Faça login para ver suas conversas salvas.</p>
            ) : convs.length === 0 ? (
              <p className="panel-msg">Nenhuma conversa salva ainda.</p>
            ) : (
              convs.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="drawer-item"
                  onClick={() => { onOpenConv?.(c.id); onClose(); }}
                >
                  <IconChat className="di-icon" />
                  <span className="di-text">
                    <span className="di-title">{c.titulo || "Conversa sem título"}</span>
                    <small>{new Date(c.updated_at).toLocaleDateString("pt-BR")}</small>
                  </span>
                </button>
              ))
            )}
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
              <p className="panel-date">27 DE OUTUBRO DE 2026</p>
              <div className="panel-head"><b>Central de Integrações e Terminal Real</b></div>
              <p>Estado real de cada serviço (agente, IA, web, terminal, e-mail, banco) com verificação ao vivo.</p>
              <p>Terminal seguro Codex disponível para executar comandos reais no container.</p>
            </div>
          </div>
        )}

        {view === "prompts" && (
          <div className="drawer-list panel">
            <button type="button" className="drawer-item" onClick={() => setView("menu")}>
              <IconClose className="di-icon" />
              <span className="di-text"><span className="di-title">Voltar</span></span>
            </button>
            <p className="panel-title">PROMPTS ÚTEIS</p>
            <div className="panel-card">
              <p>Quanto mais contexto você der, melhores serão as respostas.</p>
              <button className="prompt-btn" onClick={() => { draftFill("Explique como se eu tivesse 10 anos: "); onClose(); }}>Explique como se eu tivesse 10 anos: …</button>
              <button className="prompt-btn" onClick={() => { draftFill("Revisar e melhorar este texto: "); onClose(); }}>Revisar e melhorar este texto: …</button>
              <button className="prompt-btn" onClick={() => { draftFill("Resuma em tópicos, em português claro: "); onClose(); }}>Resuma em tópicos: …</button>
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
