import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MediaPlayer from "../media.jsx";
import ClimaCard from "../clima.jsx";
import { NavegadorAoVivo } from "../artefato.jsx";
import { chaveStorage, criarWidget, carregarWidgets, daSpec, porPalavras, salvarWidgets } from "../widgets/registry.js";
import { IconBell, IconBrain, IconChevron, IconCode, IconEdit, IconGlobe, IconImage, IconMenu, IconMic, IconPlus, IconTheme, IconWave } from "../components/Icons.jsx";
import Sidebar from "../components/Sidebar.jsx";
import AcaoSheet, { ACOES } from "../components/AcaoSheet.jsx";

const PLACEHOLDERS = ["Pesquise sem censura...", "Pergunte sem medo.", "Vá além", "Sem filtros, sem limites."];
import { useAuth } from "../auth.jsx";
import { AGENT_URL, api, getSession, setModelList, streamChatAuto, supabase } from "../lib.js";
import { responderLocal } from "../fallback.js";
import { guardarDossie, lerArquivo, removerDossie } from "../historico.js";
import { resumoComportamento } from "../comportamento.js";
import { agentGet, askOnce, runTool } from "../lib.js";
import { ajudaComandos, parseCommand } from "../commands.js";
import { chatModels, labelFor } from "../models.js";
import * as voz from "../voz.js";
import RichText from "../rich.jsx";
import { Artefato, montarArtefato, resumoDoArtefato, separarArtefatos } from "../artefatos.jsx";
import { lerConfig, assinarConfig } from "../agente-config.js";
import Paleta from "../components/Paleta.jsx";
import { baixarArquivo, paraMarkdown } from "../habilidades.js";
import { camadaDeComportamento } from "../comportamento.js";
import { lerMemoria, memoriaParaPrompt } from "../memoria.js";

const actions = [
  { label: "Pesquisar na web agora", icon: IconGlobe, color: "#60a5fa", desc: "manchetes e fontes ao vivo" },
  { label: "Abrir um site e ler a página", icon: IconGlobe, color: "#a78bfa", desc: "navegação real no site" },
  { label: "Gerar uma imagem", icon: IconImage, color: "#fbbf24", desc: "NVIDIA, Hugging Face, fallback" },
  { label: "Tocar uma música ou vídeo", icon: IconWave, color: "#f472b6", desc: "player dentro do chat" },
  { label: "Clima de hoje com gráfico", icon: IconBrain, color: "#34d399", desc: "24h e 5 dias, interativo" },
  { label: "Criar um widget para o painel", icon: IconCode, color: "#ff6b6b", desc: "salva em /widgets" },
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
const ICONES_PASSO = {
  pensando: "◆",
  web_pesquisar: "◎",
  abrir: "↗",
  vendo: "◉",
  navegar: "↗",
  imagem: "▣",
  calculadora: "∑",
  calcular: "∑",
  clima: "☁",
  moeda: "¤",
  hora: "◔",
  retomando: "↻",
  habilidade: "⟨⟩",
  memoria: "❑",
  infra: "⛭",
  conferindo: "✔",
};

function rotuloDoPasso(ferramenta) {
  const mapa = {
    pensando: "Entendendo o pedido",
    web_pesquisar: "Pesquisando na web",
    abrir: "Abrindo o link",
    vendo: "Lendo a fonte",
    imagem: "Gerando imagem",
    calcular: "Calculando",
    calculadora: "Calculando",
    clima: "Consultando o clima",
    moeda: "Consultando a cotação",
    habilidade: "Usando a habilidade",
    retomando: "Retomando o que eu estava fazendo",
    memoria: "Consultando a memória",
    infra: "Consultando a infraestrutura",
    hora: "Conferindo o horário",
    conferindo: "Conferindo a resposta",
  };
  return mapa[ferramenta] || "Trabalhando";
}

function alvoDeNavegacao(texto) {
  const url = texto.match(/https?:\/\/[^\s,)]+/i);
  if (url) return url[0];
  const quer = /\b(naveg\w*|entr\w+ (?:no|na|em)|abr\w+ (?:o|a|esse|esta) ?(?:site|p[aá]gina|link)|ver (?:o|esse|este) site|chromium|renderiz\w+)\b/i.test(texto);
  const dominio = texto.match(/\b((?:[a-z0-9-]+\.)+(?:com|com\.br|net|org|io|dev|app|br)(?:\/[^\s,]*)?)\b/i);
  if (quer && dominio) return `https://${dominio[1]}`;
  return quer && !dominio ? "" : null;
}

