import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell.jsx";
import { useAuth } from "../auth.jsx";
import { api } from "../lib.js";

const quando = (valor) => (valor ? new Date(valor).toLocaleString("pt-BR") : "—");
const curto = (valor) => (valor ? new Date(valor).toLocaleDateString("pt-BR") : "—");

/** /dashboard: visão da conta e do uso. */
export default function Dashboard() {
  const { usuario, email, nome, sessao, sair } = useAuth();
  const navigate = useNavigate();
  const [historico, setHistorico] = useState(null);
  const [erroHistorico, setErroHistorico] = useState("");

  useEffect(() => {
    let ativo = true;
    api("conversations").then((d) => {
      if (!ativo) return;
      if (d?.ok) setHistorico(Array.isArray(d.conversas) ? d.conversas : []);
      else setErroHistorico(d?.error || "não foi possível carregar o histórico");
    }).catch(() => ativo && setErroHistorico("não foi possível carregar o histórico"));
    return () => { ativo = false; };
  }, []);

  const metodo = usuario?.app_metadata?.provider === "email" ? "e-mail e senha" : usuario?.app_metadata?.provider || "código de acesso";
  const confirmado = Boolean(usuario?.email_confirmed_at || usuario?.confirmed_at);
  const totalConversas = historico === null ? null : historico.length;
  const ultimaConversa = Array.isArray(historico) && historico.length
    ? [...historico].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0]
    : null;

  return (
    <AuthShell
      largo
      title="Painel"
      links={<><Link to="/">Ir para o chat</Link><span>|</span><Link to="/account">Conta</Link><span>|</span><Link to="/settings">Ajustes</Link></>}
    >
      <p className="auth-sub">
        Sessão ativa{nome ? ` como ${nome}` : ""}. Tudo abaixo vem da sua conta, não de dado de exemplo.
      </p>

      <div className="painel-grade">
        <div className="painel-metrica">
          <span>conversas</span>
          <b>{totalConversas === null ? "—" : totalConversas}</b>
          <small>{erroHistorico ? "não carregou" : ultimaConversa ? `última em ${curto(ultimaConversa.updated_at)}` : "nenhuma ainda"}</small>
        </div>
        <div className="painel-metrica">
          <span>sessão</span>
          <b>{sessao ? "ativa" : "local"}</b>
          <small>expira em {quando(sessao?.expires_at ? sessao.expires_at * 1000 : null)}</small>
        </div>
        <div className="painel-metrica">
          <span>método</span>
          <b>{metodo === "e-mail e senha" ? "senha" : "código"}</b>
          <small>{metodo}</small>
        </div>
        <div className="painel-metrica">
          <span>e-mail</span>
          <b>{confirmado ? "confirmado" : "pendente"}</b>
          <small>{email || "sem e-mail"}</small>
        </div>
      </div>

      <dl className="dados" aria-label="Dados da conta">
        <dt>Nome</dt><dd>{nome || "—"}</dd>
        <dt>ID da conta</dt><dd className="mono">{usuario?.id || "—"}</dd>
        <dt>Conta criada</dt><dd>{quando(usuario?.created_at)}</dd>
        <dt>Último acesso</dt><dd>{quando(usuario?.last_sign_in_at)}</dd>
        <dt>Sessão expira</dt><dd>{quando(sessao?.expires_at ? sessao.expires_at * 1000 : null)}</dd>
        <dt>Histórico</dt><dd>{historico === null ? "carregando…" : erroHistorico || `${historico.length} conversa(s)`}</dd>
      </dl>

      <div className="acoes">
        <Link className="botao" to="/">Continuar no chat</Link>
        <Link className="botao secundario" to="/account">Minha conta</Link>
        <Link className="botao secundario" to="/permissoes">Permissões</Link>
        <button type="button" className="link-secundario" onClick={async () => { await sair(); navigate("/login", { replace: true }); }}>
          Sair da conta
        </button>
      </div>
    </AuthShell>
  );
}
