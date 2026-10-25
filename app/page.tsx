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
  const [models, setModels] = useState<string[]>(MODELS_DEFAULT);
  const [model, setModel] = useState<string>(MODELS_DEFAULT[0]);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 5000);
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
        setMsgs((m) => [
          ...m,
          { role: "assistant", content: `> ERRO: ${data?.error ?? `HTTP ${res.status}`}` },
        ]);
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
    areaRef.current?.scrollTo({ top: areaRef.current.scrollHeight, behavior: "smooth" });
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

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-head">
          <button className="btn btn-primary btn-full" onClick={newChat}>+ NOVO CHAT</button>
        </div>
        <div className="conv-list">
          {logged && convs.length === 0 && (
            <div style={{ color: "var(--text-faint)", fontSize: 12, padding: "0 10px" }}>
              // sem conversas ainda
            </div>
          )}
          {!logged && (
            <div style={{ color: "var(--text-faint)", fontSize: 12, padding: "0 10px" }}>
              // modo anônimo: histórico não é salvo.
              <br />
              // faça login para guardar suas conversas.
            </div>
          )}
          {convs.map((c) => (
            <div
              key={c.id}
              className={`conv-item ${activeConv === c.id ? "active" : ""}`}
              onClick={() => openConv(c.id)}
              title={c.title}
            >
              <span className="conv-marker">▸</span>
              <span className="conv-title">{c.title}</span>
              <button
                className="conv-del"
                title="Apagar"
                onClick={(e) => { e.stopPropagation(); deleteConv(c.id); }}
              >✕</button>
            </div>
          ))}
        </div>
        <div className="sidebar-foot">
          <div style={{ display: "flex", gap: 8 }}>
            {logged ? (
              <button className="btn btn-ghost btn-full" onClick={logout}>SAIR</button>
            ) : (
              <a className="btn btn-full" href="/login" style={{ textAlign: "center" }}>ENTRAR</a>
            )}
          </div>
          <div>SKYHUB v1.0 // servidores próprios</div>
        </div>
      </aside>

      <div className="main-col">
        <header className="header">
          <div className="logo">
            SKYHUB<span className="cursor-blink" />
          </div>
          <div className="header-status">
            <span className="dot-online" /> ONLINE
            <select
              className="model-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              aria-label="Modelo"
            >
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            {!logged && <a href="/login">entrar</a>}
          </div>
        </header>

        <div className="chat-area" ref={areaRef}>
          <div className="chat-inner">
            {msgs.length === 0 ? (
              <div className="welcome">
                <h1>SKY<span>HUB</span></h1>
                <p>Chat de IA com servidor próprio. Sem espelho, sem simulação: tudo aqui é real.</p>
                <span className="tag">{logged ? "conta ativa — histórico salvo" : "modo anônimo — 20 msgs/hora"}</span>
                <div className="chips">
                  <button className="chip" onClick={() => send("Me explique o que é o SKYHUB e como ele funciona.")}>▸ o que é o SKYHUB?</button>
                  <button className="chip" onClick={() => send("Escreva um haicai sobre terminais vermelhos.")}>▸ escreva um haicai</button>
                  <button className="chip" onClick={() => send("Me dê 3 ideias de projetos para aprender programação.")}>▸ ideias de projeto</button>
                </div>
                {!ready && <p style={{ marginTop: 30, color: "var(--text-faint)" }}>carregando terminal…</p>}
              </div>
            ) : (
              msgs.map((m, i) => (
                <div key={i} className={`msg ${m.role === "user" ? "msg-user" : "msg-ai"}`}>
                  <div className="msg-head">{m.role === "user" ? "você ▸" : "sky ▸"}</div>
                  <div className="msg-body">{m.content}</div>
                </div>
              ))
            )}
            {busy && (
              <div className="msg msg-ai">
                <div className="msg-head">sky ▸</div>
                <div className="msg-body typing-caret">processando</div>
              </div>
            )}
          </div>
        </div>

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
            />
            <button className="send-btn" onClick={() => send()} disabled={busy || !input.trim()}>
              ENVIAR
            </button>
          </div>
          <div className="composer-hint">
            <span>ENTER envia · SHIFT+ENTER quebra linha</span>
            <span>{logged ? "salvando no servidor" : "anônimo — não salvo"}</span>
          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