export default function Home() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("Novo chat");
  const [draft, setDraft] = useState("");
  const [prints, setPrints] = useState([]);
  const [paleta, setPaleta] = useState(false);
  const [acaoSheet, setAcaoSheet] = useState(null);
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [segundosAoVivo, setSegundosAoVivo] = useState(0);
  const [ph, setPh] = useState(0);
  const [logged, setLogged] = useState(false);
  const navigate = useNavigate();
  const { usuario: contaAtual, papel: papelConta } = useAuth();
  const ehDev = papelConta === "dev";
  // id do usuário atual em ref: o widget precisa ir para a mesma chave que o painel lê
  const usuarioRef = useRef(contaAtual || null);
  useEffect(() => { usuarioRef.current = contaAtual || null; }, [contaAtual]);

  // lembretes atrasados: o app cobra sozinho, sem depender do chat
  useEffect(() => {
    if (!logged) { setAtrasados(0); return undefined; }
    let vivo = true;
    const conferir = async () => {
      const r = await api("lembretes?estado=vencidos").catch(() => null);
      if (vivo && r?.ok) setAtrasados(r.lembretes?.length ?? 0);
    };
    conferir();
    const t = setInterval(conferir, 120000);
    return () => { vivo = false; clearInterval(t); };
  }, [logged]);
  const [model, setModel] = useState("");
  const [atrasados, setAtrasados] = useState(0);
  // 4.0 = roteamento rápido · 4.5 Pro = roteador pede o modelo mais forte
  const [modo, setModo] = useState(() => localStorage.getItem("skynet-modo") || "4.5");
  const trocarModo = (m) => { setModo(m); localStorage.setItem("skynet-modo", m); setModel(m === "4.5" ? "melhor" : "auto"); };
  useEffect(() => { if (!model) setModel((localStorage.getItem("skynet-modo") || "4.5") === "4.5" ? "melhor" : "auto"); }, [model]);
  const [models, setModels] = useState([]);
  const [toast, setToast] = useState("");
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [abaMotor, setAbaMotor] = useState("modo");
  const [habilidades, setHabilidades] = useState([]);
  const [habBusca, setHabBusca] = useState("");
  const [habPacote, setHabPacote] = useState("todos");
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
  const [traceAberto, setTraceAberto] = useState({});
  const [editIdx, setEditIdx] = useState(-1);
  const [editText, setEditText] = useState("");
  const [micSecs, setMicSecs] = useState(0);
  const micTimer = useRef(null);
  const micRef = useRef(null);
  const convIdRef = useRef(null);
  const stageRef = useRef(null);

  const say = useCallback((m) => { setToast(m); setTimeout(() => setToast(""), 5000); }, []);

  // sugestões dos artefatos caem no campo de texto (sem enviar sozinho)
  useEffect(() => {
    const aoSugerir = (ev) => {
      const texto = ev?.detail?.texto;
      if (!texto) return;
      setDraft((d) => (d ? `${d}\n${texto}` : texto));
      document.querySelector(".dock input[aria-label=\"Mensagem\"]")?.focus();
    };
    window.addEventListener("skynet:sugestao", aoSugerir);
    return () => window.removeEventListener("skynet:sugestao", aoSugerir);
  }, []);
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
      // nunca chamar o Render direto (ele exige AGENT_TOKEN); usa o backend, que tem fila de provedores
      let d = await api("imagem", { method: "POST", body: { prompt: imgPrompt.trim() } }).catch(() => null);
      if (!d || !d.ok) {
        const ponte = await api("agent", { method: "POST", body: { tool: "imagem", payload: { prompt: imgPrompt.trim() } } }).catch(() => null);
        if (ponte && ponte.ok) d = ponte;
      }
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (d?.ok && d.data_url) copy[copy.length - 1] = { ...last, image: d.data_url, text: `Imagem gerada (${d.provedor || "flux"} · ${d.modelo || "flux-3"})`, secs: 0, imgBusy: false };
        else copy[copy.length - 1] = { ...last, text: "> " + (d?.error || d?.erro || "falha ao gerar imagem"), imgBusy: false };
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
    // só rola quando existe conversa: no estado vazio isso cortava o topo do hero
    if (!messages.length) return;
    stageRef.current?.scrollTo({ top: stageRef.current.scrollHeight });
  }, [messages, busy]);

  // relógio do "ao vivo": conta enquanto uma resposta está sendo produzida
  useEffect(() => {
    if (!busy) { setSegundosAoVivo(0); return undefined; }
    const t = setInterval(() => setSegundosAoVivo((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const send = useCallback(async (event, textoDireto, opcoes = {}) => {
    if (event) event.preventDefault();
    const text = (typeof textoDireto === "string" ? textoDireto : draft).trim();
    const anexos = prints.slice();
    if ((!text && !anexos.length) || busy) return;
    setDraft("");
    setPrints([]);
    const mid = "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setMessages((prev) => [
      ...prev,
      { role: "user", text, anexos },
      { role: "assistant", mid, text: "", started: Date.now(), passos: [] },
    ]);
    setBusy(true);

    // pesquisa em segundo plano: roda junto com a resposta e atualiza o painel ao vivo
    const aoPasso = (estado) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.mid === mid);
        if (idx < 0) return prev;
        const alvoMsg = prev[idx];
        const copy = [...prev];
        copy[idx] = {
          ...alvoMsg,
          estadoPesquisa: estado,
          artefatos: [{ tipo: "pesquisa", titulo: "Pesquisa em segundo plano", subtitulo: estado.carregando ? "rodando agora" : "concluída", etapas: estado.etapas, carregando: estado.carregando }, ...(alvoMsg.artefatos || []).filter((a) => a.tipo !== "pesquisa")],
        };
        return copy;
      });
    };

    if (lerConfig().autoArtefato !== false) montarArtefato(text, { imagens: anexos, aoPasso })
      .then((specs) => {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.mid === mid);
          if (idx < 0) return prev;
          const alvoMsg = prev[idx];
          if (/```artefat/i.test(alvoMsg.text || "")) return prev;
          const copy = [...prev];
          if (!specs || !specs.length) {
            copy[idx] = { ...alvoMsg, artefatos: (alvoMsg.artefatos || []).filter((a) => a.tipo !== "pesquisa") };
            return copy;
          }
          const dossie = specs.find((x) => x.tipo === "fontes");
          if (dossie) guardarDossie(text, dossie);
          copy[idx] = {
            ...alvoMsg,
            text: alvoMsg.text || resumoDoArtefato(specs),
            artefatos: specs,
          };
          return copy;
        });
      })
      .catch(() => {});

    // Passo de navegacao real: abre o site pedido e mostra o comando na trilha.
    const cfgNow = lerConfig();
    let conteudo = text;
    const alvo = alvoDeNavegacao(text);
    if (alvo !== null) {
      const passoBase = {
        chave: "navegar|" + (alvo || text.slice(0, 40)),
        ferramenta: "navegar",
        titulo: "Navegando no site",
        detalhe: alvo || "procurando o site",
        entrada: JSON.stringify(alvo ? { url: alvo } : { consulta: text.slice(0, 120) }),
        estado: "executando",
        fontes: [],
        ms: 0,
      };
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant") copy[copy.length - 1] = { ...last, passos: [passoBase] };
        return copy;
      });
      const t0 = Date.now();
      let alvoFinal = alvo;
      let lido = null;
      try {
        if (!alvoFinal) {
          const busca = await api("agent", { method: "POST", body: { tool: "web_pesquisar", payload: { consulta: text.slice(0, 120) } } });
          const primeiro = (busca?.resultados || [])[0];
          if (primeiro?.url) alvoFinal = primeiro.url;
        }
        if (alvoFinal) {
          lido = await api("agent", { method: "POST", body: { tool: "abrir", payload: { url: alvoFinal } } });
        }
      } catch { /* segue sem navegacao */ }
      const pag = lido?.resultado ?? lido ?? {};
      const trecho = String(pag?.texto ?? pag?.conteudo ?? pag?.markdown ?? "").replace(/\s+/g, " ").trim();
      const util = !!pag?.ok && trecho.length >= 60;
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role !== "assistant") return prev;
        const passos = [...(last.passos || [])];
        passos[0] = {
          ...passos[0],
          detalhe: alvoFinal || passoBase.detalhe,
          estado: util ? "concluida" : "falhou",
          saida: util ? `${pag?.titulo ? pag.titulo + " · " : ""}${trecho.length} caracteres: ${trecho.slice(0, 140)}` : (pag?.erro || lido?.error || "nao consegui extrair o texto da pagina"),
          ms: Date.now() - t0,
          fontes: alvoFinal ? [{ titulo: pag?.titulo || alvoFinal, url: alvoFinal }] : [],
        };
        copy[copy.length - 1] = { ...last, passos };
        return copy;
      });
      if (util) conteudo = `${text}\n\nConteudo lido agora de ${alvoFinal}:\n${trecho.slice(0, 2400)}`;
    }

    const camada = camadaDeComportamento(
      cfgNow,
      cfgNow.memoriaAtiva ? memoriaParaPrompt() : "",
      (opcoes && opcoes.extra) || ""
    );
    if (camada) conteudo = `${conteudo}\n\n${camada}`;

    await streamChatAuto({ conversationId: convIdRef.current, content: conteudo, model, continuar: opcoes.continuar }, {
      onTool: (toolEv) => setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (!last || last.role !== "assistant") return prev;

        // trilha do agente: cada ferramenta vira um passo que muda de estado ao vivo
        const passos = [...(last.passos || [])];
        const chave = `${toolEv.tool || ""}|${toolEv.detalhe || ""}`;
        const idx = passos.findIndex((p) => p.chave === chave && p.estado === "executando");
        const passo = {
          chave,
          ferramenta: toolEv.tool || "",
          titulo: toolEv.titulo || rotuloDoPasso(toolEv.tool),
          detalhe: toolEv.detalhe || "",
          entrada: toolEv.entrada || last.entrada || "",
          saida: toolEv.saida || "",
          estado: toolEv.status || "executando",
          ms: toolEv.ms || 0,
          erro: toolEv.erro || "",
          fontes: Array.isArray(toolEv.fontes) ? toolEv.fontes : [],
        };
        const anterior = passos.findIndex((p) => p.ferramenta === passo.ferramenta && p.estado === "executando");
        if (anterior >= 0 && passo.estado !== "executando") passos[anterior] = { ...passos[anterior], ...passo };
        else if (idx >= 0) passos[idx] = { ...passos[idx], ...passo };
        else passos.push(passo);

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
          passos,
          toolTitulo: toolEv.titulo,
          toolStatus: toolEv.status,
          toolName: toolEv.tool,
          fontes: uniqueFontes,
          toolQuando: toolEv.quando || last.toolQuando,
          toolErro: toolEv.status === "falhou" ? (toolEv.erro || "pesquisa indisponível agora") : last.toolErro,
        };
        return copy;
      }),
      onPrint: (p) => setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (!last || last.role !== "assistant") { copy.push({ role: "assistant", text: "", print: p }); return copy; }
        copy[copy.length - 1] = { ...last, print: p };
        return copy;
      }),
      onImage: (url) => setMessages((prev) => {
        if (!url) return prev;
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (!last || last.role !== "assistant") {
          copy.push({ role: "assistant", text: "", image: url, passos: [], fontes: [], ts: Date.now() });
          return copy;
        }
        copy[copy.length - 1] = { ...last, image: url };
        return copy;
      }),
      onMidia: (midia) => setMessages((prev) => {
        if (!midia?.embed) return prev;
        const copy = [...prev];
        const last = copy[copy.length - 1];
        // o quadro de mídia pode chegar antes do texto: nesse caso já cria a bolha
        if (!last || last.role !== "assistant") {
          copy.push({ role: "assistant", text: "", midia, passos: [], fontes: [], ts: Date.now() });
          return copy;
        }
        copy[copy.length - 1] = { ...last, midia };
        return copy;
      }),
      onClima: (dados) => setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (!last || last.role !== "assistant") { copy.push({ role: "assistant", text: "", clima: dados }); return copy; }
        copy[copy.length - 1] = { ...last, clima: dados };
        return copy;
      }),
      onDevtool: (dados) => setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (!last || last.role !== "assistant") {
          copy.push({ role: "assistant", text: "", devtool: dados, passos: [], fontes: [], ts: Date.now() });
          return copy;
        }
        copy[copy.length - 1] = { ...last, devtool: dados };
        return copy;
      }),
      onLembrete: (dados) => setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (!last || last.role !== "assistant") {
          copy.push({ role: "assistant", text: "", lembrete: dados, passos: [], fontes: [], ts: Date.now() });
          return copy;
        }
        copy[copy.length - 1] = { ...last, lembrete: dados };
        return copy;
      }),
      onWidget: (spec) => setMessages((prev) => {
        // monta o widget a partir do pedido (tipo + config reais) e grava na chave do painel
        const doPedido = spec?.pedido ? porPalavras(spec.pedido) : null;
        const daSpecSegura = doPedido ? null : daSpec(spec);
        const novo = doPedido
          || (daSpecSegura?.ok ? daSpecSegura.widget : null)
          || criarWidget(spec?.tipo || "texto", { titulo: spec?.titulo });
        const marca = { tipo: novo?.tipo || spec?.tipo, titulo: novo?.titulo || spec?.titulo || "Widget" };
        if (novo) {
          const chave = chaveStorage(usuarioRef.current?.id);
          const atual = carregarWidgets(chave);
          salvarWidgets(chave, [...atual, novo]);
          marca.salvo = true;
          marca.total = atual.length + 1;
        }
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (!last || last.role !== "assistant") { copy.push({ role: "assistant", text: "", widgetCriado: marca }); return copy; }
        copy[copy.length - 1] = { ...last, widgetCriado: marca };
        return copy;
      }),
      onPermissao: (perm) => setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (!last || last.role !== "assistant") { copy.push({ role: "assistant", text: "", permissao: perm }); return copy; }
        copy[copy.length - 1] = { ...last, permissao: perm };
        return copy;
      }),
      onArquivo: (arq) => setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (!last || last.role !== "assistant") { copy.push({ role: "assistant", text: "", arquivo: arq }); return copy; }
        copy[copy.length - 1] = { ...last, arquivo: arq };
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
      onError: async (message) => {
        const aviso = `> O servidor do chat não respondeu (${String(message || "erro").slice(0, 60)}). Montando a resposta aqui no navegador com as fontes reais…`;
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === "assistant") copy[copy.length - 1] = { ...last, text: aviso, local: true };
          else copy.push({ role: "assistant", text: aviso, local: true, started: Date.now() });
          return copy;
        });
        try {
          const { texto, dossie } = await responderLocal(text);
          const spec = {
            tipo: "fontes",
            titulo: `Dossiê · ${String(text).slice(0, 46)}`,
            subtitulo: `${dossie.fontes.length} fontes · montado no navegador`,
            itens: dossie.fontes.slice(0, 14),
            plano: dossie.plano,
            rodape: "modo local · sem backend",
          };
          guardarDossie(text, spec);
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === "assistant") {
              copy[copy.length - 1] = {
                ...last,
                text: texto,
                local: true,
                secs: Math.max(1, Math.round((Date.now() - (last.started || Date.now())) / 1000)),
                artefatos: [...(last.artefatos || []).filter((a) => a.tipo !== "pesquisa"), spec],
              };
            }
            return copy;
          });
        } catch {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === "assistant") copy[copy.length - 1] = { ...last, text: aviso };
            return copy;
          });
        }
        say(message);
        if (/limite/i.test(message)) setLimitHit(true);
      },
    });
    setBusy(false);
  }, [draft, busy, model, say, prints]);

  // Ditado: Whisper local (transformers.js) com o reconhecedor do navegador como reserva.
  const stopMic = useCallback(() => {
    setListening(false);
    setMicSecs(0);
    clearInterval(micTimer.current);
    micTimer.current = null;
  }, []);

  const toggleMic = async () => {
    if (listening) { await finalizarDitado(); return; }
    if (!navigator.mediaDevices?.getUserMedia) { say("Este navegador não dá acesso ao microfone."); return; }
    try {
      say("Preparando o Whisper local (só na primeira vez)…");
      const gravador = await voz.gravarMicrofone();
      micRef.current = gravador;
      setMicSecs(0);
      setListening(true);
      say("Gravando. Toque no microfone para parar.");
    } catch (e) {
      say("Não consegui abrir o microfone: " + String(e).slice(0, 80));
    }
  };

  const finalizarDitado = async () => {
    const gravador = micRef.current;
    if (!gravador) return;
    stopMic();
    say("Transcrevendo com Whisper…");
    try {
      const blob = await gravador.finalizar();
      const pcm = await voz.audioParaFloat32(blob);
      const texto = await voz.transcrever(pcm);
      if (texto) {
        setDraft((cur) => (cur ? cur + " " : "") + texto);
        say("Transcrito pelo Whisper.");
      } else {
        say("Não entendi o áudio. Tenta de novo mais perto do microfone.");
      }
    } catch (e) {
      say("Falha na transcrição local: " + String(e).slice(0, 90));
    }
  };

  const soon = (label) => say(`"${label}" está em construção. Não é simulação: simplesmente ainda não existe. 😉`);

  const pick = (label) => {
    setActive(label);
    if (label === "Novo chat") { convIdRef.current = null; setMessages([]); }
    else if (label === "Codex") navigate("/codex");
    else if (["Indique e Ganhe", "Monetize com SKYNETchat", "Imagens", "Conversas em grupo", "Projetos"].includes(label)) soon(label);
  };

  const redimensionar = useCallback((file, max = 1400) => new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const escala = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * escala);
        c.height = Math.round(img.height * escala);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.88));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }), []);

  // Ctrl+K / Cmd+K abre a paleta de comandos (desligável no painel)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        if (lerConfig().paletaAtalhos === false) return;
        e.preventDefault();
        setPaleta((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const exportarConversa = useCallback(() => {
    const blocos = messages
      .filter((m) => (m.text || "").trim())
      .map((m) => ({ tipo: "par", texto: `**${m.role === "user" ? "Você" : "SKYNET"}:** ${m.text}` }));
    const nome = `skynet-conversa-${new Date().toISOString().slice(0, 10)}.md`;
    baixarArquivo(nome, paraMarkdown("Conversa SKYNETchat", blocos));
    say("Conversa exportada em markdown.");
  }, [messages, say]);

  const aoEscolherPaleta = useCallback((item) => {
    if (item.tipo === "rota") {
      window.location.hash = "#" + item.valor;
      if (item.valor === "/") { /* já estamos */ }
      return;
    }
    if (item.tipo === "prompt") {
      setDraft((d) => (d ? d + "\n\n" + item.valor : item.valor));
      return;
    }
    if (item.tipo === "exportar") { exportarConversa(); return; }
    if (item.tipo === "limparMemoria") {
      import("../memoria.js").then((m) => { m.limparMemoria(); say("Memória limpa."); });
      return;
    }
    if (item.tipo === "sistema") {
      const cfg = lerConfig();
      const texto = `tom: ${cfg.tom} · formato: ${cfg.estilo} · raciocínio: ${cfg.raciocinio} · fontes: ${cfg.fontesMax} · leituras: ${cfg.leiturasIntegra}`;
      navigator.clipboard?.writeText(texto).catch(() => {});
      say("Configuração copiada.");
    }
  }, [exportarConversa, say]);

  const fileRef = useRef(null);
  const onFile = useCallback(async (event) => {
    const f = event.target.files?.[0];
    event.target.value = "";
    if (!f) return;
    if (/^image\//.test(f.type)) {
      if (f.size > 40 * 1024 * 1024) { say("Imagem acima de 40 MB não abre no navegador."); return; }
      try {
        const url = await redimensionar(f, 1400);
        setPrints((p) => (p.length >= 8 ? p : [...p, { url, nome: f.name || `print-${p.length + 1}.png`, tipo: f.type }]));
        say(`Print "${f.name || "colado"}" anexado. Pode mandar mais de um.`);
      } catch { say("Nao consegui abrir essa imagem."); }
      return;
    }
    if (f.size > 6 * 1024 * 1024) { say("Arquivo acima de 6 MB para texto."); return; }
    try {
      const texto = await f.text();
      setDraft((d) => `${d}${d ? "\n\n" : ""}Arquivo "${f.name}":\n${texto.slice(0, 120000)}\n`);
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
    // só o que a interface resolve sozinha fica aqui; /terminal, /sandbox e desconhecidos vão ao servidor
    const LOCAIS = ["pesquisar", "abrir", "ferramentas"];
    if (comando && LOCAIS.includes(comando.nome)) { event.preventDefault(); rodarComando(comando); return; }
    return send(event);
  }, [draft, send, rodarComando]);

  const fecharSheet = useCallback(() => setAcaoSheet(null), []);

  useEffect(() => {
    if (!modelOpen || habilidades.length) return;
    let vivo = true;
    api("skills")
      .then((d) => { if (vivo && d?.ok) setHabilidades(d.habilidades || []); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [modelOpen, habilidades.length]);

  const enviarTexto = useCallback((texto) => {
    setAcaoSheet(null);
    return send(null, texto);
  }, [send]);

  const autorizarPermissao = useCallback(async (perm, autorizar) => {
    if (!perm?.id) return;
    const r = await api("permissoes?action=decidir", { method: "POST", body: { id: perm.id, autorizar } });
    if (!r?.ok) { say(r?.error || "Não consegui registrar a decisão."); return; }
    if (!autorizar) { say("Pedido negado."); return; }
    // retomada: o agente continua exatamente do ponto onde parou, sem repetir o pedido
    setMessages((prev) => prev.map((m) => (m.permissao?.id === perm.id ? { ...m, permissao: { ...m.permissao, resolvido: true } } : m)));
    say("Autorizado. Retomando de onde parei…");
    send(null, "continuar", { continuar: perm.id });
  }, [say, send]);

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
            setMessages(data.messages.map((m) => {
              const midia = m.payload?.midia;
              const quadro = m.payload?.quadro;
              return {
                role: m.role,
                text: m.content,
                ...(midia ? { midia } : quadro?.tipo === "clima" ? { clima: quadro.dados } : {}),
              };
            }));
            setOpen(false);
          } else say("Não foi possível abrir a conversa.");
        }}
        draftFill={(text) => { setDraft(text); setOpen(false); }}
      />

      <header className="topbar">
        <button type="button" className="icon-btn" onClick={() => setOpen(true)} aria-label="Abrir menu">
          <IconMenu />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            const linhas = [`# SKYNET · ${new Date().toLocaleDateString("pt-BR")}`, ""];
            for (const m of messages) {
              if (!m.text?.trim()) continue;
              linhas.push(`## ${m.role === "assistant" ? "SKYNET" : "Você"} — ${new Date(m.ts || Date.now()).toLocaleString("pt-BR")}`);
              linhas.push(String(m.text).trim(), "");
            }
            if (linhas.length <= 2) { say("Nada para exportar nesta conversa ainda."); return; }
            const blob = new Blob([linhas.join("\n")], { type: "text/markdown" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `skynet-${new Date().toISOString().slice(0, 10)}.md`;
            a.click();
            URL.revokeObjectURL(a.href);
            say("Conversa exportada em Markdown.");
          }}
          aria-label="Exportar conversa"
          title="Exportar conversa em .md"
        >
          ↓
        </button>
        <a
          className={`icon-btn lem-sino${atrasados ? " tem-atraso" : ""}`}
          href="#/lembretes"
          aria-label={atrasados ? `${atrasados} lembrete(s) atrasado(s)` : "Lembretes"}
          title={atrasados ? `${atrasados} lembrete(s) atrasado(s)` : "Lembretes"}
        >
          ◷{atrasados ? <b className="lem-sino-n">{atrasados}</b> : null}
        </a>
        <button
          type="button"
          className={`motor${modelOpen ? " aberto" : ""}`}
          aria-label="Motor, modelo e habilidades do agente"
          aria-expanded={modelOpen}
          onClick={() => { setModelOpen((v) => !v); setPlusOpen(false); }}
        >
          <span className="motor-selo" aria-hidden="true" />
          <span className="motor-nome">SKYNET</span>
          <span className="motor-tag">{modo === "4.5" ? "agente" : "rápido"}</span>
          <span className="motor-modelo">{labelFor(model)}</span>
          <IconChevron className="chev" width={15} height={15} />
        </button>

        {modelOpen && (
          <div className="painel-motor" role="dialog" aria-label="Configuração do motor">
            <div className="pm-topo">
              <span className="pm-status">
                <i className="pm-dot" aria-hidden="true" />
                {tools.length} ferramentas · {habilidades.length || "…"} habilidades
              </span>
              <button type="button" className="pm-x" aria-label="Fechar" onClick={() => setModelOpen(false)}>✕</button>
            </div>

            <div className="pm-abas" role="tablist">
              {[["modo", "Modo"], ["modelo", "Modelo"], ["habilidades", `Habilidades${habilidades.length ? ` ${habilidades.length}` : ""}`]].map(([id, rotulo]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={abaMotor === id}
                  className={`pm-aba${abaMotor === id ? " on" : ""}`}
                  onClick={() => setAbaMotor(id)}
                >
                  {rotulo}
                </button>
              ))}
            </div>

            {abaMotor === "modo" && (
              <div className="pm-corpo">
                {[["4.0", "Chat simples", "Responde direto, sem ferramentas nem navegação."],
                  ["4.5", "Pro · agente", "Pesquisa, abre sites, gera imagem, clima e habilidades."]].map(([v, titulo, texto]) => (
                  <button
                    key={v}
                    type="button"
                    className={`pm-modo${modo === v ? " on" : ""}`}
                    onClick={() => { trocarModo(v); setModelOpen(false); }}
                  >
                    <b>{v}</b>
                    <span>
                      <strong>{titulo}</strong>
                      <small>{texto}</small>
                    </span>
                    {modo === v && <em>ativo</em>}
                  </button>
                ))}
              </div>
            )}

            {abaMotor === "modelo" && (
              <div className="pm-corpo pm-lista">
                {models.slice(0, 10).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`pm-item${m === model ? " on" : ""}`}
                    onClick={() => { setModel(m); setModelOpen(false); }}
                  >
                    <span className="pm-radio" aria-hidden="true" />
                    <span className="pm-item-txt">
                      <strong>{labelFor(m)}</strong>
                      <small>{m === "auto" || m === "melhor" ? "o roteador escolhe o provedor por latência" : m}</small>
                    </span>
                    {m === model && <em>ativo</em>}
                  </button>
                ))}
              </div>
            )}

            {abaMotor === "habilidades" && (
              <div className="pm-corpo">
                <input
                  className="pm-busca"
                  type="search"
                  value={habBusca}
                  onChange={(e) => setHabBusca(e.target.value)}
                  placeholder="buscar habilidade (cpf, cep, juros, qr code…)"
                  aria-label="Buscar habilidade"
                />
                <div className="pm-pacotes">
                  {["todos", ...Array.from(new Set(habilidades.map((h) => h.pacote)))].map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`pm-pacote${habPacote === p ? " on" : ""}`}
                      onClick={() => setHabPacote(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <div className="pm-habs">
                  {habilidades
                    .filter((h) => habPacote === "todos" || h.pacote === habPacote)
                    .filter((h) => !habBusca.trim() || `${h.nome} ${h.descricao} ${h.id}`.toLowerCase().includes(habBusca.trim().toLowerCase()))
                    .map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        className="pm-hab"
                        title={h.descricao}
                        onClick={() => { setDraft(`${h.exemplo}`); setModelOpen(false); }}
                      >
                        <strong>{h.nome}</strong>
                        <small>{h.descricao}</small>
                      </button>
                    ))}
                  {!habilidades.length && <p className="pm-vazio">carregando o catálogo…</p>}
                </div>
                <p className="pm-dica">Toque numa habilidade para levar o exemplo para o campo de mensagem.</p>
              </div>
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
          <section className="modo-barra" aria-label="Modo de operação">
            <div className="modo-switch">
              {[["4.0", "Chat simples"], ["4.5", "Pro · agente"]].map(([v, rotulo]) => (
                <button
                  key={v} type="button"
                  className={modo === v ? "ativo" : ""}
                  onClick={() => trocarModo(v)}
                  title={rotulo}
                >
                  <b>{v}</b><span>{rotulo}</span>
                </button>
              ))}
            </div>
            <span className="modo-nota">{modo === "4.5" ? "ferramentas e navegação liberadas" : "respostas rápidas, sem agente"}</span>
          </section>
        {messages.length === 0 ? (
          <section className="hero">
            <p className="hero-eyebrow">INTELIGÊNCIA OPERACIONAL · AO VIVO</p>
            <h1>O que vamos <span className="red">executar</span> agora?</h1>
            <p className="hero-sub">Pesquisa na web, sites, imagens, vídeo, clima, arquivos e widgets: o SKYNET faz e mostra o resultado aqui.</p>
            <div className="hero-cards">
              {actions.map(({ label, icon: Icon, color, desc }) => (
                <button
                  key={label}
                  type="button"
                  className="hero-card"
                  aria-haspopup="dialog"
                  onClick={() => (ACOES[label] ? setAcaoSheet(label) : setDraft(label))}
                >
                  <span className="hero-card-icone" style={{ color, borderColor: `${color}44`, background: `${color}14` }}>
                    <Icon width={18} height={18} />
                  </span>
                  <span className="hero-card-texto">
                    <b>{label}</b>
                    <small>{desc || "executar agora"}</small>
                  </span>
                  <span className="hero-card-seta" aria-hidden="true">→</span>
                </button>
              ))}
            </div>
            <p className="hero-dica">Enter envia · Shift+Enter quebra linha · tudo roda com o modelo escolhido pelo roteador do servidor</p>
          </section>
        ) : (
          <section className="thread">
            {busy && (
              <div className="ao-vivo-selo" aria-live="polite">
                <span className="ao-vivo-ponto" />
                AO VIVO · {segundosAoVivo}s
              </div>
            )}
            {messages.map((message, index) => (
              <article key={index} className={`bubble ${message.role}${message.image ? " with-img" : ""}`}>
                <div className="bubble-meta">
                  <span className={`bubble-quem ${message.role}`}>{message.role === "assistant" ? "SKYNET" : "Você"}</span>
                  <time>{message.ts ? new Date(message.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}</time>
                </div>
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
                    {message.role === "assistant" && message.passos && message.passos.length > 0 && (() => {
                      const viva = message.passos.some((p) => p.estado === "executando");
                      const feitas = message.passos.filter((p) => p.estado !== "executando").length;
                      const total = message.passos.length;
                      const pct = Math.round((feitas / total) * 100);
                      const segundos = message.passos.reduce((acc, p) => acc + (Number(p.ms) || 0), 0) / 1000;
                      const aberto = traceAberto[index] ?? viva;
                      return (
                        <div className={`trilha${viva ? " viva" : ""}`}>
                          <button
                            type="button"
                            className="trilha-topo"
                            aria-expanded={aberto}
                            onClick={() => setTraceAberto((v) => ({ ...v, [index]: !aberto }))}
                          >
                            <span className="trilha-aro" aria-hidden="true">
                              {viva ? <i className="trilha-pulso" /> : <b>{total}</b>}
                            </span>
                            <span className="trilha-resumo">
                              <b>{viva ? "Raciocinando" : "Raciocínio"}</b>
                              <small>
                                {viva ? `etapa ${Math.min(feitas + 1, total)} de ${total}` : `${total} etapa${total > 1 ? "s" : ""} · ${segundos.toFixed(1)}s`}
                              </small>
                            </span>
                            <span className="trilha-progresso" aria-hidden="true">
                              <i style={{ width: `${viva ? Math.max(pct, 8) : 100}%` }} />
                            </span>
                            <span className="trilha-seta" aria-hidden="true">{aberto ? "▾" : "▸"}</span>
                          </button>
                          {aberto && (
                            <ol className="trilha-passos">
                              {message.passos.map((p, i) => (
                                <li key={i} className={`trilha-passo ${p.estado}`}>
                                  <span className="trilha-marca" aria-hidden="true">
                                    <span className="trilha-icone">{ICONES_PASSO[p.ferramenta] || "•"}</span>
                                  </span>
                                  <div className="trilha-corpo">
                                    <div className="trilha-linha">
                                      <b>{p.titulo}</b>
                                      {p.ms ? <em className="trilha-tempo">{(p.ms / 1000).toFixed(1)}s</em> : null}
                                      {p.estado === "executando" ? <em className="trilha-tempo vivo">agora</em> : null}
                                      {p.estado === "falhou" ? <em className="trilha-tempo erro">falhou</em> : null}
                                    </div>
                                    {p.detalhe ? <p className="trilha-detalhe">{p.detalhe}</p> : null}
                                    {p.entrada ? <code className="trilha-codigo">{p.entrada}</code> : null}
                                    {p.saida ? <p className="trilha-saida">{p.saida}</p> : null}
                                    {p.estado === "falhou" && p.erro ? <p className="trilha-erro">{p.erro}</p> : null}
                                    {p.fontes && p.fontes.length > 0 && (
                                      <span className="fontes-chips">
                                        {p.fontes.map((f, j) => (
                                          <a key={j} href={f.url} target="_blank" rel="noopener noreferrer" className="fonte-chip" title={f.url}>
                                            <IconGlobe width={12} height={12} />
                                            <span>{f.titulo || f.url}</span>
                                          </a>
                                        ))}
                                      </span>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      );
                    })()}
                    {message.image && <img src={message.image} alt="imagem gerada" className="gen-img" />}
                    {message.anexos && message.anexos.length > 0 && (
                      <div className="bubble-prints">
                        {message.anexos.map((a, k) => (
                          <img key={k} src={a.url} alt={a.nome} onClick={() => window.open(a.url, "_blank")} />
                        ))}
                      </div>
                    )}
                    {message.clima && <ClimaCard dados={message.clima} />}
                    {message.permissao && (
                      <div className="perm-card">
                        <div className="perm-card-topo">
                          <strong>Autorização necessária</strong>
                          <span>{message.permissao.rotulo || message.permissao.ferramenta}</span>
                        </div>
                        <p>{message.permissao.resumo || "o SKYNET quer executar esta ação"}</p>
                        <div className="perm-card-acoes">
                          <button type="button" className="perm-ok" onClick={() => autorizarPermissao(message.permissao, true)}>
                            Autorizar e executar
                          </button>
                          <button type="button" className="perm-no" onClick={() => autorizarPermissao(message.permissao, false)}>
                            Negar
                          </button>
                          <a className="perm-link" href="#/permissoes">Permissões</a>
                        </div>
                      </div>
                    )}
                    {message.print && <NavegadorAoVivo alvo={message.print.alvo} inicial={message.print.url} provedor={message.print.provedor} />}
                    {message.devtool && (
                      <div className="dev-mini">
                        <div className="dev-mini-topo">
                          <b>{message.devtool.resumo || message.devtool.acao}</b>
                          <button
                            type="button"
                            onClick={() => {
                              const d = message.devtool;
                              const txt = d.saida ?? d.uuids?.join("\n") ?? d.iso ?? d.explicacao
                                ?? (d.camelCase ? `camel: ${d.camelCase}\nsnake: ${d.snake_case}\nkebab: ${d["kebab-case"]}\nPascal: ${d.PascalCase}` : "")
                                ?? JSON.stringify(d, null, 2);
                              navigator.clipboard?.writeText(String(txt));
                              say("Resultado copiado.");
                            }}
                          >
                            copiar
                          </button>
                        </div>
                        <pre className="dev-mini-saida">{
                          message.devtool.saida
                          ?? (message.devtool.uuids ?? []).join("\n")
                          ?? (message.devtool.explicacao ? `${message.devtool.expressao} → ${message.devtool.explicacao}` : null)
                          ?? (message.devtool.iso ? `${message.devtool.iso} · ${message.devtool.sao_paulo ?? ""}` : null)
                          ?? (message.devtool.hex ? `${message.devtool.hex} · ${message.devtool.rgb ?? ""} · ${message.devtool.hsl ?? ""}` : null)
                          ?? (message.devtool.mb ? `${message.devtool.mb} MB · ${message.devtool.gb} GB` : null)
                          ?? (message.devtool.camelCase ? `camelCase: ${message.devtool.camelCase}\nsnake_case: ${message.devtool.snake_case}\nkebab-case: ${message.devtool["kebab-case"]}\nPascalCase: ${message.devtool.PascalCase}` : null)
                          ?? (message.devtool.palavras !== undefined ? `${message.devtool.palavras} palavras · ${message.devtool.caracteres} caracteres · ${message.devtool.linhas} linha(s)` : null)
                          ?? JSON.stringify(message.devtool, null, 2)
                        }</pre>
                      </div>
                    )}
                    {message.lembrete && (
                      <a className="lem-mini" href="#/lembretes">
                        <span className="lem-mini-ico" aria-hidden="true">◷</span>
                        <span className="lem-mini-txt">
                          <b>{message.lembrete.titulo}</b>
                          <small>
                            {message.lembrete.quando
                              ? new Date(message.lembrete.quando).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                              : "sem horário"}
                            {" · abrir lembretes →"}
                          </small>
                        </span>
                      </a>
                    )}
                    {message.widgetCriado && (
                      <a className="criado-card" href="#/widgets">
                        <b>{message.widgetCriado.salvo ? "Widget salvo no painel" : "Widget pronto"}</b>
                        <span>{message.widgetCriado.titulo}</span>
                        <em>
                          {message.widgetCriado.salvo
                            ? `Abrir painel (${message.widgetCriado.total}) →`
                            : "Abrir painel →"}
                        </em>
                      </a>
                    )}
                    {message.arquivo && (
                      <div className="arq-card">
                        <div>
                          <b>{message.arquivo.nome}</b>
                          <span>{new Blob([message.arquivo.conteudo ?? ""]).size} bytes · {message.arquivo.mime}</span>
                        </div>
                        <button type="button" onClick={() => {
                          const blob = new Blob([message.arquivo.conteudo ?? ""], { type: message.arquivo.mime || "text/plain" });
                          const a = document.createElement("a");
                          a.href = URL.createObjectURL(blob);
                          a.download = message.arquivo.nome;
                          a.click();
                          URL.revokeObjectURL(a.href);
                        }}>Baixar</button>
                      </div>
                    )}
                    {message.midia && message.midia.embed && (
                      <MediaPlayer
                        compacto
                        provedor={message.midia.provedor}
                        url={message.midia.url}
                        embed={message.midia.embed}
                        titulo={message.midia.titulo}
                        aviso={message.midia.aviso}
                      />
                    )}
                    {message.image && !message.text ? null : (
                      separarArtefatos(message.text || "").map((parte, pi) =>
                        parte.tipo === "artefato" ? (
                          <Artefato key={"a" + pi} spec={parte.spec} />
                        ) : (
                          <RichText
                            key={"t" + pi}
                            texto={parte.conteudo}
                            vivo={busy && index === messages.length - 1 && message.role === "assistant"}
                          />
                        )
                      )
                    )}
                    {(message.artefatos || (message.artefato ? [message.artefato] : [])).map((spec, ai) => (
                      <Artefato key={"art" + ai} spec={spec} />
                    ))}
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
                      {message.role === "assistant" && message.text && (
                        <button type="button" onClick={async () => { say("Gerando voz local…"); const r = await voz.falar(message.text); say(r.ok ? `Falando (${r.motor}).` : `Voz indisponível: ${r.erro}`); }}>Ouvir</button>
                      )}
                    </span>
                  </>
                )}
              </article>
            ))}
            {busy && messages[messages.length - 1]?.text === "" && !messages[messages.length - 1]?.toolStatus && (
              <article className="bubble assistant typing-bubble" aria-live="polite">
                <span className="tb-pontos" aria-hidden="true"><i /><i /><i /></span>
                <em>SKYNET está escrevendo</em>
              </article>
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

      {messages.length > 0 && !ehDev && (
        <Link to="/account?tab=assinatura" className="pro-link">Assinar SKYNETchat PRO →</Link>
      )}
      {ehDev && (
        <div className="dev-selo" title="Conta de desenvolvedor: sem limites e com todas as ferramentas liberadas">
          DEV · sem limites
        </div>
      )}

      {limitHit && !ehDev && (
        <div className="limit-modal" role="dialog">
          <div className="limit-card">
            <h3>Seu limite diário acabou</h3>
            <p>Continue exatamente de onde parou. Sem cortes. Sem limites. Do jeito que você quer.</p>
            <Link to="/account?tab=assinatura" className="limit-cta" onClick={() => setLimitHit(false)}>Continuar sem limites →</Link>
            <button type="button" className="limit-alt" onClick={() => setLimitHit(false)}>Já tenho acesso</button>
          </div>
        </div>
      )}

      <AcaoSheet acao={acaoSheet} onFechar={fecharSheet} onEnviar={enviarTexto} />

      <div className="barra-agente">
        <button type="button" onClick={() => { window.location.hash = "#/ferramentas"; }}>
          {resumoComportamento(lerConfig())}
        </button>
        <span className="barra-sep">·</span>
        <span>{lerConfig().memoriaAtiva ? `${lerMemoria().length} memórias` : "memória off"}</span>
        <span className="barra-sep">·</span>
        <span>{lerArquivo().length} no arquivo</span>
      </div>
      <form className="dock" onSubmit={enviar}>
        {prints.length > 0 && (
          <div className="dock-prints">
            {prints.map((p2, i) => (
              <span key={i} className="print-chip">
                <img src={p2.url} alt={p2.nome} />
                <button type="button" aria-label="remover" onClick={() => setPrints((l) => l.filter((_, k) => k !== i))}>×</button>
              </span>
            ))}
            <small>{prints.length} print(s) · toque em enviar</small>
          </div>
        )}
        <div className="plus-wrap">
          <button type="button" className="dock-plus" aria-label="Mais" onClick={() => { setPlusOpen((v) => !v); setModelOpen(false); }}><IconPlus /></button>
          {plusOpen && (
            <div className="plus-menu">
              <button type="button" onClick={() => { setPlusOpen(false); fileRef.current?.click(); }}>📎 Anexar print ou arquivo</button>
              <button type="button" onClick={() => { setPlusOpen(false); setAcaoSheet("Gerar uma imagem"); }}>🖼 Criar imagem</button>
              <button type="button" onClick={() => { setPlusOpen(false); window.location.hash = "#/ferramentas"; }}>🧪 Ferramentas do agente</button>
              <button type="button" onClick={() => { setPlusOpen(false); setAcaoSheet("Pesquisar na web agora"); }}>💡 Pensar</button>
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
        <input ref={fileRef} type="file" hidden onChange={onFile} accept="image/*,.txt,.md,.json,.csv,.js,.ts,.tsx,.py,.html,.css,.log,.yml,.yaml" />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={PLACEHOLDERS[ph]}
          aria-label="Mensagem"
        />
        {listening ? (
          <span className="rec-ui" aria-label="Gravando áudio">
            <b className="rec-dot" /><span className="rec-time">{String(Math.floor(micSecs / 60)).padStart(2, "0")}:{String(micSecs % 60).padStart(2, "0")}</span>
            <button type="button" className="rec-x" onClick={() => { micRef.current?.cancelar?.(); stopMic(); say("Gravação cancelada."); }} aria-label="Cancelar gravação">✕</button>
          </span>
        ) : (
          <button type="button" className="icon-btn muted" aria-label="Gravar áudio" onClick={toggleMic}><IconMic /></button>
        )}
        <button type="submit" className="dock-send" aria-label="Voz ou enviar"><IconWave width={22} height={22} /></button>
      </form>

      <Paleta
        aberta={paleta}
        aoFechar={() => setPaleta(false)}
        aoEscolher={aoEscolherPaleta}
        conversa={messages.length}
      />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
