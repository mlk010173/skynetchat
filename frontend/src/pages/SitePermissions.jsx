import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../consentimento.css";
import {
  consultarTodas,
  solicitar,
  instrucaoRevogar,
  estimarArmazenamento,
  lerRegistroUso,
  registrarUso,
  POLITICA_CONHECIDA,
  politicaPermite,
  lerSites,
  adicionarSite,
  removerSite,
  revogarSessaoSite,
  normalizarDominio,
  permissaoPorNome,
} from "../permissoes-site.js";
import {
  inventarioCookies,
  apagarCategoria,
  apagarItem,
  tamanhoAproximado,
  IDS_CATEGORIAS,
} from "../consentimento.js";

const ROTULO_ESTADO = {
  concedida: "liberada",
  negada: "negada",
  pergunta: "perguntar",
  politica: "bloqueada pelo site",
  indisponivel: "sem suporte",
  desconhecido: "controlada pelo navegador",
};

function formatarData(iso) {
  if (!iso) return "nunca";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "data inválida";
  try {
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d.toISOString();
  }
}

function formatarBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace(".", ",")} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2).replace(".", ",")} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2).replace(".", ",")} GB`;
}

/** Lê o id do usuário Supabase sem quebrar quando lib.js não está disponível. */
async function idDoUsuario() {
  try {
    const mod = await import("../lib.js");
    if (typeof mod?.getSession !== "function") return null;
    const sessao = await mod.getSession();
    return sessao?.user?.id || null;
  } catch {
    return null;
  }
}

/**
 * /site-permissions · SKYNET SITE PERMISSIONS
 * Três blocos: permissões do navegador (estado real), sites e sessões
 * conectados (lista local) e dados armazenados (inventário real).
 */
export default function SitePermissions() {
  const navigate = useNavigate();
  const [permissoes, setPermissoes] = useState([]);
  const [carregandoPerm, setCarregandoPerm] = useState(true);
  const [ocupado, setOcupado] = useState(null);
  const [instrucao, setInstrucao] = useState(null);
  const [aviso, setAviso] = useState(null);

  const [userId, setUserId] = useState(null);
  const [sites, setSites] = useState([]);
  const [dominio, setDominio] = useState("");
  const [finalidade, setFinalidade] = useState("");
  const [erroDominio, setErroDominio] = useState(null);

  const [inventario, setInventario] = useState([]);
  const [estimativa, setEstimativa] = useState(null);
  const [uso, setUso] = useState([]);

  const recarregarDados = useCallback(() => {
    setInventario(inventarioCookies());
    setUso([...lerRegistroUso()].reverse().slice(0, 12));
  }, []);

  const carregarPermissoes = useCallback(async () => {
    setCarregandoPerm(true);
    try {
      setPermissoes(await consultarTodas());
    } finally {
      setCarregandoPerm(false);
    }
  }, []);

  useEffect(() => {
    const iniciar = async () => {
      const id = await idDoUsuario();
      setUserId(id);
      setSites(lerSites(id));
      recarregarDados();
      await carregarPermissoes();
      setEstimativa(await estimarArmazenamento());
    };
    iniciar();
  }, [carregarPermissoes, recarregarDados]);

  const totalBytes = useMemo(() => tamanhoAproximado(inventario), [inventario]);
  const porCategoria = useMemo(() => {
    const mapa = {};
    for (const id of IDS_CATEGORIAS) mapa[id] = inventario.filter((i) => i.categoria === id);
    return mapa;
  }, [inventario]);

  const pedir = async (nome) => {
    setOcupado(nome);
    setAviso(null);
    try {
      const r = await solicitar(nome);
      setAviso({
        tipo: r.ok ? "ok" : "alerta",
        texto: `${permissaoPorNome(nome)?.rotulo || nome}: ${r.detalhe || r.estado}`,
      });
    } finally {
      setOcupado(null);
      await carregarPermissoes();
      recarregarDados();
      setEstimativa(await estimarArmazenamento());
    }
  };

  const verInstrucao = (nome) => {
    setInstrucao(instrucao?.nome === nome ? null : instrucaoRevogar(nome));
    registrarUso(nome, "instrucao-consulta", { origem: "site-permissions" });
  };

  const adicionar = (e) => {
    e?.preventDefault?.();
    const valido = normalizarDominio(dominio);
    if (!valido.ok) {
      setErroDominio(valido.erro);
      return;
    }
    const r = adicionarSite(userId, { dominio, finalidade });
    if (!r.ok) {
      setErroDominio(r.erro);
      return;
    }
    setErroDominio(null);
    setDominio("");
    setFinalidade("");
    setSites(lerSites(userId));
    setAviso({ tipo: "ok", texto: `${r.item.dominio} adicionado. A sessão fica isolada e você faz o login manualmente.` });
  };

  const remover = (id) => {
    removerSite(userId, id);
    setSites(lerSites(userId));
    setAviso({ tipo: "ok", texto: "Domínio removido da lista deste navegador." });
  };

  const revogar = (id) => {
    revogarSessaoSite(userId, id);
    setSites(lerSites(userId));
    setAviso({
      tipo: "ok",
      texto: "Sessão marcada como revogada. O SKYNET não guardava cookie nem token desse site, então não havia credencial para apagar.",
    });
  };

  const apagar = (categoria) => {
    const removidos = apagarCategoria(categoria);
    recarregarDados();
    setEstimativa(null);
    estimarArmazenamento().then(setEstimativa);
    setAviso({
      tipo: removidos.length ? "ok" : "alerta",
      texto: removidos.length
        ? `${removidos.length} chave(s) de ${categoria} apagada(s).`
        : `Nenhuma chave de ${categoria} estava guardada.`,
    });
  };

  const apagarUm = (item) => {
    const ok = apagarItem(item.nome, item.onde);
    recarregarDados();
    setAviso({ tipo: ok ? "ok" : "alerta", texto: ok ? `${item.nome} apagado.` : `Não consegui apagar ${item.nome}.` });
  };

  const geoBloqueada = permissoes.find((p) => p.nome === "geolocalizacao")?.estado === "politica";
  const policyNoNavegador = politicaPermite("geolocation");

  return (
    <div className="perm-pagina">
      <header className="perm-topo">
        <button type="button" className="ck-voltar" onClick={() => navigate(-1)} aria-label="Voltar">
          ←
        </button>
        <div className="perm-topo-titulo">
          <h1>SKYNET — SITE PERMISSIONS</h1>
          <p>Permissões do navegador, sites conectados e dados guardados neste dispositivo.</p>
        </div>
      </header>

      <main className="perm-corpo">
        {aviso && (
          <p className={`ck-aviso ${aviso.tipo === "ok" ? "ck-ok" : "ck-alerta"}`} role="status">
            {aviso.texto}
          </p>
        )}

        {/* ---------------------------------------- permissões do navegador */}
        <section className="perm-secao" aria-labelledby="perm-navegador">
          <div className="perm-secao-topo">
            <div>
              <h2 id="perm-navegador">Permissões do navegador</h2>
              <p className="perm-sub">
                O estado vem de <code>navigator.permissions.query</code> e das APIs reais. Quem
                guarda a decisão é o navegador: o SKYNET pede e mostra o resultado, mas não revoga
                por código.
              </p>
            </div>
            <button type="button" className="ck-btn ck-pequeno" onClick={carregarPermissoes} disabled={carregandoPerm}>
              {carregandoPerm ? "Consultando…" : "Atualizar estado"}
            </button>
          </div>

          {geoBloqueada && (
            <div className="perm-alerta" role="note">
              <span>
                <b>Geolocalização bloqueada pela política do site.</b> O arquivo <code>vercel.json</code>{" "}
                envia <code>geolocation=()</code>, o que bloqueia a localização para todo mundo,
                inclusive para esta origem. O navegador nem chega a perguntar.
              </span>
              <span>
                Ajuste sugerido no <code>vercel.json</code>: trocar{" "}
                <code>{POLITICA_CONHECIDA.geolocation}</code> por{" "}
                <code>{POLITICA_CONHECIDA.ajusteSugerido}</code>. Esse arquivo não foi alterado por
                esta entrega.
              </span>
            </div>
          )}

          {!geoBloqueada && policyNoNavegador === null && !carregandoPerm && (
            <p className="perm-nota" style={{ marginBottom: 12 }}>
              Este navegador não informa a política de permissões da página, então o estado abaixo
              vem só da permissão do usuário.
            </p>
          )}

          {carregandoPerm && permissoes.length === 0 ? (
            <p className="perm-carregando">Consultando o navegador…</p>
          ) : (
            <ul className="perm-lista">
              {permissoes.map((p) => (
                <li className="perm-item" key={p.nome}>
                  <div>
                    <div className="perm-item-cabeca">
                      <h3 className="perm-item-nome">{p.rotulo}</h3>
                      <span className="perm-estado" data-estado={p.estado}>
                        {ROTULO_ESTADO[p.estado] || p.estado}
                      </span>
                    </div>
                    <p className="perm-item-desc">{p.descricao}</p>
                    {p.motivo && <p className="perm-detalhe">{p.motivo}</p>}
                    {instrucao?.nome === p.nome && (
                      <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                        <p className="perm-instrucao">{instrucao.resumo}</p>
                        <p className="perm-instrucao">{instrucao.chrome}</p>
                        <p className="perm-instrucao">{instrucao.firefox}</p>
                        <p className="perm-instrucao">{instrucao.safari}</p>
                      </div>
                    )}
                  </div>
                  <div className="perm-item-rodape">
                    <button
                      type="button"
                      className="ck-btn ck-pequeno ck-primario"
                      onClick={() => pedir(p.nome)}
                      disabled={ocupado === p.nome || !p.suportado || p.estado === "politica"}
                      title={p.estado === "politica" ? "Bloqueada pela Permissions-Policy do site" : undefined}
                    >
                      {ocupado === p.nome ? "Aguardando…" : p.estado === "concedida" ? "Testar de novo" : "Permitir"}
                    </button>
                    <button type="button" className="ck-btn ck-pequeno ck-fantasma" onClick={() => verInstrucao(p.nome)}>
                      {instrucao?.nome === p.nome ? "Fechar instrução" : "Como revogar"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {uso.length > 0 && (
            <>
              <p className="ck-eyebrow" style={{ marginTop: 16 }}>
                Quando o SKYNET pediu
              </p>
              <ul className="perm-historico">
                {uso.map((u, i) => (
                  <li key={`${u.quando}-${i}`}>
                    <time dateTime={u.quando}>{formatarData(u.quando)}</time>
                    <span>
                      <b>{permissaoPorNome(u.nome)?.rotulo || u.nome}</b> · {u.acao}
                      {u.resultado ? ` · ${u.resultado}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* -------------------------------------------- sites conectados */}
        <section className="perm-secao" aria-labelledby="perm-sites">
          <div className="perm-secao-topo">
            <div>
              <h2 id="perm-sites">Sites e sessões conectados</h2>
              <p className="perm-sub">
                Lista salva apenas neste navegador, por usuário. Cada site roda em sessão isolada,
                com o próprio armazenamento, e você faz o login manualmente em cada um.
              </p>
            </div>
            <span className="perm-total">{sites.length} site(s)</span>
          </div>

          <p className="perm-nota" style={{ marginBottom: 12 }}>
            <b>O SKYNET nunca contorna login, captcha ou verificação em duas etapas.</b> Nenhuma
            senha, token de terceiro ou cookie de autenticação de outro site é guardado aqui.
            O acesso acontece sempre com a sua ação.
          </p>

          {sites.length === 0 ? (
            <p className="perm-vazio">Nenhum site registrado ainda.</p>
          ) : (
            <ul className="perm-lista">
              {sites.map((s) => (
                <li className="perm-site" key={s.id}>
                  <div className="perm-site-topo">
                    <h3 className="perm-site-dominio">{s.dominio}</h3>
                    <span className="perm-estado" data-estado={s.estadoSessao === "revogada" ? "negada" : "concedida"}>
                      {s.estadoSessao === "revogada" ? "sessão revogada" : s.estadoSessao === "ativa" ? "sessão ativa" : "sessão isolada"}
                    </span>
                  </div>
                  <dl className="perm-site-meta">
                    <div>
                      <dt>finalidade</dt>
                      <dd>{s.finalidade}</dd>
                    </div>
                    <div>
                      <dt>criado em</dt>
                      <dd>{formatarData(s.criadoEm)}</dd>
                    </div>
                    <div>
                      <dt>última utilização</dt>
                      <dd>{formatarData(s.ultimaUtilizacao)}</dd>
                    </div>
                  </dl>
                  <p className="perm-nota">
                    Sessão isolada: cookies e armazenamento deste site não se misturam com o
                    SKYNETchat e não são lidos por ele. O login é feito por você, na própria janela
                    do site.
                  </p>
                  <div className="perm-item-rodape">
                    <button type="button" className="ck-btn ck-pequeno" onClick={() => revogar(s.id)}>
                      Revogar sessão
                    </button>
                    <button type="button" className="ck-btn ck-pequeno ck-perigo" onClick={() => remover(s.id)}>
                      Remover
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form className="perm-form" onSubmit={adicionar}>
            <div className="perm-campo">
              <label htmlFor="perm-dominio">Domínio</label>
              <input
                id="perm-dominio"
                value={dominio}
                onChange={(e) => {
                  setDominio(e.target.value);
                  setErroDominio(null);
                }}
                placeholder="exemplo.com"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(erroDominio)}
                aria-describedby={erroDominio ? "perm-dominio-erro" : undefined}
                inputMode="url"
              />
              {erroDominio && (
                <p className="perm-erro-campo" id="perm-dominio-erro" role="alert">
                  {erroDominio}
                </p>
              )}
            </div>
            <div className="perm-campo">
              <label htmlFor="perm-finalidade">Finalidade</label>
              <input
                id="perm-finalidade"
                value={finalidade}
                onChange={(e) => setFinalidade(e.target.value)}
                placeholder="consultar pedidos"
                maxLength={240}
              />
            </div>
            <div className="perm-linha-form">
              <button type="submit" className="ck-btn ck-primario">
                Adicionar domínio
              </button>
            </div>
          </form>
          <p className="perm-nota" style={{ marginTop: 8 }}>
            Aceita só hostname, sem caminho, busca ou parâmetros. Nunca coloque usuário ou senha no
            endereço: o formulário recusa.
          </p>
        </section>

        {/* ------------------------------------------ dados armazenados */}
        <section className="perm-secao" aria-labelledby="perm-dados">
          <div className="perm-secao-topo">
            <div>
              <h2 id="perm-dados">Dados armazenados</h2>
              <p className="perm-sub">
                Inventário lido do navegador agora. Apagar por categoria remove de fato as chaves
                daquele grupo; essenciais ficam para não derrubar a sessão.
              </p>
            </div>
            <button type="button" className="ck-btn ck-pequeno" onClick={recarregarDados}>
              Atualizar inventário
            </button>
          </div>

          <p className="perm-total">
            {inventario.length} item(ns) · tamanho aproximado {formatarBytes(totalBytes)}
            {estimativa?.usoBytes != null && (
              <>
                {" "}
                · a origem usa {formatarBytes(estimativa.usoBytes)} de {formatarBytes(estimativa.cotaBytes)}
                {estimativa.percentual != null ? ` (${estimativa.percentual}% da cota)` : ""}
              </>
            )}
            {estimativa?.persistente != null && (
              <> · armazenamento {estimativa.persistente ? "persistente" : "não persistente"}</>
            )}
          </p>

          <div className="perm-tabela-wrap" style={{ marginTop: 12 }}>
            {inventario.length === 0 ? (
              <p className="perm-vazio">Nenhuma chave deste site neste navegador.</p>
            ) : (
              <table className="perm-tabela">
                <caption>Inventário de cookies e chaves locais</caption>
                <thead>
                  <tr>
                    <th scope="col">Nome</th>
                    <th scope="col">Origem</th>
                    <th scope="col">Categoria</th>
                    <th scope="col">Validade</th>
                    <th scope="col">Finalidade</th>
                    <th scope="col">
                      <span className="ck-sr">Ação</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {inventario.map((item) => (
                    <tr key={`${item.onde}:${item.nome}`}>
                      <td>
                        <code>{item.nome}</code>
                        <span className="perm-onde">{item.onde}</span>
                      </td>
                      <td>{item.party === "propria" ? "própria" : "terceiro"}</td>
                      <td>{item.categoria}</td>
                      <td>{item.validade || "não informada"}</td>
                      <td>{item.finalidade}</td>
                      <td>
                        {item.categoria !== "essenciais" && (
                          <button type="button" className="ck-btn ck-pequeno ck-fantasma" onClick={() => apagarUm(item)}>
                            Apagar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="ck-acoes" style={{ marginTop: 12 }}>
            {IDS_CATEGORIAS.filter((id) => id !== "essenciais").map((id) => (
              <button
                key={id}
                type="button"
                className="ck-btn ck-pequeno ck-perigo"
                onClick={() => apagar(id)}
                disabled={!porCategoria[id]?.length}
              >
                Apagar {id} ({porCategoria[id]?.length || 0})
              </button>
            ))}
          </div>

          <p className="perm-nota" style={{ marginTop: 12 }}>
            <b>Não guardamos senha, token de terceiro nem cookie de autenticação de outro site</b>{" "}
            em <code>localStorage</code>. O único token local é o da sua sessão com o próprio
            SKYNETchat, necessário para você continuar autenticado.
          </p>
        </section>
      </main>
    </div>
  );
}
