"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase, SessionLike } from "@/lib/client-auth";

interface Conv { id: string; title: string; updated_at: string }
interface Msg { role: "user" | "assistant"; content: string }

const MODELS_DEFAULT = ["gpt-4o-mini", "gpt-4o"];

export default function ChatPage() {
  const supabase = getSupabase();
  const [session, setSession] = useState<SessionLike | null>(null);
  const [ready, setReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [drawerView, setDrawerView] = useState<"menu" | "history">("menu");
  const [theme, setTheme] = useState<"theme-black" | "theme-white">("theme-black");
  const [models, setModels] = useState<string[]>(MODELS_DEFAULT);
  const [model, setModel] = useState<string>(MODELS_DEFAULT[0]);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 5000);
  }, []);

  // tema persistido
  useEffect(() => {
    const saved = window.localStorage.getItem("skyhub-theme");
    if (saved === "theme-white") setTheme("theme-white");
  }, []);
  useEffect(() => {
    document.body.className = theme;
    window.localStorage.setItem("skyhub-theme", theme);
  }, [theme]);

  // mobile: drawer começa fechado
  useEffect(() => {
    if (window.innerWidth < 860) setDrawerOpen(false);
  }, []);

  // auth + modelos
  useEffect(() => {
    (async () => {
      if (!supabase) { setReady(true); return; }
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      supabase.auth.onAuthStateChange((_e, s) => setSession(s));
      setReady(true);
    })();
    fetch("/api/models")
      .then((r) => r.json())
      .then((d) => { if (d.models?.length) { setModels(d.models); setModel(d.models[0]); } })
      .catch(() => {});
  }, [supabase]);

  const loadConvs = useCallback(async () => {
    if (!supabase || !session) { setConvs([]); return; }
    const res = await fetch("/api/conversations", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json().catch(() => null);
    if (data?.ok) setConvs(data.conversations);
  }, [supabase, session]);

  useEffect(() => { loadConvs(); }, [loadConvs]);

  const openConv = useCallback(async (id: string) => {
    if (!supabase || !session) return;
    const res = await fetch(`/api/conversations/${id}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json().catch(() => null);
    if (data?.ok) {
      setActiveConv(id);
      setMsgs(data.messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })));
      setDrawerView("history");
      if (window.innerWidth < 860) setDrawerOpen(false);
    } else {
      showToast("Não foi possível abrir a conversa.");
    }
  }, [supabase, session, showToast]);

  async function deleteConv(id: string) {
    if (!supabase || !session) return;
    await fetch(`/api/conversations/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    setConvs((c) => c.filter((x) => x.id !== id));
    if (activeConv === id) { setActiveConv(null); setMsgs([]); }
  }

  function newChat() {
    setActiveConv(null);
    setMsgs([]);
    setDrawerView("menu");
    if (window.innerWidth < 860) setDrawerOpen(false);
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", content }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ conversationId: activeConv, content, model }),
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) {
        setMsgs((m) => [...m, { role: "assistant", content: `> ERRO: ${data?.error ?? `HTTP ${res.status}`}` }]);
        showToast(data?.error ?? "Falha na chamada do servidor.");
        return;
      }
      setMsgs((m) => [...m, { role: "assistant", content: data.reply }]);
      if (data.conversationId && data.conversationId !== activeConv) setActiveConv(data.conversationId);
      if (session) loadConvs();
    } catch {
      showToast("Sem conexão com o servidor.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  async function logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setConvs([]);
    setActiveConv(null);
    setMsgs([]);
    showToast("Sessão encerrada.");
  }

  const logged = !!session;
  const inChat = msgs.length > 0 || activeConv !== null;

  const soon = (label: string, sub: string) => (
    <button
      className="nav-item"
      title="Em breve"
      onClick={() => showToast(`"${label}" está em construção. Não é simulação: simplesmente ainda não existe. 😉`)}
    >
      <span className="nav-ico">✦</span>
      <span className="nav-label">
        {label}
        <br /><span className="nav-sub">{sub}</span>
      </span>
      <span className="badge badge-soon">EM BREVE</span>
    </button>
  );

  return (
    <div className="shell">
      <aside className={`drawer ${drawerOpen ? "" : "collapsed"}`} aria-label="Menu">
        <div className="drawer-head">
          <a className="brand" href="/">SKY<span className="brand-red">HUB</span></a>
          <button className="icon-btn" onClick={() => setDrawerOpen(false)} aria-label="Fechar menu">✕</button>
        </div>

        <nav className="drawer-nav">
          {drawerView === "menu" ? (
            <>
              <button className="nav-item" onClick={newChat}>
                <span className="nav-ico">✚</span>
                <span className="nav-label">Novo chat<br /><span className="nav-sub">Inicie uma conversa do zero</span></span>
              </button>

              <div className="nav-sep" />

              {soon("Indique e Ganhe", "Convide amigos e ganhe benefícios")}
              {soon("Monetize com SKYHUB", "Novo")}
              {soon("Imagens", "Gere e explore imagens com IA")}
              {soon("Conversas em grupo", "Colabore com múltiplos agentes")}
              {soon("Codex", "Código, scripts e automação")}
              {soon("Projetos", "Organize tarefas e entregas")}

              <div className="nav-sep" />

              <button
                className="nav-item"
                onClick={() => {
                  if (!logged) { showToast("Entre para ver seu histórico."); setDrawerOpen(false); window.location.href = "/login"; return; }
                  setDrawerView("history");
                }}
              >
                <span className="nav-ico">☰</span>
                <span className="nav-label">Histórico de conversas<br /><span className="nav-sub">Revise chats anteriores</span></span>
                {logged && <span className="badge badge-new">{convs.length}</span>}
              </button>

              <a className="nav-item" href="/about">
                <span className="nav-ico">◎</span>
                <span className="nav-label">Conheça o SKYHUB<br /><span className="nav-sub">Descubra como funciona o projeto</span></span>
              </a>

              <a className="nav-item" href="mailto:suporte@skyhub.app?subject=Suporte%20SKYHUB">
                <span className="nav-ico">✉</span>
                <span className="nav-label">Suporte<br /><span className="nav-sub">Tire dúvidas e fale com o suporte</span></span>
              </a>
            </>
          ) : (
            <>
              <button className="nav-item" onClick={() => setDrawerView("menu")}>
                <span className="nav-ico">←</span>
                <span className="nav-label">Voltar ao menu</span>
              </button>
              <div className="nav-title">Histórico</div>
              {!logged && <div className="conv-empty">// entre para salvar conversas</div>}
              {logged && convs.length === 0 && <div className="conv-empty">// nenhuma conversa ainda</div>}
              {convs.map((c) => (
                <button
                  key={c.id}
                  className={`conv-item ${activeConv === c.id ? "active" : ""}`}
                  onClick={() => openConv(c.id)}
                  title={c.title}
                >
                  <span style={{ color: "var(--red)" }}>▸</span>
                  <span className="conv-title">{c.title}</span>
                  <span className="conv-del" onClick={(e) => { e.stopPropagation(); deleteConv(c.id); }}>✕</span>
                </button>
              ))}
            </>
          )}
        </nav>

        <div className="drawer-foot">
          <div className="theme-row">
            <span>Tema de fundo</span>
            <button
              className="theme-toggle"
              onClick={() => setTheme(theme === "theme-black" ? "theme-white" : "theme-black")}
            >
              {theme === "theme-black" ? "BLACK" : "WHITE"}
            </button>
          </div>
          <a href="/terms">Termos de Serviço</a>
          <span>SKYHUB v1.0 — código próprio</span>
        </div>
      </aside>

      <div className="main-col">
        <header className="header">
          <div className="header-left">
            {!drawerOpen && (
              <button className="drawer-open-btn" onClick={() => setDrawerOpen(true)} aria-label="Abrir menu">☰</button>
            )}
            <span className="model-chip">
              <span className="dot" />
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                aria-label="Modelo de IA"
              >
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </span>
          </div>
          <div className="header-right">
            <span className="header-status">{logged ? "conta ativa" : "modo anônimo"}</span>
            {logged ? (
              <button className="btn-ghost" onClick={logout}>SAIR</button>
            ) : (
              <a className="btn-login" href="/login">Fazer login</a>
            )}
          </div>
        </header>

        <div className="content">
          {!inChat ? (
            <div className="hero">
              <div className="hero-kicker">SKYHUB // ONLINE</div>
              <h1>Apresentamos o SKY<span>HUB</span></h1>
              <p className="hero-sub">
                Sua inteligência artificial com servidor, conta e histórico de verdade.
                Sem espelho, sem simulação — tudo aqui é real.
              </p>
              <div className="chips">
                <button className="chip" onClick={() => send("Faça uma busca atualizada sobre as principais notícias de tecnologia desta semana.")}>Buscar na web</button>
                <button className="chip" onClick={() => send("Escreva uma função em JavaScript que valida CPF e me explique o código.")}>Programar</button>
                <button className="chip" onClick={() => send("Escreva um texto curto e criativo sobre terminais vermelhos.")}>Escrever</button>
                <button className="chip" onClick={() => send("Me dê 3 ideias de projetos para eu aprender IA.")}>Ideias de projeto</button>
              </div>
            </div>
          ) : (
            <div className="chat-scroll" ref={scrollRef}>
              <div className="chat-inner">
                {msgs.map((m, i) => (
                  <div key={i} className={`msg ${m.role === "assistant" ? "msg-ai" : "msg-user"}`}>
                    <div className="msg-role">{m.role === "user" ? "você" : "skyhub"}</div>
                    <div className="msg-body">{m.content}</div>
                  </div>
                ))}
                {busy && (
                  <div className="msg msg-ai">
                    <div className="msg-role">skyhub</div>
                    <div className="msg-body typing"><span>●</span><span>●</span><span>●</span></div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="composer-wrap">
            <div className="composer">
              <textarea
                placeholder="Pergunte o que quiser…"
                value={input}
                rows={1}
                maxLength={4000}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 180) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                aria-label="Mensagem"
              />
              <button className="send-btn" onClick={() => send()} disabled={busy || !input.trim()} aria-label="Enviar">➤</button>
            </div>
            <div className="composer-hint">
              <span>ENTER envia · SHIFT+ENTER quebra linha</span>
              <span>{logged ? "salvando no servidor" : "anônimo — 20 msgs/hora, sem histórico"}</span>
            </div>
            {!ready && <div className="composer-hint"><span>carregando…</span></div>}
          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
