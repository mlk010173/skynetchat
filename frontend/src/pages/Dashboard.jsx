import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell.jsx";
import { useAuth } from "../auth.jsx";
import { api } from "../lib.js";

const quando = (valor) => (valor ? new Date(valor).toLocaleString("pt-BR") : "—");

/** /dashboard: área do usuário autenticado. */
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

  const metodo = usuario?.app_metadata?.provider === "email" ? "e-mail e senha" : usuario?.app_metadata?.provider || "código";

  return (
    <AuthShell
      title="PAINEL"
      links={<><Link to="/">IR PARA O CHAT</Link><span>|</span><Link to="/account">CONTA</Link><span>|</span><Link to="/settings">AJUSTES</Link></>}
    >
      <p>Bem-vindo{nome ? `, ${nome}` : ""}. Sua sessão está ativa.</p>

      <dl className="dados" aria-label="Dados da conta">
        <dt>E-mail</dt><dd>{email || "—"}</dd>
        <dt>Nome</dt><dd>{nome || "—"}</dd>
        <dt>ID</dt><dd className="mono">{usuario?.id || "—"}</dd>
        <dt>Método</dt><dd>{metodo}</dd>
        <dt>E-mail confirmado</dt>
        <dd>{usuario?.email_confirmed_at || usuario?.confirmed_at ? `sim · ${quando(usuario.email_confirmed_at || usuario.confirmed_at)}` : "não"}</dd>
        <dt>Conta criada</dt><dd>{quando(usuario?.created_at)}</dd>
        <dt>Último acesso</dt><dd>{quando(usuario?.last_sign_in_at)}</dd>
        <dt>Sessão expira</dt><dd>{quando(sessao?.expires_at ? sessao.expires_at * 1000 : null)}</dd>
        <dt>Conversas</dt>
        <dd>{historico === null ? "carregando…" : erroHistorico ? erroHistorico : `${historico.length}`}</dd>
      </dl>

      <div className="acoes">
        <Link className="botao" to="/">CONTINUAR NO CHAT</Link>
        <Link className="botao secundario" to="/account">MINHA CONTA</Link>
        <button type="button" className="link-secundario" onClick={async () => { await sair(); navigate("/login", { replace: true }); }}>
          SAIR DA CONTA
        </button>
      </div>
    </AuthShell>
  );
}
