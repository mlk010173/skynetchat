import { useCallback, useEffect, useRef, useState } from "react";
import { IconBrain, IconChevron, IconCode, IconEdit, IconGlobe, IconImage, IconMenu, IconMic, IconPlus, IconTheme, IconWave } from "../components/Icons.jsx";
import Sidebar from "../components/Sidebar.jsx";
import { api, getSession, setModelList, streamChatAuto, supabase } from "../lib.js";
import { agentGet, askOnce, runTool } from "../lib.js";
import { ajudaComandos, parseCommand } from "../commands.js";
import { labelFor } from "../models.js";

const actions = [
  { label: "Pesquisar", icon: IconGlobe, color: "#3b82f6" },
  { label: "Gerar Imagens", icon: IconImage, color: "#eab308" },
  { label: "Persuasão", icon: IconBrain, color: "#dc2626" },
  { label: "Programar", icon: IconCode, color: "#16a34a" },
];

/** Tela inicial: interface do skynetchat.net com backend real (Supabase). */
export default function Home() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("Novo chat");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [logged, setLogged] = useState(false);
  const [model, setModel] = useState("");
  const [models, setModels] = useState([]);
  const [toast, setToast] = useState("");
  const [listening, setListening] = useState(false);
  const micRef = useRef(null);
  const convIdRef = useRef(null);
  const stageRef = useRef(null);

  const say = useCallback((m) => { setToast(m); setTimeout(() => setToast(""), 5000); }, []);

  useEffect(() => { getSession().then((s) => setLogged(!!s)); }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setLogged(!!s?.user));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    api("models").then((d) => {
      if (d.ok && Array.isArray(d.models) && d.models.length) { setModels(d.models); setModelList(d.models); setModel(String(d.models[0])); }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    stageRef.current?.scrollTo({ top: stageRef.current.scrollHeight });
  }, [messages, busy]);

  const send = useCallback(async (event) => {
    if (event) event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setMessages((prev) => [...prev, { role: "user", text }, { role: "assistant", text: "" }]);
    setBusy(true);
    await streamChatAuto({ conversationId: convIdRef.current, content: text, model }, {
      onDelta: (delta) => setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { ...copy[copy.length - 1], text: copy[copy.length - 1].text + delta };
        return copy;
      }),
      onDone: (info) => { if (info.conversationId) convIdRef.current = info.conversationId; },
      onError: (message) => {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === "assistant" && last.text === "") copy.pop();
          else copy[copy.length - 1] = { ...last, text: `> ${message}` };
          return copy;
        });
        say(message);
      },
    });
    setBusy(false);
  }, [draft, busy, model, say]);

  const toggleMic = () => {
    const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SR) { say("Reconhecimento de voz não é suportado neste navegador."); return; }
    if (listening) { micRef.current?.stop(); return; }
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
      if (r.model && r.model !== model) setModel(r.model);
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
        <label className="model" title={model} style={{ gap: 6 }}>
          <span>SKYNETchat</span>
          <select
            value={model}
            onChange={(event) => setModel(event.target.value)}
            aria-label="Escolher modelo"
            style={{ background: "transparent", border: 0, color: "inherit", font: "inherit", fontWeight: 700, outline: "none", maxWidth: "46vw" }}
          >
            {(models.length ? models : [model]).filter(Boolean).map((m) => (
              <option key={m} value={m} style={{ color: "#111" }}>{labelFor(m)}</option>
            ))}
          </select>
          <IconChevron className="chev" width={16} height={16} />
        </label>
        <div className="top-actions">
          <button type="button" className="icon-btn" aria-label="Tema" onClick={() => {
            const next = document.documentElement.dataset.theme === "white" ? "black" : "white";
            document.documentElement.dataset.theme = next;
            localStorage.setItem("skynet-theme-bg", next);
          }}><IconTheme /></button>
          <button type="button" className="icon-btn" aria-label="Novo chat" onClick={() => pick("Novo chat")}><IconEdit /></button>
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
              <article key={index} className={`bubble ${message.role}`}>{message.text}</article>
            ))}
            {busy && messages[messages.length - 1]?.text === "" && (
              <article className="bubble assistant typing-bubble">●●●</article>
            )}
          </section>
        )}
      </main>

      <form className="dock" onSubmit={enviar}>
        <button type="button" className="dock-plus" aria-label="Anexar" onClick={() => fileRef.current?.click()}><IconPlus /></button>
        <input ref={fileRef} type="file" hidden onChange={onFile} accept=".txt,.md,.json,.csv,.js,.ts,.tsx,.py,.html,.css,.log,.yml,.yaml" />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Pesquise sem censura..."
          aria-label="Mensagem"
        />
        <button type="button" className={`icon-btn muted ${listening ? "mic-on" : ""}`} aria-label="Gravar áudio" onClick={toggleMic}><IconMic /></button>
        <button type="submit" className="dock-send" aria-label="Voz ou enviar"><IconWave width={22} height={22} /></button>
      </form>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
