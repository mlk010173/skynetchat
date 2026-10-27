import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { IconBell, IconBrain, IconChevron, IconCode, IconEdit, IconGlobe, IconImage, IconMenu, IconMic, IconPlus, IconTheme, IconWave } from "../components/Icons.jsx";
import Sidebar from "../components/Sidebar.jsx";

const PLACEHOLDERS = ["Pesquise sem censura...", "Pergunte sem medo.", "Vá além", "Sem filtros, sem limites."];
import { AGENT_URL, api, getSession, setModelList, streamChatAuto, supabase } from "../lib.js";
import { agentGet, askOnce, runTool } from "../lib.js";
import { ajudaComandos, parseCommand } from "../commands.js";
import { chatModels, labelFor } from "../models.js";

const actions = [
  { label: "Pesquisar", icon: IconGlobe, color: "#3b82f6" },
  { label: "Gerar Imagens", icon: IconImage, color: "#eab308" },
  { label: "Persuasão", icon: IconBrain, color: "#dc2626" },
  { label: "Programar", icon: IconCode, color: "#16a34a" },
];

function formatHora(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** Tela inicial: interface do skynetchat.net com backend real (Supabase). */
export default function Home() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("Novo chat");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [ph, setPh] = useState(0);
  const [logged, setLogged] = useState(false);
  const [model, setModel] = useState("");
  const [models, setModels] = useState([]);
  const [toast, setToast] = useState("");
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const [tools, setTools] = useState([]);
  const [modoPro, setModoPro] = useState(() => localStorage.getItem("skynet-modo") === "4.5pro");
  const [agenteAberto, setAgenteAberto] = useState(null); // "terminal" | "ferramentas" | null
  const [cmd, setCmd] = useState("");
  const [saida, setSaida] = useState([]);
  const [cmdBusy, setCmdBusy] = useState(false);
  const [imgPrompt, setImgPrompt] = useState(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [editIdx, setEditIdx] = useState(-1);
  const [editText, setEditText] = useState("");
  const [micSecs, setMicSecs] = useState(0);
  const micTimer = useRef(null);
  const micRef = useRef(null);
  const convIdRef = useRef(null);
  const stageRef = useRef(null);

  const say = useCallback((m) => { setToast(m); setTimeout(() => setToast(""), 5000); }, []);
  useEffect(() => { const t = setInterval(() => setPh((p) => (p + 1) % PLACEHOLDERS.length), 6000); return () => clearInterval(t); }, []);

  useEffect(() => { getSession().then((s) => setLogged(!!s)); }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setLogged(!!s?.user));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!logged) { setNotifs([]); setUnread(0); return; }
    let canal = null;
    (async () => {
      const s = await supabase.auth.getSession();
      if (!s.data?.session) return;
      const uid = s.data.session.user.id;
      const { data: rows } = await supabase.from("notifications").select("id, title, body, read, created_at").order("created_at", { ascending: false }).limit(20);
      if (rows) { setNotifs(rows); setUnread(rows.filter((n) => !n.read).length); }
      canal = supabase.channel("notif-" + uid).on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + uid },
        (payload) => { setNotifs((prev) => [payload.new, ...prev].slice(0, 20)); setUnread((n) => n + 1); }).subscribe();
    })();
    return () => { if (canal) supabase.removeChannel(canal); };
  }, [logged]);

  async function gerarImagem() {
    if (!imgPrompt || imgPrompt.trim().length < 3 || imgBusy) return;
    setImgBusy(true);
    setMessages((prev) => [...prev, { role: "user", text: "Criar imagem: " + imgPrompt.trim() }, { role: "assistant", text: "", image: null, imgBusy: true }]);
    setPlusOpen(false);
    try {
      const r = await fetch(`${AGENT_URL}/tools/imagem`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: imgPrompt.trim() }) });
      const d = await r.json();
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (d?.ok && d.data_url) copy[copy.length - 1] = { ...last, image: d.data_url, text: "Imagem gerada com flux-3:", secs: 0 };
        else copy[copy.length - 1] = { ...last, text: "> " + (d?.erro || "falha ao gerar imagem"), imgBusy: false };
        return copy;
      });
    } catch (e) {
      setMessages((prev) => { const copy = [...prev]; copy[copy.length - 1] = { ...copy[copy.length - 1], text: "> agente indisponível (dormindo no plano free — tente de novo em 1 min)" }; return copy; });
    }
    setImgPrompt(null);
    setImgBusy(false);
  }

  function comecarEdicao(i) { setEditIdx(i); setEditText(messages[i].text); }

  function guardarEdicao() {
    const t = editText.trim();
    setEditIdx(-1);
    if (!t) return;
    setDraft(t);
  }

  async function abrirSino() {
    if (bellOpen) { setBellOpen(false); return; }
    setBellOpen(true);
    if (unread > 0) {
      const ids = notifs.filter((n) => !n.read).map((n) => n.id);
      if (ids.length) {
        const { error } = await supabase.from("notifications").update({ read: true }).in("id", ids);
        if (!error) { setNotifs((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n))); setUnread(0); }
      }
    }
  }

  useEffect(() => {
    fetch(`${AGENT_URL}/tools`).then((r) => r.json()).then((d) => { if (d?.ok) setTools(d.ferramentas || []); }).catch(() => {});
  }, []);

  useEffect(() => {
    api("models").then((d) => {
      if (d.ok && Array.isArray(d.models) && d.models.length) {
        // o backend manda objetos {id,label,tier}; o seletor trabalha com ids.
        const ids = chatModels(["auto", "melhor", ...d.models.map((m) => (typeof m === "string" ? m : m.id))]);
        const unicos = [...new Set(ids)];
        setModels(unicos);
        setModelList(unicos);
        setModel("auto"); // o roteador do servidor escolhe o melhor modelo na hora
      }
    }).catch(() => {});
  }, []);

  const alternarModo = useCallback(() => {
    setModoPro((v) => {
      const novo = !v;
      localStorage.setItem("skynet-modo", novo ? "4.5pro" : "4.0");
      if (!novo) setAgenteAberto(null);
      say(novo ? "Modo agente 4.5 PRO ativado: ferramentas liberadas." : "Voltou para o 4.0 (só chat).");
      return novo;
    });
  }, [say]);


  useEffect(() => {
    stageRef.current?.scrollTo({ top: stageRef.current.scrollHeight });
  }, [messages, busy]);

  const send = useCallback(async (event) => {
    if (event) event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setMessages((prev) => [...prev, { role: "user", text }, { role: "assistant", text: "", started: Date.now() }]);
    setBusy(true);
    await streamChatAuto({ conversationId: convIdRef.current, content: text, model }, {
      onTool: (toolEv) => setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (!last || last.role !== "assistant") return prev;

        const existingFontes = last.fontes || [];
        const incomingFontes = Array.isArray(toolEv.fontes) ? toolEv.fontes : [];
        const merged = [...existingFontes, ...incomingFontes];
        const uniqueFontes = [];
        const seen = new Set();
        for (const f of merged) {
          if (f?.url && !seen.has(f.url)) {
            seen.add(f.url);
            uniqueFontes.push(f);
          }
        }

        copy[copy.length - 1] = {
          ...last,
          toolStatus: toolEv.status,
          toolName: toolEv.tool,
          fontes: uniqueFontes,
          toolQuando: toolEv.quando || last.toolQuando,
          toolErro: toolEv.status === "falhou" ? (toolEv.erro || "pesquisa indisponível agora") : last.toolErro,
        };
        return copy;
      }),
      onImage: (url) => setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (!last || last.role !== "assistant" || !url) return prev;
        copy[copy.length - 1] = { ...last, image: url };
        return copy;
      }),
      onDelta: (delta) => setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (!last || last.role !== "assistant") return prev;
        copy[copy.length - 1] = { ...last, text: last.text + delta };
        return copy;
      }),
      onDone: (info) => {
        if (info.conversationId) convIdRef.current = info.conversationId;
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant") {
            copy[copy.length - 1] = {
              ...last,
              secs: Math.max(1, Math.round((Date.now() - (last.started ?? Date.now())) / 1000)),
              toolStatus: last.toolStatus === "executando" ? "concluida" : last.toolStatus,
            };
          }
          return copy;
        });
      },
      onError: (message) => {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === "assistant" && last.text === "" && !last.fontes?.length) copy.pop();
          else if (last && last.role === "assistant") copy[copy.length - 1] = { ...last, text: `> ${message}` };
          return copy;
        });
        say(message);
        if (/limite/i.test(message)) setLimitHit(true);
      },
    });
    setBusy(false);
  }, [draft, busy, model, say]);

  const toggleMic = () => {
    const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SR) { say("Reconhecimento de voz não é suportado neste navegador."); return; }
    if (listening) { micRef.current?.stop(); stopMic(); return; }
    const r = new SR();
    micRef.current = r;
    r.lang = "pt-BR";
    r.interimResults = false;
    r.onresult = (e) => {
      const t = Array.from(e.results).map((x) => x[0].transcript).join(" ").trim();
      setDraft((cur) => (cur ? cur + " " : "") + t);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.start();
    setListening(true);
  };

  const soon = (label) => say(`"${label}" está em construção. Não é simulação: simplesmente ainda não existe. 😉`);

  const pick = (label) => {
    setActive(label);
    if (label === "Novo chat") { convIdRef.current = null; setMessages([]); }
    else if (["Indique e Ganhe", "Monetize com SKYNETchat", "Imagens", "Conversas em grupo", "Codex", "Projetos"].includes(label)) soon(label);
  };

  const fileRef = useRef(null);
  const onFile = useCallback(async (event) => {
    const f = event.target.files?.[0];
    event.target.value = "";
    if (!f) return;
    if (f.size > 200 * 1024) { say("Arquivo grande demais (limite 200 KB)."); return; }
    try {
      const texto = await f.text();
      setDraft((d) => `${d}${d ? "\n\n" : ""}Arquivo "${f.name}":\n${texto.slice(0, 20000)}\n`);
      say(`Arquivo "${f.name}" anexado ao rascunho.`);
    } catch { say("Nao consegui ler esse arquivo (use texto)."); }
  }, [say]);

  const rodarComando = useCallback(async (comando) => {
    setDraft("");
    setMessages((m) => [...m, { role: "user", text: `/${comando.nome} ${comando.args}`.trim() }]);
    const responder = async (contexto, aviso) => {
      if (aviso) setMessages((m) => [...m, { role: "assistant", text: aviso }]);
      const r = await askOnce({ conversationId: convIdRef.current, content: contexto, model });
      if (!r.ok) { setMessages((m) => [...m, { role: "assistant", text: r.erro }]); return; }
      if (r.conversationId) convIdRef.current = r.conversationId;
      setMessages((m) => [...m, { role: "assistant", text: r.texto || "(sem texto)" }]);
    };
    if (comando.nome === "ferramentas") {
      const d = await agentGet("/tools");
      if (!d?.ok) { setMessages((m) => [...m, { role: "assistant", text: `Nao consegui falar com o agente: ${d?.erro ?? "sem resposta"}.` }]); return; }
      setMessages((m) => [...m, { role: "assistant", text: "Ferramentas do agente (execucao real):\n" + d.ferramentas.map((f) => `- ${f.nome}: ${f.desc}`).join("\n") + "\n\nDigite /pesquisar <termo> ou /abrir <url> para usar." }]);
      return;
    }
    if (comando.nome === "pesquisar") {
      if (!comando.args) { say("Use: /pesquisar <termo>"); return; }
      const r = await runTool("web_pesquisar", { consulta: comando.args });
      if (!r?.ok) { setMessages((m) => [...m, { role: "assistant", text: `Ferramenta indisponivel: ${r?.erro ?? "sem resposta"}.` }]); return; }
      const fontes = r.resultados.map((x, i) => `[${i + 1}] ${x.titulo}\n${x.url}`).join("\n");
      const contexto = r.resultados.map((x, i) => `[${i + 1}] ${x.titulo}\n${x.url}\n${x.trecho ?? ""}`).join("\n\n");
      await responder(`Dados obtidos agora (${new Date().toLocaleString("pt-BR")}) por busca na web. Responda em portugues, objetivo, citando as fontes pelo numero:\n\n${contexto}\n\nPergunta: ${comando.args}`, `Busquei agora e encontrei ${r.resultados.length} fontes:\n${fontes}`);
      return;
    }
    if (comando.nome === "abrir") {
      if (!comando.args) { say("Use: /abrir <url https>"); return; }
      const r = await runTool("abrir", { url: comando.args });
      if (!r?.ok) { setMessages((m) => [...m, { role: "assistant", text: `Nao consegui abrir: ${r?.erro ?? "sem resposta"}.` }]); return; }
      await responder(`Conteudo real desta pagina (${r.url}), obtido agora:\n\n${r.texto}\n\nResuma e destaque os pontos principais.`, `Abri "${r.titulo || r.url}" (${r.url}).`);
      return;
    }
    say(`Comando /${comando.nome} nao existe.\n${ajudaComandos()}`);
  }, [model, say]);

  const enviar = useCallback((event) => {
    const comando = parseCommand(draft);
    if (comando) { event.preventDefault(); rodarComando(comando); return; }
    return send(event);
  }, [draft, send, rodarComando]);

  return (
    <div className="app">
      <Sidebar
        open={open} onClose={() => setOpen(false)} active={active} onSelect={pick}
        logged={logged} onLogout={async () => { await supabase.auth.signOut(); setLogged(false); setActive("Novo chat"); say("Sessão encerrada."); }}
        say={say}
        onOpenConv={async (id) => {
          const data = await api(`conversations?id=${id}`);
          if (data.ok && Array.isArray(data.messages)) {
            convIdRef.current = id;
            setMessages(data.messages.map((m) => ({ role: m.role, text: m.content })));
            setOpen(false);
          } else say("Não foi possível abrir a conversa.");
        }}
        draftFill={(text) => { setDraft(text); setOpen(false); }}
      />

      <header className="topbar">
        <button type="button" className="icon-btn" onClick={() => setOpen(true)} aria-label="Abrir menu">
          <IconMenu />
        </button>
        <button type="button" className="model" aria-label="Escolher modelo" onClick={() => { setModelOpen((v) => !v); setPlusOpen(false); }}>
          <span>SKYNETchat</span>
          <b>{labelFor(model)}</b>
          <IconChevron className="chev" width={16} height={16} />
        </button>
        {modelOpen && (
          <div className="model-panel">
            <b className="mp-sec">MODELOS</b>
            {models.slice(0, 8).map((m) => (
              <button key={m} className={"mp-item" + (m === model ? " on" : "")} onClick={() => { setModel(m); setModelOpen(false); }}>
                <IconChevron width={13} height={13} />
                <span>{labelFor(m)}</span>
                {m === model && <small>ativo</small>}
              </button>
            ))}
            {tools.length > 0 && (
              <>
                <b className="mp-sec" style={{ marginTop: 10 }}>FERRAMENTAS DO AGENTE (LIVE)</b>
                {tools.map((t) => (
                  <div key={t.nome} className="mp-item static" title={t.desc}>
                    <IconGlobe width={13} height={13} />
                    <span>{t.nome}</span>
                    <small>online</small>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
        <div className="top-actions">
          <button type="button" className="icon-btn" aria-label="Tema" onClick={() => {
            const next = document.documentElement.dataset.theme === "white" ? "black" : "white";
            document.documentElement.dataset.theme = next;
            localStorage.setItem("skynet-theme-bg", next);
          }}><IconTheme /></button>
          <button type="button" className="icon-btn" aria-label="Novo chat" onClick={() => pick("Novo chat")}><IconEdit /></button>
          {logged && (
            <button type="button" className="icon-btn" aria-label="Notificações" onClick={abrirSino}>
              <IconBell width={20} height={20} />
              {unread > 0 && <b className="bell-badge">{unread}</b>}
            </button>
          )}
        </div>
      </header>

      <main className="stage" ref={stageRef}>
        {messages.length === 0 ? (
          <section className="hero">
            <h1>Apresentamos o <span className="red">SKYNETchat</span></h1>
            <p>Sua inteligência artificial avançada sem censura</p>
            <div className="chips">
              {actions.map(({ label, icon: Icon, color }) => (
                <button key={label} type="button" className="chip" onClick={() => setDraft(label)}>
                  <Icon width={20} height={20} style={{ color }} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="thread">
            {messages.map((message, index) => (
              <article key={index} className={`bubble ${message.role}${message.image ? " with-img" : ""}`}>
                {editIdx === index ? (
                  <>
                    <textarea className="edit-area" value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} aria-label="Editando mensagem" />
                    <span className="edit-row">
                      <button type="button" className="cancelar" onClick={() => setEditIdx(-1)}>Cancelar</button>
                      <button type="button" className="guardar" onClick={guardarEdicao}>Guardar</button>
                    </span>
                  </>
                ) : (
                  <>
                    {message.role === "assistant" && message.toolStatus === "executando" && (
                      <div className="tool-status executando">
                        <IconGlobe className="tool-icon spin" width={14} height={14} />
                        <span>Pesquisando...</span>
                      </div>
                    )}
                    {message.role === "assistant" && message.toolStatus === "falhou" && (!message.fontes || message.fontes.length === 0) && (
                      <div className="tool-status falhou">
                        <span>pesquisa indisponível agora</span>
                      </div>
                    )}
                    {message.image && <img src={message.image} alt="imagem gerada" className="gen-img" />}
                    {message.image && !message.text ? null : message.text}
                    {message.role === "assistant" && message.fontes && message.fontes.length > 0 && (
                      <div className="tool-fontes">
                        <div className="fontes-chips">
                          {message.fontes.map((f, i) => (
                            <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="fonte-chip" title={f.titulo}>
                              <IconGlobe width={12} height={12} />
                              <span>{f.titulo || f.url}</span>
                            </a>
                          ))}
                        </div>
                        {message.toolQuando && (
                          <span className="fontes-nota">dados obtidos em {formatHora(message.toolQuando)}</span>
                        )}
                      </div>
                    )}
                    <span className="bubble-actions">
                      {message.secs ? <small className="worked">Trabalhou por {message.secs}s</small> : null}
                      {message.role === "user" && !busy && <button type="button" onClick={() => comecarEdicao(index)}>Editar</button>}
                      {!busy && <button type="button" onClick={() => { navigator.clipboard?.writeText(message.text); say(message.role === "user" ? "Mensagem copiada." : "Resposta copiada."); }}>Copiar</button>}
                    </span>
                  </>
                )}
              </article>
            ))}
            {busy && messages[messages.length - 1]?.text === "" && !messages[messages.length - 1]?.toolStatus && (
              <article className="bubble assistant typing-bubble">●●●</article>
            )}
          </section>
        )}
      </main>

      {bellOpen && (
        <div className="notif-panel">
          <b className="notif-title">NOTIFICAÇÕES</b>
          {notifs.length === 0 && <p className="notif-empty">Nenhuma notificação.</p>}
          {notifs.map((n) => (
            <div key={n.id} className={"notif-item" + (n.read ? "" : " nova")}>
              <b>{n.title}</b>
              <p>{n.body}</p>
              <small>{new Date(n.created_at).toLocaleString("pt-BR")}</small>
            </div>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <Link to="/account?tab=assinatura" className="pro-link">Assinar SKYNETchat PRO →</Link>
      )}

      {limitHit && (
        <div className="limit-modal" role="dialog">
          <div className="limit-card">
            <h3>Seu limite diário acabou</h3>
            <p>Continue exatamente de onde parou. Sem cortes. Sem limites. Do jeito que você quer.</p>
            <Link to="/account?tab=assinatura" className="limit-cta" onClick={() => setLimitHit(false)}>Continuar sem limites →</Link>
            <button type="button" className="limit-alt" onClick={() => setLimitHit(false)}>Já tenho acesso</button>
          </div>
        </div>
      )}

      <form className="dock" onSubmit={enviar}>
        <div className="plus-wrap">
          <button type="button" className="dock-plus" aria-label="Mais" onClick={() => { setPlusOpen((v) => !v); setModelOpen(false); }}><IconPlus /></button>
          {plusOpen && (
            <div className="plus-menu">
              <button type="button" onClick={() => { setPlusOpen(false); fileRef.current?.click(); say("Envio de arquivos em construção — logo você anexa fotos e docs."); }}>📎 Adicionar fotos e arquivos</button>
              <button type="button" onClick={() => { setPlusOpen(false); setImgPrompt(""); }}>🖼 Criar imagem</button>
              <button type="button" onClick={() => { setPlusOpen(false); setDraft("Pense passo a passo: "); }}>💡 Pensar</button>
              <button type="button" onClick={() => { setPlusOpen(false); setDraft("Investigue com atenção: "); }}>🔍 Investigar</button>
              <button type="button" onClick={() => { setPlusOpen(false); setDraft("Gere o código: "); }}>⌨ Gerar código</button>
              <button type="button" onClick={() => { setPlusOpen(false); setDraft("Traduza para português: "); }}>文 Traduzir texto</button>
            </div>
          )}
          {imgPrompt !== null && (
            <div className="img-flow">
              <b>CRIAR IMAGEM</b>
              <input value={imgPrompt} onChange={(e) => setImgPrompt(e.target.value)} placeholder="descreva a imagem…" aria-label="Prompt de imagem" />
              <div className="img-actions">
                <button type="button" className="ghost" onClick={() => setImgPrompt(null)}>cancelar</button>
                <button type="button" onClick={gerarImagem} disabled={imgBusy || imgPrompt.trim().length < 3}>{imgBusy ? "gerando…" : "gerar"}</button>
              </div>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" hidden onChange={onFile} accept=".txt,.md,.json,.csv,.js,.ts,.tsx,.py,.html,.css,.log,.yml,.yaml" />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={PLACEHOLDERS[ph]}
          aria-label="Mensagem"
        />
        {listening ? (
          <span className="rec-ui" aria-label="Gravando áudio">
            <b className="rec-dot" /><span className="rec-time">{String(Math.floor(micSecs / 60)).padStart(2, "0")}:{String(micSecs % 60).padStart(2, "0")}</span>
            <button type="button" className="rec-x" onClick={() => { micRef.current?.stop(); stopMic(); }} aria-label="Cancelar gravação">✕</button>
          </span>
        ) : (
          <button type="button" className="icon-btn muted" aria-label="Gravar áudio" onClick={toggleMic}><IconMic /></button>
        )}
        <button type="submit" className="dock-send" aria-label="Voz ou enviar"><IconWave width={22} height={22} /></button>
      </form>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
