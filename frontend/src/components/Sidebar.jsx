import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconBell, IconBook, IconChat, IconClose, IconCode, IconEdit, IconFolder,
  IconGift, IconHistory, IconImage, IconInstagram, IconLife, IconMoney,
  IconTheme, IconUser, IconUsers,
} from "./Icons.jsx";

const items = [
  { label: "Novo chat", desc: "Inicie uma conversa do zero", icon: IconEdit },
  { label: "Indique e Ganhe", desc: "Convide amigos e ganhe assinatura PRO", icon: IconGift },
  { label: "Monetize com SKYNETchat", tag: "NOVO", icon: IconMoney },
  { label: "Atualizações", desc: "Veja as novidades e melhorias recentes", icon: IconBell },
  { label: "Imagens", tag: "BETA", desc: "Gere e explore imagens com IA", icon: IconImage },
  { label: "Conversas em grupo", tag: "NOVO", desc: "Colabore com múltiplos agentes", icon: IconUsers },
  { label: "Codex", tag: "NOVO", desc: "Código, scripts e automação", icon: IconCode },
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

  const loadConvs = useCallback(async () => {
    if (!logged) { setConvs([]); return; }
    const { getSession } = await import("../lib.js");
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
    say(`"${label}" ainda não existe nesta versão. O que já funciona: chat com IA real, histórico, prompts, atualizações e Codex.`);
    onClose();
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
                  else if (label === "Codex") { draftFill("Você é um engenheiro de software sênior. Escreva o código para: "); }
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
              <span className="di-title">Fazer login</span>
            </Link>
          )}
          <button type="button" className="theme-row" onClick={() => {
            const next = document.documentElement.dataset.theme === "white" ? "black" : "white";
            document.documentElement.dataset.theme = next;
            localStorage.setItem("skynet-theme-bg", next);
          }}>
            <IconTheme className="di-icon accent" />
            <span>Tema de fundo</span>
            <em className="pill" data-theme-pill>BLACK</em>
          </button>
          <a className="insta" href="https://instagram.com/skynetchat.ai" target="_blank" rel="noopener noreferrer">
            <IconInstagram />
            <span>
              <strong>Nos siga no Instagram</strong>
              <small>@skynetchat.ai</small>
            </span>
          </a>
          <p className="terms">Termos de Serviço</p>
        </div>
      </aside>
    </>
  );
}
