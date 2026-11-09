import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MediaPlayer from "../media.jsx";
import { FavReal, Marca, marcaDe } from "../marcas.jsx";
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
import { guardarDossie, lerArquivo, removerDossie, specDoArquivo } from "../historico.js";
import { resumoComportamento } from "../comportamento.js";
import { agentGet, askOnce, runTool } from "../lib.js";
import { ajudaComandos, parseCommand } from "../commands.js";
import { chatModels, labelFor } from "../models.js";
import * as voz from "../voz.js";
import RichText from "../rich.jsx";
import { Artefato, montarArtefato, resumoDoArtefato, separarArtefatos } from "../artefatos.jsx";
import { lerConfig, assinarConfig } from "../agente-config.js";
import Paleta from "../components/Paleta.jsx";
import { Logotipo, Simbolo, aplicarFavicon } from "../components/Marca.jsx";
import AcoesMensagem from "../components/AcoesMensagem.jsx";
import AnexosSheet from "../components/AnexosSheet.jsx";
import PreviaAnexos from "../components/PreviaAnexos.jsx";
import IndicadorProcesso from "../components/IndicadorProcesso.jsx";
import { Lightbox } from "../widgets/avancado.jsx";
import Traco from "../components/Traco.jsx";
import { ActivityTimeline, SourcesPanel, StreamingStatus, GenerationControls, ResponseStream } from "../components/Streaming.jsx";
import { criarGerenciador, resumoSeguro as resumoDasAtividades } from "../eventos.js";
import { aplicarEvento, codigoNoDelta, encerrarTraco, grupoDoTool, linksNoTexto, tracoVazio } from "../traco.js";
import { apagarRascunho, densidadeSalva, guardarDensidade, guardarRascunho, lerRascunho } from "../habilidades.js";
import GravacaoAudio, { OndaSonora } from "../components/GravacaoAudio.jsx";
import { iniciarGravacao, duracaoLegivel } from "../gravador.js";
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

const tamanhoLegivel = (bytes = 0) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
};

