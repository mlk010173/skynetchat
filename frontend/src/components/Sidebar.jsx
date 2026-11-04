import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  IconBell, IconBook, IconChat, IconClose, IconCode, IconEdit, IconFolder,
  IconGift, IconGlobe, IconHistory, IconImage, IconInstagram, IconLife, IconMail, IconMoney,
  IconPlug, IconTheme, IconUser, IconUsers, IconZap,
} from "./Icons.jsx";
import { api, getSession } from "../lib.js";
import AutomationsPanel from "./AutomationsPanel.jsx";
import MemoriaPanel from "./MemoriaPanel.jsx";

const GRUPOS = [
  { titulo: "Conversa", itens: ["Novo chat", "Histórico de conversas", "Imagens"] },
  { titulo: "Ferramentas", itens: ["Codex", "Integrações", "Automações", "E-mail", "Memória", "Projetos"] },
  { titulo: "Crescer", itens: ["Indique e Ganhe", "Monetize com SKYNETchat", "Conversas em grupo"] },
  { titulo: "Descobrir", itens: ["Conheça o SKYNETchat", "Prompts", "Suporte", "Atualizações"] },
];

const items = [
  { label: "Novo chat", desc: "Inicie uma conversa do zero", icon: IconEdit },
  { label: "Indique e Ganhe", desc: "Convide amigos e ganhe assinatura PRO", icon: IconGift },
  { label: "Monetize com SKYNETchat", tag: "NOVO", icon: IconMoney },
  { label: "Atualizações", desc: "Veja as novidades e melhorias recentes", icon: IconBell },
  { label: "Imagens", tag: "BETA", desc: "Gere e explore imagens com IA", icon: IconImage },
  { label: "Conversas em grupo", tag: "NOVO", desc: "Colabore com múltiplos agentes", icon: IconUsers },
  { label: "Codex", tag: "NOVO", desc: "Terminal real e seguro", icon: IconCode },
  { label: "Integrações", tag: "REAL", desc: "Central de integrações e estado ao vivo", icon: IconPlug },
  { label: "Automações", tag: "REAL", desc: "Central de automações e agendamentos", icon: IconZap },
  { label: "E-mail", tag: "REAL", desc: "Painel de E-mail via Gmail API", icon: IconMail },
  { label: "Memória", tag: "REAL", desc: "Painel de Memória de Longo Prazo", icon: IconBook },

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
  const [busca, setBusca] = useState("");
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

  const abrirItem = (label) => {
    onSelect(label);
    if (label === "Histórico de conversas") setView("history");
    else if (label === "Novo chat") onClose();
    else if (label === "Atualizações") setView("updates");
    else if (label === "Prompts") setView("prompts");
    else if (label === "Suporte") setView("support");
    else if (label === "Conheça o SKYNETchat") setView("about");
    else if (label === "Codex") setView("terminal");
    else if (label === "Integrações") { navigate("/integracoes"); onClose(); }
    else if (label === "Automações") setView("automations");
    else if (label === "E-mail") setView("email");
    else if (label === "Memória") setView("memoria");
    else if (label !== "Fazer login") soon(label);
  };

  const soon = (label) => {
    say(`"${label}" ainda não existe nesta versão. O que já funciona: chat com IA real, histórico, prompts, atualizações, Terminal Codex, Integrações e Automações.`);
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
          <>
          <div className="dl-busca-wrap">
            <input
              className="dl-busca"
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar função…"
              aria-label="Buscar função no menu"
            />
          </div>

          <nav className="drawer-list">
            <button
              type="button"
              className="dl-cta"
              onClick={() => { onSelect("Novo chat"); onClose(); }}
            >
              <IconEdit width={18} height={18} />
              <span>Novo chat</span>
              <kbd>N</kbd>
            </button>

            {GRUPOS.map((grupo) => {
              const visiveis = grupo.itens
                .map((label) => items.find((i) => i.label === label))
                .filter(Boolean)
                .filter(({ label, desc }) => {
                  const q = busca.trim().toLowerCase();
                  if (!q) return true;
                  return `${label} ${desc || ""}`.toLowerCase().includes(q);
                });
              if (!visiveis.length) return null;
              return (
                <div className="dl-grupo-bloco" key={grupo.titulo}>
                  <p className="dl-grupo">{grupo.titulo}</p>
                  {visiveis.map(({ label, desc, tag, icon: Icon }) => (
                    <button
                      key={label}
                      type="button"
                      className={`drawer-item ${active === label ? "active" : ""}`}
                      onClick={() => abrirItem(label)}
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
                </div>
              );
            })}

            {busca.trim() && !items.some(({ label, desc }) => `${label} ${desc || ""}`.toLowerCase().includes(busca.trim().toLowerCase())) && (
              <p className="dl-vazio">Nada com “{busca.trim()}”. Tente imagem, codex, e-mail…</p>
            )}
          </nav>
          </>
        )}

                {view === "memoria" && (
          <div className="drawer-list panel">
            <button type="button" className="drawer-item" onClick={() => setView("menu")}>
              <IconClose className="di-icon" />
              <span className="di-text"><span className="di-title">Voltar ao menu</span></span>
            </button>
            <p className="panel-title">PAINEL DE MEMÓRIA</p>
            <MemoriaPanel logged={logged} />
          </div>
        )}

        {view === "automations" && (
          <div className="drawer-list panel">
            <button type="button" className="drawer-item" onClick={() => setView("menu")}>
              <IconClose className="di-icon" />
              <span className="di-text"><span className="di-title">Voltar ao menu</span></span>
            </button>
            <p className="panel-title">CENTRAL DE AUTOMAÇÕES</p>
            <AutomationsPanel logged={logged} />
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
                      }}
                    >
                      {termOutput}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {view === "email" && (
          <div className="drawer-list panel">
            <button type="button" className="drawer-item" onClick={() => setView("menu")}>
              <IconClose className="di-icon" />
              <span className="di-text"><span className="di-title">Voltar ao menu</span></span>
            </button>
            <p className="panel-title">E-MAIL (GMAIL API)</p>

            {!logged ? (
              <div className="panel-card">
                <p style={{ color: "#a3a3a3", fontSize: "13px", margin: 0 }}>
                  Requer login para acessar o Painel de E-mail.
                </p>
              </div>
            ) : emailStateMsg === "pendente_configuracao" ? (
              <div className="panel-card">
                <p style={{ color: "#f59e0b", fontSize: "13px", margin: 0 }}>
                  Integração pendente de configuração (aguarda token GMAIL_ACCESS_TOKEN).
                </p>
              </div>
            ) : emailStateMsg === "token_expirado" ? (
              <div className="panel-card">
                <p style={{ color: "#ef4444", fontSize: "13px", margin: 0 }}>
                  Token do Gmail expirado ou inválido. Por favor, reautorize a integração.
                </p>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setEmailSubView("list")}
                    style={{
                      flex: 1,
                      background: emailSubView === "list" ? "var(--red)" : "#181818",
                      color: emailSubView === "list" ? "#000" : "#ccc",
                      border: "none",
                      borderRadius: "6px",
                      padding: "6px",
                      fontSize: "12px",
                      fontWeight: "bold",
                      cursor: "pointer"
                    }}
                  >
                    Entrada
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEmailSubView("draft"); setDraftStatus(""); }}
                    style={{
                      flex: 1,
                      background: emailSubView === "draft" ? "var(--red)" : "#181818",
                      color: emailSubView === "draft" ? "#000" : "#ccc",
                      border: "none",
                      borderRadius: "6px",
                      padding: "6px",
                      fontSize: "12px",
                      fontWeight: "bold",
                      cursor: "pointer"
                    }}
                  >
                    Novo Rascunho
                  </button>
                </div>

                {emailSubView === "list" && (
                  <div>
                    <form onSubmit={(e) => { e.preventDefault(); loadEmails(emailSearch); }} style={{ marginBottom: "10px" }}>
                      <input
                        type="text"
                        value={emailSearch}
                        onChange={(e) => setEmailSearch(e.target.value)}
                        placeholder="Buscar por termo ou from:..."
                        style={{
                          width: "100%",
                          background: "#050505",
                          border: "1px solid #282828",
                          borderRadius: "6px",
                          padding: "6px 8px",
                          color: "#fff",
                          fontSize: "12px",
                          boxSizing: "border-box"
                        }}
                      />
                    </form>

                    {emailLoading ? (
                      <p style={{ color: "#8d8d8d", fontSize: "12px" }}>Carregando e-mails...</p>
                    ) : emailList.length === 0 ? (
                      <p style={{ color: "#8d8d8d", fontSize: "12px" }}>Nenhum e-mail encontrado.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {emailList.map((m) => (
                          <div
                            key={m.id}
                            onClick={() => readEmail(m.id)}
                            style={{
                              background: "#0d0d0d",
                              border: "1px solid #222",
                              borderRadius: "6px",
                              padding: "8px 10px",
                              cursor: "pointer"
                            }}
                          >
                            <div style={{ fontSize: "12px", fontWeight: "bold", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {m.from || "(Sem remetente)"}
                            </div>
                            <div style={{ fontSize: "12px", color: "#e5e5e5", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {m.subject || "(Sem assunto)"}
                            </div>
                            <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>
                              {m.date || ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {emailSubView === "read" && selectedEmail && (
                  <div className="panel-card">
                    <button
                      type="button"
                      onClick={() => setEmailSubView("list")}
                      style={{ background: "none", border: "none", color: "var(--red)", fontSize: "12px", cursor: "pointer", padding: 0, marginBottom: "8px" }}
                    >
                      ← Voltar à lista
                    </button>
                    <b style={{ color: "#fff", display: "block", fontSize: "13px", marginBottom: "4px" }}>{selectedEmail.subject}</b>
                    <p style={{ fontSize: "11px", color: "#8d8d8d", margin: "0 0 8px 0" }}>De: {selectedEmail.from}</p>
                    <p style={{ fontSize: "10px", color: "#666", margin: "0 0 12px 0" }}>Data: {selectedEmail.date}</p>
                    <pre style={{ background: "#050505", padding: "8px", borderRadius: "6px", border: "1px solid #222", color: "#ddd", fontSize: "11px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {selectedEmail.body || "(Corpo sem texto simples)"}
                    </pre>
                  </div>
                )}

                {emailSubView === "draft" && (
                  <div className="panel-card">
                    <form onSubmit={handleCreateDraft} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div>
                        <label style={{ fontSize: "11px", color: "#8d8d8d", display: "block", marginBottom: "2px" }}>Para:</label>
                        <input
                          type="email"
                          value={draftTo}
                          onChange={(e) => setDraftTo(e.target.value)}
                          placeholder="destinatario@exemplo.com"
                          required
                          style={{ width: "100%", background: "#050505", border: "1px solid #282828", borderRadius: "6px", padding: "6px", color: "#fff", fontSize: "12px", boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: "11px", color: "#8d8d8d", display: "block", marginBottom: "2px" }}>Assunto:</label>
                        <input
                          type="text"
                          value={draftSubject}
                          onChange={(e) => setDraftSubject(e.target.value)}
                          placeholder="Assunto do e-mail"
                          style={{ width: "100%", background: "#050505", border: "1px solid #282828", borderRadius: "6px", padding: "6px", color: "#fff", fontSize: "12px", boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: "11px", color: "#8d8d8d", display: "block", marginBottom: "2px" }}>Mensagem:</label>
                        <textarea
                          value={draftBody}
                          onChange={(e) => setDraftBody(e.target.value)}
                          placeholder="Conteúdo da mensagem..."
                          rows={4}
                          style={{ width: "100%", background: "#050505", border: "1px solid #282828", borderRadius: "6px", padding: "6px", color: "#fff", fontSize: "12px", boxSizing: "border-box", resize: "vertical" }}
                        />
                      </div>

                      <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                        <button
                          type="submit"
                          style={{ flex: 1, background: "#222", color: "#fff", border: "1px solid #444", borderRadius: "6px", padding: "6px", fontSize: "12px", cursor: "pointer" }}
                        >
                          Salvar Rascunho
                        </button>
                        <button
                          type="button"
                          onClick={handleSendDraftClick}
                          style={{ flex: 1, background: "var(--red)", color: "#000", fontWeight: "bold", border: "none", borderRadius: "6px", padding: "6px", fontSize: "12px", cursor: "pointer" }}
                        >
                          Enviar
                        </button>
                      </div>
                    </form>

                    {draftStatus && (
                      <p style={{ fontSize: "11px", color: "#a3e635", marginTop: "8px", margin: "8px 0 0 0" }}>
                        {draftStatus}
                      </p>
                    )}
                  </div>
                )}
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
              <div className="panel-head"><b>Central de Automações e Integrações</b></div>
              <p>Automações persistentes agendadas via pg_cron e Edge Functions no banco de dados.</p>
              <p>Estado real de cada serviço com verificação ao vivo.</p>
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
              <p className="account-line">Conta ativa · código ou e-mail e senha</p>
              <Link to="/account" className="drawer-item plain" onClick={onClose}>
                <IconUser className="di-icon" />
                <span className="di-title">Acessar perfil</span>
              </Link>
              <Link to="/dashboard" className="drawer-item plain" onClick={onClose}>
                <IconGlobe className="di-icon" />
                <span className="di-title">Meu painel</span>
              </Link>
              <Link to="/widgets" className="drawer-item plain" onClick={onClose}>
                <IconZap className="di-icon" />
                <span className="di-title">Widgets</span>
              </Link>
              <button type="button" className="drawer-item plain" onClick={() => { onClose(); onLogout(); }}>
                <IconClose className="di-icon" />
                <span className="di-title">Sair da conta</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/widgets" className="drawer-item plain" onClick={onClose}>
                <IconZap className="di-icon" />
                <span className="di-title">Widgets</span>
              </Link>
              <Link to="/login" className="drawer-item plain" onClick={onClose}>
                <IconUser className="di-icon" />
                <span className="di-title">Fazer login / Criar conta</span>
              </Link>
            </>
          )}
        </div>
      </aside>

      {showConfirmModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ background: "#111", border: "1px solid #333", borderRadius: "8px", padding: "16px", maxWidth: "360px", width: "100%", color: "#fff" }}>
            <b style={{ display: "block", fontSize: "14px", marginBottom: "8px" }}>Confirmar envio de e-mail</b>
            <p style={{ fontSize: "12px", color: "#ccc", margin: "0 0 12px 0" }}>
              Deseja realmente enviar o e-mail para <b>{draftTo}</b> com o assunto "<b>{draftSubject || "(Sem assunto)"}</b>"?
            </p>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={sending}
                style={{ background: "#222", border: "1px solid #444", color: "#fff", borderRadius: "6px", padding: "6px 12px", fontSize: "12px", cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmSend}
                disabled={sending}
                style={{ background: "var(--red)", border: "none", color: "#000", fontWeight: "bold", borderRadius: "6px", padding: "6px 12px", fontSize: "12px", cursor: "pointer" }}
              >
                {sending ? "Enviando..." : "Confirmar e Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
