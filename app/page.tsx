"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase, SessionLike } from "@/lib/client-auth";
import { api, streamChat, BASE } from "@/lib/api";

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
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [notifs, setNotifs] = useState<{ id: number; kind: string; title: string; body: string; read: boolean; created_at: string }[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 6000);
  }, []);

  // tema persistido
  useEffect(() => {
    if (window.localStorage.getItem("skynet-theme") === "theme-white") setTheme("theme-white");
  }, []);
  useEffect(() => {
    document.body.className = theme;
    window.localStorage.setItem("skynet-theme", theme);
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
    api("models")
      .then((d) => {
        if (d.ok && Array.isArray(d.models) && d.models.length) {
          setModels(d.models as string[]);
          setModel((d.models as string[])[0]);
        }
        if (typeof d.ai_configured === "boolean") setAiConfigured(d.ai_configured);
      })
      .catch(() => {});
  }, [supabase]);

  const loadConvs = useCallback(async () => {
    if (!session) { setConvs([]); return; }
    const data = await api("conversations", { token: session.access_token });
    if (data.ok && Array.isArray(data.conversations)) setConvs(data.conversations as Conv[]);
  }, [session]);

  // busca no histórico (debounce 300ms)
  useEffect(() => {
    if (!session || !search.trim()) return;
    const t = setTimeout(async () => {
      setSearching(true);
      const data = await api(`conversations?q=${encodeURIComponent(search.trim())}`, { token: session.access_token });
      if (data.ok && Array.isArray(data.conversations)) setConvs(data.conversations as Conv[]);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search, session]);

  useEffect(() => { loadConvs(); }, [loadConvs]);

  // notificações reais do sistema (carrega + tempo real)
  const loadNotifs = useCallback(async () => {
    if (!supabase || !session?.user?.id) { setNotifs([]); setNotifCount(0); return; }
    const { data } = await supabase
      .from("notifications")
      .select("id, kind, title, body, read, created_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (data) {
      setNotifs(data);
      setNotifCount(data.filter((n) => !n.read).length);
    }
  }, [supabase, session?.user?.id]);

  useEffect(() => { loadNotifs(); }, [loadNotifs]);

  useEffect(() => {
    if (!supabase || !session?.user?.id) return;
    const channel = supabase
      .channel(`notifs-${session.user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${session.user.id}` },
        (payload) => {
          const n = payload.new as { id: number; kind: string; title: string; body: string; read: boolean; created_at: string };
          setNotifs((cur) => [n, ...cur].slice(0, 30));
          setNotifCount((c) => c + 1);
          showToast(`🔔 ${n.title}`);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, session?.user?.id]);

  async function markAllRead() {
    if (!supabase || !session?.user?.id) return;
    const unread = notifs.filter((n) => !n.read).map((n) => n.id);
    if (!unread.length) return;
    await supabase.from("notifications").update({ read: true }).in("id", unread);
    setNotifs((cur) => cur.map((n) => ({ ...n, read: true })));
    setNotifCount(0);
  }

  // sincronização em tempo real entre dispositivos (Supabase Realtime)
  useEffect(() => {
    if (!supabase || !session?.user?.id) return;
    const channel = supabase
      .channel(`convs-${session.user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `user_id=eq.${session.user.id}` },
        () => loadConvs(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, session?.user?.id, loadConvs]);

  const openConv = useCallback(async (id: string) => {
    if (!session) return;
    const data = await api(`conversations?id=${id}`, { token: session.access_token });
    if (data.ok && Array.isArray(data.messages)) {
      setActiveConv(id);
      setMsgs(data.messages as Msg[]);
      setDrawerView("history");
      if (window.innerWidth < 860) setDrawerOpen(false);
    } else {
      showToast("Não foi possível abrir a conversa.");
    }
  }, [session, showToast]);

  async function deleteConv(id: string) {
    if (!session) return;
    await api(`conversations?id=${id}`, { method: "DELETE", token: session.access_token });
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
    setMsgs((m) => [...m, { role: "assistant", content: "" }]);
    setBusy(true);
    await streamChat(
      { conversationId: activeConv, content, model },
      session?.access_token ?? null,
      {
        onDelta: (delta) => setMsgs((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + delta };
          return copy;
        }),
        onDone: (info) => {
          if (info.conversationId && info.conversationId !== activeConv) setActiveConv(info.conversationId);
          loadConvs();
        },
        onError: (message) => {
          setMsgs((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last && last.role === "assistant" && last.content === "") copy.pop();
            else copy[copy.length - 1] = { ...last, content: `> ${message}` };
            return copy;
          });
          showToast(message);
        },
      },
    );
    setBusy(false);
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
          <a className="brand" href={`${BASE}/`}>SKY<span className="brand-red">NET</span></a>
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
              {soon("Monetize com SKYNET", "Novo")}
              {soon("Imagens", "Gere e explore imagens com IA")}
              {soon("Conversas em grupo", "Colabore com múltiplos agentes")}
              {soon("Codex", "Código, scripts e automação")}
              {soon("Projetos", "Organize tarefas e entregas")}

              <div className="nav-sep" />

              <button
                className="nav-item"
                onClick={() => {
                  if (!logged) { showToast("Entre para ver seu histórico."); window.location.href = `${BASE}/login/`; return; }
                  setDrawerView("history");
                }}
              >
                <span className="nav-ico">☰</span>
                <span className="nav-label">Histórico de conversas<br /><span className="nav-sub">Revise chats anteriores</span></span>
                {logged && <span className="badge badge-new">{convs.length}</span>}
              </button>

              <a className="nav-item" href={`${BASE}/about/`}>
                <span className="nav-ico">◎</span>
                <span className="nav-label">Conheça o SKYNET<br /><span className="nav-sub">Descubra como funciona o projeto</span></span>
              </a>

              {logged ? (
                <>
                  <a className="nav-item" href={`${BASE}/account/`}>
                    <span className="nav-ico">◉</span>
                    <span className="nav-label">Conta e perfil<br /><span className="nav-sub">E-mail, senha e sessão</span></span>
                  </a>
                  <a className="nav-item" href={`${BASE}/settings/`}>
                    <span className="nav-ico">⚙</span>
                    <span className="nav-label">Configurações<br /><span className="nav-sub">Tema, modelo e notificações</span></span>
                  </a>
                </>
              ) : (
                <a className="nav-item" href={`${BASE}/login/`}>
                  <span className="nav-ico">◉</span>
                  <span className="nav-label">Conta e perfil<br /><span className="nav-sub">Entre para acessar</span></span>
                </a>
              )}
              <a className="nav-item" href="mailto:suporte@skynet.app?subject=Suporte%20SKYNET">
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
              <input
                className="conv-search"
                type="search"
                placeholder="buscar em conversas…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); if (!e.target.value.trim()) loadConvs(); }}
                aria-label="Buscar no histórico"
              />
              {searching && <div className="conv-empty">// buscando…</div>}
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
          <a href={`${BASE}/terms/`}>Termos de Serviço</a>
          <span>SKYNET v1.0 — código próprio</span>
        </div>
      </aside>

      <div className="main-col">
        <header className="header">
          <div className="header-left">
            {!drawerOpen && (
              <button className="drawer-open-btn" onClick={() => setDrawerOpen(true)} aria-label="Abrir menu">☰</button>
            )}
            <span className="model-chip">
              <span className="dot" style={aiConfigured === false ? { background: "var(--red)", boxShadow: "0 0 6px var(--red)" } : undefined} />
              <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Modelo de IA">
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </span>
          </div>
          <div className="header-right">
            {logged && (
              <div className="notif-wrap">
                <button className="btn-bell" onClick={() => { setNotifOpen(!notifOpen); if (!notifOpen) markAllRead(); }} aria-label="Notificações">
                  ◉{notifCount > 0 && <span className="notif-badge">{notifCount}</span>}
                </button>
                {notifOpen && (
                  <div className="notif-panel">
                    <div className="notif-head">⌁ NOTIFICAÇÕES</div>
                    {notifs.length === 0 ? (
                      <div className="notif-empty">// nenhuma notificação</div>
                    ) : notifs.map((n) => (
                      <div key={n.id} className={"notif-item" + (n.read ? "" : " unread")}>
                        <div className="notif-title">{n.read ? "" : "● "}{n.title}</div>
                        <div className="notif-body">{n.body}</div>
                        <div className="notif-time">{new Date(n.created_at).toLocaleString("pt-BR")}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <span className="header-status">
              {aiConfigured === false
                ? "IA não configurada"
                : logged ? "conta ativa" : "modo anônimo"}
            </span>
            {logged ? (
              <button className="btn-ghost" onClick={logout}>SAIR</button>
            ) : (
              <a className="btn-login" href={`${BASE}/login/`}>Fazer login</a>
            )}
          </div>
        </header>

        <div className="content">
          {!inChat ? (
            <div className="hero">
              <div className="hero-kicker">SKYNET // ONLINE</div>
              <h1>Apresentamos o SKY<span>NET</span></h1>
              <p className="hero-sub">
                Sua inteligência artificial com servidor, conta e histórico de verdade.
                Sem espelho, sem simulação — tudo aqui é real.
              </p>
              {aiConfigured === false && (
                <p className="hero-sub" style={{ color: "var(--red)" }}>
                  ⚠ O provedor de IA ainda não tem chave configurada. Contas, histórico e
                  telas já funcionam; o chat responderá assim que a chave for definida.
                </p>
              )}
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
                    <div className="msg-role">{m.role === "user" ? "você" : "skynet"}</div>
                    <div className="msg-body">{m.content}</div>
                  </div>
                ))}
                {busy && (!msgs.length || msgs[msgs.length - 1].content === "") && (
                  <div className="msg msg-ai">
                    <div className="msg-role">skynet</div>
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