export default function Home() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("Novo chat");
  const [draft, setDraft] = useState("");
  const [prints, setPrints] = useState([]);
  const [anexosOpen, setAnexosOpen] = useState(false);
  const [expandido, setExpandido] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [niveis, setNiveis] = useState([]);
  const [audioUrl, setAudioUrl] = useState(null);
  const [fase, setFase] = useState("pensando");
  const [zoom, setZoom] = useState(null);
  const [densidade, setDensidade] = useState(() => densidadeSalva());
  const [rascunhoSalvo, setRascunhoSalvo] = useState(null);

  // fase exibida no indicador: imagem, documento ou o estágio do pedido
  const faseFinal = () => {
    if (prints.some((p) => /^image\//.test(p.tipo || ""))) return "imagem";
    if (prints.some((p) => !/^image\//.test(p.tipo || ""))) return "documento";
    return fase;
  };
  const [enviandoAnim, setEnviandoAnim] = useState(false);
  const canceladoRef = useRef(false);
  const audioBlobRef = useRef(null);
  const gravadorRef = useRef(null);
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
  const gerenteRef = useRef(null); // um gerenciador de eventos por geração
  const lendoAntigoRef = useRef(false);

  const say = useCallback((m) => { setToast(m); setTimeout(() => setToast(""), 5000); }, []);

  // sugestões dos artefatos caem no campo de texto (sem enviar sozinho)
  useEffect(() => {
    const aoSugerir = (ev) => {
      const bruto = ev?.detail;
      const texto = typeof bruto === "string" ? bruto : bruto?.texto;
      if (!texto) return;
      setDraft((d) => (d ? `${d}\n${texto}` : texto));
      document.querySelector('.dock input[aria-label="Mensagem"], .dock textarea')?.focus();
    };
    window.addEventListener("skynet:sugestao", aoSugerir);
    return () => window.removeEventListener("skynet:sugestao", aoSugerir);
  }, []);
  useEffect(() => { const t = setInterval(() => setPh((p) => (p + 1) % PLACEHOLDERS.length), 6000); return () => clearInterval(t); }, []);
  // o indicador caminha sozinho: análise → geração
  useEffect(() => {
    if (!busy) return undefined;
    const t = setTimeout(() => setFase((f) => (f === "imagem" || f === "documento" || f === "pesquisa" ? "gerando" : f)), 3200);
    return () => clearTimeout(t);
  }, [busy]);
  // rascunho: recupera o que ficou pela metade e guarda enquanto digita
  useEffect(() => {
    const salvo = lerRascunho();
    if (salvo) setRascunhoSalvo(salvo);
  }, []);

  const jaDigitou = useRef(false);
  useEffect(() => {
    // a primeira passada só lê o rascunho antigo; não pode apagá-lo antes do uso
    if (!jaDigitou.current) { jaDigitou.current = true; return undefined; }
    const t = setTimeout(() => guardarRascunho(draft), 700);
    return () => clearTimeout(t);
  }, [draft]);

  // densidade da conversa
  useEffect(() => {
    document.documentElement.dataset.densidade = densidade;
    guardarDensidade(densidade);
  }, [densidade]);

  // dossiê aberto a partir do Arquivo (#/?dossie=ID)
  useEffect(() => {
    const abrirDossieDoHash = () => {
      const m = window.location.hash.match(/dossie=([a-z0-9_]+)/i);
      if (!m) return;
      const item = lerArquivo().find((d) => d.id === m[1]);
      history.replaceState(null, "", window.location.pathname + window.location.search + "#/");
      if (!item) return;
      const spec = specDoArquivo(item);
      if (!spec) return;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", mid: "arq" + item.id, text: `Reabri do arquivo: **${item.titulo}** (${item.fontes} fontes).`, artefatos: [spec], started: Date.now() },
      ]);
      say("Dossiê reaberto a partir do arquivo.");
    };
    abrirDossieDoHash();
    window.addEventListener("hashchange", abrirDossieDoHash);
    return () => window.removeEventListener("hashchange", abrirDossieDoHash);
  }, [say]);

  useEffect(() => { aplicarFavicon(document.documentElement.dataset.theme === "white" ? "#b91c1c" : "#ef4444"); }, []);

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


  const pertoDoFim = () => {
    const el = stageRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };

  useEffect(() => {
    // só rola quando existe conversa: no estado vazio isso cortava o topo do hero
    if (!messages.length) return;
    // respeita quem subiu para ler mensagens anteriores: nada de puxar a tela de volta
    if (lendoAntigoRef.current) return;
    stageRef.current?.scrollTo({ top: stageRef.current.scrollHeight });
  }, [messages, busy]);

  // relógio do "ao vivo": conta enquanto uma resposta está sendo produzida
  useEffect(() => {
    if (!busy) { setSegundosAoVivo(0); return undefined; }
    const t = setInterval(() => setSegundosAoVivo((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const pararGeracao = useCallback(() => {
    canceladoRef.current = true;
    setBusy(false);
    setFase("pensando");
    say("Geração interrompida. O que já chegou continua na conversa.");
  }, [say]);

  const continuarGeracao = useCallback(() => {
    say("Retomando de onde parou…");
    send(null, "Continue a resposta anterior exatamente de onde parou, sem repetir o que já foi dito.");
  }, [say, send]);

  const send = useCallback(async (event, textoDireto, opcoes = {}) => {
    if (event) event.preventDefault();
    const text = (typeof textoDireto === "string" ? textoDireto : draft).trim();
    const anexos = prints.slice();
    if ((!text && !anexos.length) || busy) return;
    setDraft("");
    setPrints([]);
    apagarRascunho();
    setRascunhoSalvo(null);
    const mid = "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setMessages((prev) => [
      ...prev,
      { role: "user", text, anexos },
      {
        role: "assistant",
        mid,
        text: "",
        started: Date.now(),
        passos: [],
        traco: aplicarEvento(tracoVazio(), { tipo: "abrir", chave: "pensando", detalhe: "lendo o pedido" }),
      },
    ]);
    gerenteRef.current = criarGerenciador();
    setBusy(true);
    canceladoRef.current = false;
    setFase(anexos.some((a) => /^image\//.test(a.tipo || "")) ? "imagem"
      : anexos.some((a) => !/^image\//.test(a.tipo || "")) ? "documento"
      : /pesquis|not[ií]cia|fonte|site|internet|v[ií]deo/i.test(text) ? "pesquisa" : "gerando");

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
      onEvento: (ev) => {
        const g = gerenteRef.current;
        if (!g) return;
        const est = g.aplicar(ev);
        // deltas de texto e de resumo já entram pelos handlers dedicados:
        // aqui só atualizamos o que é estrutural (etapas, fontes, fase)
        if (/output_text\.delta$|reasoning_summary_text\.delta$|function_call_arguments\.delta$|code_interpreter_call\.code_delta$/.test(String(ev?.type || ""))) return;
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (!last || last.role !== "assistant") return prev;
          copy[copy.length - 1] = {
            ...last,
            fase: est.fase,
            atividades: est.atividades,
            resumoAtividades: resumoDasAtividades(est),
            fontes: est.fontes.length ? est.fontes : last.fontes,
            erroStream: est.erro || null,
            incompleto: est.fase === "incompleto",
          };
          return copy;
        });
      },
      onTool: (bruto) => setMessages((prev) => {
        // o backend às vezes manda o passo dentro de { tool: {...} }
        const toolEv = bruto && typeof bruto.tool === "object" && bruto.tool !== null ? bruto.tool : bruto || {};
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

        let traco = last.traco || tracoVazio();
        const grupoDoPasso = grupoDoTool(toolEv.tool || toolEv.titulo || "");
        traco = aplicarEvento(traco, {
          tipo: toolEv.status === "falhou" ? "erro" : toolEv.status === "executando" ? "abrir" : "fechar",
          chave: grupoDoPasso,
          detalhe: toolEv.detalhe || toolEv.titulo || toolEv.tool || "",
        });
        for (const f of (Array.isArray(toolEv.fontes) ? toolEv.fontes.slice(0, 8) : [])) {
          traco = aplicarEvento(traco, { tipo: "item", chave: "fontes", item: { titulo: f.titulo, url: f.url, dominio: f.domain } });
        }

        copy[copy.length - 1] = {
          ...last,
          passos,
          traco,
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
        let traco = last.traco || tracoVazio();
        traco = aplicarEvento(traco, { tipo: "abrir", chave: "arquivos", detalhe: "arquivo recebido do agente" });
        traco = aplicarEvento(traco, { tipo: "item", chave: "arquivos", item: { titulo: arq?.nome || "arquivo", tamanho: arq?.conteudo ? String(arq.conteudo).length : 0 } });
        traco = aplicarEvento(traco, { tipo: "fechar", chave: "arquivos" });
        copy[copy.length - 1] = { ...last, arquivo: arq, traco };
        return copy;
      }),
      onReason: (texto) => setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (!last || last.role !== "assistant" || !texto) return prev;
        copy[copy.length - 1] = {
          ...last,
          raciocinio: ((last.raciocinio || "") + texto).slice(-4000),
          traco: aplicarEvento(last.traco || tracoVazio(), { tipo: "texto", chave: "pensando", texto }),
        };
        return copy;
      }),
      onDelta: (delta) => setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (!last || last.role !== "assistant") return prev;
        let traco = last.traco || tracoVazio();
        traco = aplicarEvento(traco, { tipo: "texto", chave: "gerando", texto: delta });
        traco = codigoNoDelta(traco, delta);
        copy[copy.length - 1] = { ...last, text: last.text + delta, traco };
        return copy;
      }),
      onDone: (info) => {
        if (info.conversationId) convIdRef.current = info.conversationId;
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant") {
            let traco = last.traco || tracoVazio();
            traco = linksNoTexto(traco, last.text || "");
            const est = gerenteRef.current?.ler();
            copy[copy.length - 1] = {
              ...last,
              secs: Math.max(1, Math.round((Date.now() - (last.started ?? Date.now())) / 1000)),
              toolStatus: last.toolStatus === "executando" ? "concluida" : last.toolStatus,
              traco: encerrarTraco(traco),
              fase: est?.fase || last.fase,
              fontes: est?.fontes?.length ? est.fontes : last.fontes,
              atividades: est?.atividades?.length ? est.atividades : last.atividades,
              resumoAtividades: est ? resumoDasAtividades(est) : last.resumoAtividades,
              erroStream: null,
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
          if (last && last.role === "assistant") {
            copy[copy.length - 1] = {
              ...last,
              text: aviso,
              local: true,
              traco: encerrarTraco(aplicarEvento(last.traco || tracoVazio(), { tipo: "erro", chave: "gerando", detalhe: "servidor sem resposta · montando local" })),
            };
          }
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
    if (gravando) return;
    if (!navigator.mediaDevices?.getUserMedia) { say("Este navegador não dá acesso ao microfone."); return; }
    try {
      const g = await iniciarGravacao({ onNivel: (n) => setNiveis((l) => [...l, n].slice(-28)) });
      gravadorRef.current = g;
      setGravando(true);
      setPausado(false);
      setNiveis([]);
      setMicSecs(0);
      clearInterval(micTimer.current);
      micTimer.current = setInterval(() => setMicSecs((v) => v + 1), 1000);
    } catch {
      say("Não consegui abrir o microfone. Verifique a permissão do navegador.");
    }
  };

  const pararGravacao = async () => {
    const g = gravadorRef.current;
    if (!g) return;
    clearInterval(micTimer.current);
    const blob = await g.parar();
    gravadorRef.current = null;
    setGravando(false);
    setPausado(false);
    audioBlobRef.current = blob;
    setAudioUrl(URL.createObjectURL(blob));
    say("Ouça antes de usar ou descarte.");
  };

  const cancelarGravacao = () => {
    gravadorRef.current?.cancelar();
    gravadorRef.current = null;
    clearInterval(micTimer.current);
    setGravando(false);
    setPausado(false);
    setNiveis([]);
    setAudioUrl(null);
    audioBlobRef.current = null;
    say("Gravação cancelada.");
  };

  const descartarAudio = () => {
    setAudioUrl(null);
    audioBlobRef.current = null;
  };

  const usarAudio = async () => {
    const blob = audioBlobRef.current;
    if (!blob) return;
    setAudioUrl(null);
    say("Transcrevendo o áudio…");
    try {
      const pcm = await voz.audioParaFloat32(blob);
      const texto = await voz.transcrever(pcm);
      if (texto) { setDraft((cur) => (cur ? `${cur} ` : "") + texto); say("Transcrito. Ajuste e envie."); }
      else say("Não entendi o áudio. Tente de novo mais perto do microfone.");
    } catch {
      say("Não consegui transcrever agora. O áudio segue disponível para anexar.");
      setPrints((p) => (p.length >= 8 ? p : [...p, { url: URL.createObjectURL(blob), nome: "audio.webm", tipo: blob.type || "audio/webm", tamanho: blob.size }]));
    } finally {
      audioBlobRef.current = null;
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
  const [arrastando, setArrastando] = useState(false);
  const onFileRef = useRef(null);

  // arrastar e soltar: mesma rotina do botão de anexo
  const aoSoltar = useCallback((ev) => {
    ev.preventDefault();
    setArrastando(false);
    const arquivos = [...(ev.dataTransfer?.files || [])];
    if (!arquivos.length) return;
    arquivos.slice(0, 8).forEach((f) => {
      const falso = { target: { files: [f], value: "" } };
      onFileRef.current?.(falso);
    });
    say(`${arquivos.length} arquivo(s) recebido(s).`);
  }, [say]);
  // anexos: uma rotina só, com limites de tamanho e quantidade
  const receberArquivos = useCallback(async (lista) => {
    const arquivos = [...(lista || [])];
    if (!arquivos.length) return;
    const vagas = Math.max(0, 8 - prints.length);
    if (!vagas) { say("Limite de 8 anexos por mensagem."); return; }
    const aceitos = arquivos.slice(0, vagas);
    if (arquivos.length > vagas) say(`Só cabem mais ${vagas} anexo(s) nesta mensagem.`);
    for (const f of aceitos) {
      const ehImagem = /^image\//.test(f.type);
      if (ehImagem) {
        if (f.size > 40 * 1024 * 1024) { say(`"${f.name}" passa de 40 MB.`); continue; }
        try {
          const url = await redimensionar(f, 1400);
          setPrints((p) => (p.length >= 8 ? p : [...p, { url, nome: f.name || `print-${p.length + 1}.png`, tipo: f.type || "image/png", tamanho: f.size }]));
        } catch { say(`Não consegui abrir "${f.name}".`); }
        continue;
      }
      if (f.size > 20 * 1024 * 1024) { say(`"${f.name}" passa de 20 MB.`); continue; }
      const texto = /^text\//.test(f.type) || /\.(txt|md|json|csv|log|yml|yaml|js|ts|tsx|py|html|css)$/i.test(f.name);
      if (texto) {
        try {
          const conteudo = await f.text();
          setPrints((p) => [...p, { url: "", nome: f.name, tipo: f.type || "text/plain", tamanho: f.size }]);
          setDraft((d) => `${d}${d ? "\n\n" : ""}Arquivo "${f.name}":\n${conteudo.slice(0, 120000)}\n`);
          say(`"${f.name}" anexado e lido.`);
          continue;
        } catch { /* cai no aviso abaixo */ }
      }
      // PDF, doc, planilha: fica como anexo identificado, sem inventar leitura
      setPrints((p) => [...p, { url: "", nome: f.name, tipo: f.type || "application/octet-stream", tamanho: f.size }]);
      say(`"${f.name}" anexado. Esse formato não é lido inteiro aqui, mas o nome e o tipo vão junto no pedido.`);
    }
  }, [prints.length, say]);

  const aoColar = useCallback((ev) => {
    const arquivos = [...(ev.clipboardData?.files || [])];
    if (!arquivos.length) return;
    ev.preventDefault();
    receberArquivos(arquivos);
  }, [receberArquivos]);

  const onFile = useCallback(async (event) => {
    const arquivos = [...(event.target.files || [])];
    event.target.value = "";
    await receberArquivos(arquivos);
  }, [receberArquivos]);
  onFileRef.current = onFile;

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

  const [opcoesOpen, setOpcoesOpen] = useState(false);

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

      <header className="topbar m-top">
        <button type="button" className="icon-btn" onClick={() => setOpen(true)} aria-label="Histórico e menu">
          <IconMenu />
        </button>

        <div className="m-brand">
          <Simbolo tamanho={17} cor="var(--red)" />
          <Logotipo tamanho={17} />
          <span className="m-brand-tag">{modo === "4.5" ? "agente" : "rápido"}</span>
        </div>

        <div className="m-top-acoes">
          <button type="button" className="icon-btn" onClick={() => pick("Novo chat")} aria-label="Nova conversa" title="Nova conversa">
            <IconEdit />
          </button>
          <button
            type="button"
            className={`icon-btn m-opcoes${opcoesOpen ? " on" : ""}`}
            onClick={() => setOpcoesOpen((v) => !v)}
            aria-label="Opções"
            aria-expanded={opcoesOpen}
          >
            <span aria-hidden="true">⋯</span>
          </button>
        </div>

        {opcoesOpen && (
          <>
            <button type="button" className="m-sheet-fundo" aria-label="Fechar opções" onClick={() => setOpcoesOpen(false)} />
            <div className="m-sheet" role="dialog" aria-label="Opções do app">
              <div className="m-sheet-topo">
                <b>Opções</b>
                <button type="button" className="m-sheet-x" onClick={() => setOpcoesOpen(false)} aria-label="Fechar">✕</button>
              </div>
              <button type="button" className="m-sheet-item" onClick={() => { setOpcoesOpen(false); setModelOpen(true); }}>
                <span>Motor e modelo</span>
                <small>{labelFor(model)} · {modo === "4.5" ? "Pro · agente" : "chat simples"}</small>
              </button>
              <button type="button" className="m-sheet-item" onClick={() => { setOpcoesOpen(false); exportarConversa(); }}>
                <span>Exportar conversa</span>
                <small>baixar em .md</small>
              </button>
              <a className={`m-sheet-item${atrasados ? " alerta" : ""}`} href="#/lembretes" onClick={() => setOpcoesOpen(false)}>
                <span>Lembretes</span>
                <small>{atrasados ? `${atrasados} atrasado(s)` : "o que o chat anotou"}</small>
              </a>
              <a className="m-sheet-item" href="#/ferramentas" onClick={() => setOpcoesOpen(false)}>
                <span>Ferramentas do agente</span>
                <small>fontes, memória, habilidades</small>
              </a>
              <button
                type="button"
                className="m-sheet-item"
                onClick={() => {
                  const next = document.documentElement.dataset.theme === "white" ? "black" : "white";
                  document.documentElement.dataset.theme = next;
                  localStorage.setItem("skynet-theme-bg", next);
                  setOpcoesOpen(false);
                }}
              >
                <span>Tema</span>
                <small>{document.documentElement.dataset.theme === "white" ? "claro" : "escuro"} · toque para alternar</small>
              </button>
              <Link to="/account?tab=assinatura" className="m-sheet-item destaque" onClick={() => setOpcoesOpen(false)}>
                <span>Assinar PRO</span>
                <small>sem limites diários</small>
              </Link>
              {logged && (
                <button type="button" className="m-sheet-item" onClick={() => { setOpcoesOpen(false); abrirSino(); }}>
                  <span>Notificações</span>
                  <small>{unread > 0 ? `${unread} nova(s)` : "nada por aqui"}</small>
                </button>
              )}
            </div>
          </>
        )}
      </header>

      <main
        className={"stage" + (arrastando ? " stage-arrastando" : "")}
        ref={stageRef}
        onScroll={() => { lendoAntigoRef.current = !pertoDoFim(); }}
        onDragOver={(e) => { e.preventDefault(); if (!arrastando) setArrastando(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setArrastando(false); }}
        onDrop={aoSoltar}
      >
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
                  {message.role === "assistant" && message.fase && message.fase !== "ocioso" && (
                    <StreamingStatus
                      fase={message.fase}
                      segundos={message.secs || 0}
                      erro={message.erroStream}
                      incompleto={message.incompleto}
                    />
                  )}
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
                    {message.role === "assistant" && message.atividades && message.atividades.length > 0 && (
                      <ActivityTimeline
                        atividades={message.atividades}
                        resumo={message.resumoAtividades}
                        aoAbrirFonte={(item) => {
                          const fonte = (message.fontes || []).find((f) => f.url === item.url);
                          if (fonte) window.open(fonte.url, "_blank", "noopener");
                        }}
                      />
                    )}
                    {message.role === "assistant" && !(message.atividades && message.atividades.length) && message.traco && message.traco.ordem.length > 0 && (
                      <Traco
                        traco={message.traco}
                        aoVivo={busy && index === messages.length - 1 && !message.traco.fim}
                      />
                    )}
                    {message.role === "assistant" && message.passos && message.passos.length > 0 && !(message.traco && message.traco.ordem && message.traco.ordem.length > 0) && (() => {
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
                                    <span className="trilha-icone">
                                      {(() => {
                                        const marca = marcaDe(`${p.ferramenta || ""} ${p.titulo || ""} ${p.detalhe || ""}`);
                                        return marca ? <Marca slug={marca} size={13} /> : (ICONES_PASSO[p.ferramenta] || "•");
                                      })()}
                                    </span>
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
                                            <FavReal url={f.url} titulo={f.titulo} size={13} />
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
                        {message.anexos.map((a, k) => {
                          const imagem = /^image\//.test(a.tipo || "") || (a.url || "").startsWith("data:image");
                          if (!imagem) {
                            return (
                              <span className="bubble-arquivo" key={k}>
                                <b>{a.nome || "arquivo"}</b>
                                <small>{a.tamanho ? tamanhoLegivel(a.tamanho) : (a.tipo || "").split("/")[1] || "anexo"}</small>
                                {a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer">abrir</a> : null}
                              </span>
                            );
                          }
                          return (
                            <button
                              type="button"
                              className="bubble-print"
                              key={k}
                              aria-label={`ampliar ${a.nome || "print"}`}
                              onClick={() => setZoom({ url: a.url, alt: a.nome, nome: a.nome })}
                            >
                              <img src={a.url} alt={a.nome} loading="lazy" />
                            </button>
                          );
                        })}
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
                          <ResponseStream
                            key={"t" + pi}
                            vivo={message.role === "assistant" && busy && index === messages.length - 1}
                            incompleto={Boolean(message.incompleto || message.erroStream)}
                          >
                            <RichText
                              texto={parte.conteudo}
                              vivo={false}
                              fontes={message.fontes}
                            />
                          </ResponseStream>
                        )
                      )
                    )}
                    {(message.artefatos || (message.artefato ? [message.artefato] : [])).map((spec, ai) => (
                      <Artefato key={"art" + ai} spec={spec} />
                    ))}
                    {message.role === "assistant" && message.fontes && message.fontes.length > 0 && message.fontes[0].indice && (
                      <SourcesPanel fontes={message.fontes} />
                    )}
                    {message.role === "assistant" && message.fontes && message.fontes.length > 0 && !message.fontes[0].indice && (
                      <div className="tool-fontes">
                        <div className="fontes-chips">
                          {message.fontes.map((f, i) => (
                            <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="fonte-chip" title={f.titulo}>
                              <FavReal url={f.url} titulo={f.titulo} size={13} />
                              <span>{f.titulo || f.url}</span>
                            </a>
                          ))}
                        </div>
                        {message.toolQuando && (
                          <span className="fontes-nota">dados obtidos em {formatHora(message.toolQuando)}</span>
                        )}
                      </div>
                    )}
                    {message.role === "assistant" && busy && index === messages.length - 1 && (
                      <GenerationControls gerando aoParar={pararGeracao} />
                    )}
                    {message.role === "assistant" && !busy && (message.erroStream || message.incompleto) && (
                      <GenerationControls
                        podeContinuar
                        aoContinuar={continuarGeracao}
                        aoCopiar={() => { navigator.clipboard?.writeText(message.text || ""); say("Resposta copiada."); }}
                        aoRegenerar={() => { setDraft(String(message.text || "").slice(0, 200)); say("Trecho no campo para ajustar."); }}
                      />
                    )}
                    <span className="bubble-actions">
                      {message.secs ? <small className="worked">Trabalhou por {message.secs}s</small> : null}
                      {message.role === "user" && !busy && <button type="button" onClick={() => comecarEdicao(index)}>Editar</button>}
                      {!busy && (
                        <AcoesMensagem
                          id={`m${message.id || index}`}
                          texto={message.text}
                          papel={message.role}
                          say={say}
                          aoRegenerar={message.role === "assistant" ? () => {
                            const anterior = [...messages].slice(0, index).reverse().find((m) => m.role === "user");
                            if (anterior?.text) { setDraft(anterior.text); say("Pedido de volta no campo. Ajuste e envie."); }
                          } : null}
                        />
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
        <button
          type="button"
          className="barra-densidade"
          title="densidade da conversa"
          onClick={() => setDensidade((d) => (d === "confortavel" ? "compacta" : d === "compacta" ? "ampla" : "confortavel"))}
        >
          {densidade === "compacta" ? "compacta" : densidade === "ampla" ? "ampla" : "confortável"}
        </button>
      </div>
      {rascunhoSalvo && !draft.trim() && !busy ? (
        <div className="rascunho-faixa">
          <span>rascunho de {new Date(rascunhoSalvo.quando).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          <b>{rascunhoSalvo.texto.slice(0, 68)}{rascunhoSalvo.texto.length > 68 ? "…" : ""}</b>
          <button type="button" onClick={() => { setDraft(rascunhoSalvo.texto); setRascunhoSalvo(null); }}>usar</button>
          <button type="button" className="ghost" onClick={() => { apagarRascunho(); setRascunhoSalvo(null); }}>descartar</button>
        </div>
      ) : null}
      {(busy || gravando) && (
        <IndicadorProcesso fase={gravando ? "documento" : faseFinal()} segundos={segundosAoVivo} />
      )}
      <form className="dock m-dock" onSubmit={enviar}>
        <PreviaAnexos
          itens={prints}
          aoAbrir={(item) => {
            const imagem = /^image\//.test(item.tipo || "") || (item.url || "").startsWith("data:image");
            if (imagem && item.url) setZoom({ url: item.url, alt: item.nome, nome: item.nome });
            else if (item.url) window.open(item.url, "_blank", "noopener");
          }}
          aoRemover={(i) => setPrints((l) => l.filter((_, k) => k !== i))}
        />
        <div className="m-tools" role="toolbar" aria-label="Pesquisa e recursos">
          <button type="button" className="m-tool" onClick={() => setAcaoSheet("Pesquisar na web agora")}>🔍 Pesquisar web</button>
          <button type="button" className="m-tool" onClick={() => setAcaoSheet("Gerar uma imagem")}>🖼 Criar imagem</button>
          <button type="button" className="m-tool" onClick={() => setDraft("Investigue com atenção: ")}>🔎 Investigar</button>
          <button type="button" className="m-tool" onClick={() => setDraft("Gere o código: ")}>⌨ Código</button>
          <button type="button" className="m-tool" onClick={() => { window.location.hash = "#/ferramentas"; }}>🧪 Ferramentas</button>
        </div>

        <div className={`m-campo${expandido ? " expandido" : ""}`}>
        {expandido ? (
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onPaste={aoColar}
            placeholder={PLACEHOLDERS[ph]}
            aria-label="Mensagem"
            rows={5}
            autoFocus
          />
        ) : (
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onPaste={aoColar}
            placeholder={PLACEHOLDERS[ph]}
            aria-label="Mensagem"
          />
        )}
          <div className="m-campo-lado">
        {draft.length > 0 && (
          <span className="dock-contador" aria-live="polite">
            {draft.length > 1200 ? <b>{draft.length}</b> : draft.length}
          </span>
        )}
        <button
          type="button"
          className={`dock-expandir${expandido ? " on" : ""}`}
          aria-label={expandido ? "recolher campo" : "expandir campo"}
          aria-pressed={expandido}
          onClick={() => setExpandido((v) => !v)}
        >
          {expandido ? "⤡" : "⤢"}
        </button>
          </div>
        </div>

        <div className="m-barra">
        <div className="plus-wrap">
          <button type="button" className="dock-plus" aria-label="Mais" onClick={() => { setPlusOpen((v) => !v); setModelOpen(false); }}><IconPlus /></button>
          {plusOpen && (
            <div className="plus-menu">
              <button type="button" onClick={() => { setPlusOpen(false); setAnexosOpen(true); }}>📎 Anexar foto, câmera ou arquivo</button>
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
          <div className="m-motor-wrap">
        <button
          type="button"
          className={`motor${modelOpen ? " aberto" : ""}`}
          aria-label="Motor, modelo e habilidades do agente"
          aria-expanded={modelOpen}
          onClick={() => { setModelOpen((v) => !v); setPlusOpen(false); }}
        >
          <span className="motor-selo" aria-hidden="true">
            <Simbolo tamanho={17} cor="var(--red)" />
          </span>
          <span className="motor-nome"><Logotipo tamanho={20} /></span>
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
          </div>

          <div className="m-barra-fim">
        {(gravando || audioUrl) ? (
          <GravacaoAudio
            gravando={gravando}
            pausado={pausado}
            segundos={micSecs}
            niveis={niveis}
            url={audioUrl}
            aoPausar={() => { gravadorRef.current?.pausar(); setPausado(true); }}
            aoRetomar={() => { gravadorRef.current?.retomar(); setPausado(false); }}
            aoParar={pararGravacao}
            aoCancelar={cancelarGravacao}
            aoUsar={usarAudio}
            aoDescartar={descartarAudio}
          />
        ) : (
          <button type="button" className="icon-btn muted" aria-label="Gravar áudio" onClick={toggleMic}><IconMic /></button>
        )}
        {busy ? (
          <button
            type="button"
            className="dock-send cancelar"
            aria-label="Cancelar o envio"
            onClick={() => { canceladoRef.current = true; setBusy(false); setFase("pensando"); say("Envio cancelado aqui. O servidor pode concluir o pedido em segundo plano."); }}
          >
            ✕
          </button>
        ) : (
          <button
            type="submit"
            className={`dock-send${enviandoAnim ? " animado" : ""}${draft.trim() || prints.length ? "" : " so-voz"}`}
            aria-label="Enviar mensagem"
            onClick={() => { setEnviandoAnim(true); setTimeout(() => setEnviandoAnim(false), 620); }}
          >
            <IconWave width={22} height={22} />
          </button>
        )}
          </div>
        </div>
      </form>

      <Lightbox url={zoom?.url} alt={zoom?.alt} nome={zoom?.nome} onFechar={() => setZoom(null)} />

      <AnexosSheet
        aberta={anexosOpen}
        aoFechar={() => setAnexosOpen(false)}
        aoAnexar={receberArquivos}
        say={say}
      />

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
