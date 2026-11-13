import React, { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PainelCookies, { abrirPreferenciasCookies } from "../components/PainelCookies.jsx";
import { DIAS_VALIDADE, exportarMeusDadosJSON } from "../consentimento.js";
import "../consentimento.css";

const ATUALIZADO_EM = "13 de novembro de 2026";

function baixar(nome, conteudo) {
  try {
    const blob = new Blob([conteudo], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

/**
 * /privacidade · Política de privacidade em português claro, com o painel de
 * cookies embutido. Descreve controles técnicos reais; não afirma conformidade
 * jurídica e não inventa dados de empresa, DPO ou endereço.
 */
export default function Privacidade() {
  const navigate = useNavigate();
  const [baixou, setBaixou] = useState(null);

  const exportar = useCallback(() => {
    const nome = `skynet-dados-${new Date().toISOString().slice(0, 10)}.json`;
    const ok = baixar(nome, exportarMeusDadosJSON());
    setBaixou(
      ok
        ? `Arquivo ${nome} baixado com a sua decisão de cookies e o inventário deste navegador.`
        : "O navegador bloqueou o download. Tente abrir esta página direto no navegador, sem estar dentro de outro app.",
    );
  }, []);

  return (
    <div className="ck-pagina">
      <header className="ck-pagina-topo">
        <button type="button" className="ck-voltar" onClick={() => navigate(-1)}>
          ← Voltar
        </button>
        <button type="button" className="ck-btn ck-pequeno ck-fantasma" onClick={() => abrirPreferenciasCookies("privacidade")}>
          Preferências de cookies
        </button>
      </header>

      <div className="ck-pagina-corpo">
        <p className="ck-eyebrow">Documento</p>
        <h1>Política de privacidade do SKYNETchat</h1>
        <p className="ck-data">Última atualização: {ATUALIZADO_EM}</p>

        <p>
          Este texto explica, em linguagem direta, o que o SKYNETchat guarda no seu navegador, o
          que fica no servidor, por quanto tempo e o que você pode fazer a respeito. Ele descreve
          os controles técnicos que existem hoje no produto. Não é parecer jurídico e não substitui
          uma avaliação feita por advogado.
        </p>

        <h2>1. Quem trata os dados</h2>
        <p>
          O SKYNETchat é operado pelo próprio projeto que hospeda esta aplicação. Não há, neste
          texto, CNPJ, endereço físico nem nome de encarregado de dados (DPO) porque esses dados
          ainda não foram formalizados. Enquanto isso, todo pedido relacionado a dados pessoais é
          atendido pelo canal de suporte do projeto, disponível no menu Suporte dentro do chat.
          Se esses dados forem definidos, eles passam a constar aqui.
        </p>

        <h2>2. O que fica no seu navegador</h2>
        <p>
          O navegador é o lugar onde o SKYNETchat guarda menos informação sensível, e você pode
          apagar tudo a qualquer momento. Hoje o site usa:
        </p>
        <ul>
          <li>
            <strong>Sessão de autenticação</strong> (chave <code>skynet-session</code> e chaves{" "}
            <code>sb-</code>): é o token do próprio SKYNETchat, emitido pelo Supabase, para você
            não digitar o código de acesso a cada recarregamento. Fica até você sair da conta ou
            até o token expirar.
          </li>
          <li>
            <strong>Preferências de interface</strong> (<code>skynet-theme-bg</code>,{" "}
            <code>skynet-modo</code>, <code>skynet-menu-fechados</code>): tema claro ou escuro,
            modo de resposta e grupos de menu que você deixou fechados.
          </li>
          <li>
            <strong>Ajustes do agente</strong> (chaves com o prefixo <code>skynet.agente.</code>):
            densidade, modelo padrão, rascunho de mensagem e configurações locais. Ficam neste
            navegador, não na sua conta.
          </li>
          <li>
            <strong>Registro da sua escolha de cookies</strong> (chave{" "}
            <code>skynet.consentimento.v1</code>): o que você liberou, quando e por quanto tempo,
            com um histórico das últimas 50 decisões.
          </li>
          <li>
            <strong>Registro de permissões</strong> (<code>skynet.permissoes.uso.v1</code>): quando
            o SKYNET pediu ou usou uma permissão do navegador, como microfone ou localização.
          </li>
          <li>
            <strong>Lista de sites conectados</strong> (<code>skynet.sites.v1</code>): domínio,
            finalidade e datas dos sites que você registrou na tela de permissões.
          </li>
        </ul>
        <p>
          O inventário abaixo é lido do seu navegador na hora em que a página abre. Não é uma lista
          teórica: se aparecer uma chave ali, ela existe de fato neste navegador.
        </p>

        <h2>3. O que o SKYNETchat nunca guarda no navegador</h2>
        <p>
          O SKYNETchat não guarda no <code>localStorage</code> a sua senha, tokens de terceiros
          obtidos por integração (Google, Slack, CRM e afins) nem cookies de autenticação de outros
          sites. O token que existe ali é o da sua sessão com o próprio SKYNETchat. Credenciais de
          integração ficam no servidor, cifradas, e nunca são copiadas para o navegador.
        </p>

        <h2>4. O que fica no servidor</h2>
        <p>
          As conversas, mensagens, memórias do agente e anexos ficam no banco de dados do serviço,
          ligados à sua conta, com isolamento por linha (Row Level Security): em regra, só a sua
          conta lê os seus registros. O e-mail de recuperação é opcional e serve apenas para
          recuperar o acesso. As respostas são geradas por modelos de inteligência artificial, e o
          conteúdo enviado é processado pelo provedor do modelo escolhido, conforme o contrato
          desse provedor.
        </p>

        <h2>5. Por quanto tempo</h2>
        <ul>
          <li>
            <strong>Consentimento de cookies:</strong> {DIAS_VALIDADE} dias. Depois disso o banner
            volta e você decide de novo.
          </li>
          <li>
            <strong>Sessão no navegador:</strong> até você sair, até o token expirar ou até apagar
            os dados do site.
          </li>
          <li>
            <strong>Preferências e ajustes locais:</strong> até você trocar ou apagar.
          </li>
          <li>
            <strong>Conversas e memórias:</strong> enquanto a conta existir. Você pode apagar
            conversas pela própria interface.
          </li>
          <li>
            <strong>Registro de uso de permissões:</strong> as últimas 100 entradas, sempre no seu
            navegador.
          </li>
        </ul>

        <h2>6. Cookies de terceiros</h2>
        <p>
          O SKYNETchat não instala pixel de anúncio nem script de analytics por conta própria. Se
          alguma integração futura fizer isso, ela aparece no inventário com nome, origem e
          finalidade, e só roda depois que você ligar a categoria correspondente. Chaves que o
          inventário não reconhece aparecem como terceiro e não identificado, em vez de ficarem
          escondidas.
        </p>

        <h2>7. Permissões do navegador</h2>
        <p>
          Localização, notificações, microfone, câmera, área de transferência, armazenamento
          persistente e compartilhamento de arquivos só são pedidos quando você clica no botão
          correspondente. Quem guarda a resposta é o navegador, não o SKYNETchat. Por isso a
          revogação é feita nas configurações do navegador, e a tela de permissões mostra o passo a
          passo para Chrome, Firefox e Safari.{" "}
          <Link to="/site-permissions">Abrir permissões do site</Link>.
        </p>

        <h2>8. Seus direitos pela LGPD</h2>
        <p>
          A Lei 13.709/2018 (LGPD) garante a você, entre outros, os direitos abaixo. O SKYNETchat
          implementa os controles técnicos que permitem exercê-los:
        </p>
        <ul>
          <li>
            <strong>Acesso:</strong> o painel de cookies mostra tudo que o navegador guarda, e o
            botão Exportar gera um JSON com a decisão e o inventário.
          </li>
          <li>
            <strong>Correção:</strong> dados de conta, como e-mail de recuperação, podem ser
            alterados na página de conta.
          </li>
          <li>
            <strong>Exclusão:</strong> apagar por categoria no painel de cookies, apagar conversas
            na interface e apagar os dados do site nas configurações do navegador.
          </li>
          <li>
            <strong>Portabilidade:</strong> o arquivo JSON gerado por Exportar é legível por
            qualquer ferramenta e traz consentimento, categorias e inventário.
          </li>
          <li>
            <strong>Revogação:</strong> revogar tudo apaga de fato as chaves não essenciais no
            navegador e faz a escolha expirar na hora.
          </li>
          <li>
            <strong>Informação:</strong> esta página descreve finalidade, validade e origem de cada
            item conhecido.
          </li>
        </ul>
        <p>
          Para pedidos que dependam do servidor, como exclusão de conta ou de histórico, use o canal
          de suporte no menu do chat. Não há prazo prometido aqui além do que a lei exige, e não há
          cobrança para atender pedido de titular.
        </p>

        <h2>9. Segurança</h2>
        <p>
          O acesso usa HTTPS, o banco aplica isolamento por linha e as credenciais de integração
          ficam no servidor. Nenhum sistema é imune a falha. Se ocorrer incidente que possa causar
          risco relevante, a comunicação será feita pelos canais oficiais do projeto.
        </p>

        <h2>10. Mudanças nesta política</h2>
        <p>
          Quando este texto mudar de forma relevante, a versão do consentimento sobe e o banner
          volta a aparecer para você decidir com base no texto novo. A data no topo indica a última
          atualização.
        </p>

        <div className="ck-nota-legal">
          <b>Sobre este documento.</b> Ele descreve controles técnicos implementados no produto e
          foi escrito para ser lido, não para servir de peça jurídica. Não afirma conformidade com a
          LGPD nem substitui a avaliação de um advogado ou de um encarregado de dados. Se você
          precisa de uma análise formal, procure orientação jurídica.
        </div>

        <h2 id="cookies">11. Painel de cookies</h2>
        <p>
          Tudo que você decide aqui vale para este navegador. Aceitar e recusar têm o mesmo peso:
          nenhuma opção vem pré-selecionada além do essencial.
        </p>
        <div className="ck-pagina-secao">
          <PainelCookies modo="embutido" />
        </div>

        <footer className="ck-rodape-pagina">
          <button type="button" className="ck-btn ck-pequeno" onClick={exportar}>
            Exportar meus dados
          </button>
          <button type="button" className="ck-btn ck-pequeno ck-fantasma" onClick={() => abrirPreferenciasCookies("privacidade")}>
            Abrir preferências
          </button>
          <Link className="ck-link" to="/terms">
            Termos de serviço
          </Link>
          <Link className="ck-link" to="/site-permissions">
            Permissões do site
          </Link>
          <Link className="ck-link" to="/">
            Suporte pelo menu do chat
          </Link>
        </footer>

        {baixou && (
          <p className="ck-aviso ck-ok" role="status" style={{ marginTop: 14 }}>
            {baixou}
          </p>
        )}

        <p className="ck-data" style={{ marginTop: 26 }}>
          Documento técnico do SKYNETchat. Contato e pedidos de titular pelo canal de suporte no
          menu do chat.
        </p>
      </div>
    </div>
  );
}
