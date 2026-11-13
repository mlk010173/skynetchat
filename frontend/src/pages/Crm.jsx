import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib.js";

const ETAPAS = [
  { chave: "novo", titulo: "Novo", prob: 10 },
  { chave: "contato_feito", titulo: "Contato feito", prob: 30 },
  { chave: "proposta", titulo: "Proposta", prob: 55 },
  { chave: "negociacao", titulo: "Negociação", prob: 75 },
  { chave: "ganho", titulo: "Ganho", prob: 100 },
  { chave: "perdido", titulo: "Perdido", prob: 0 },
];
const TIPOS = ["ligacao", "email", "reuniao", "tarefa", "nota"];
const ROTULO_TIPO = { ligacao: "Ligação", email: "E-mail", reuniao: "Reunião", tarefa: "Tarefa", nota: "Nota" };

const dinheiro = (v) =>
  (Number(v ?? 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const dataCurta = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};
const quandoRelativo = (iso) => {
  if (!iso) return "sem prazo";
  const d = new Date(iso);
  const dias = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) / 864e5);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (dias === 0) return `hoje ${hora}`;
  if (dias === 1) return `amanhã ${hora}`;
  if (dias === -1) return `ontem ${hora}`;
  return dias > 0 ? `em ${dias} dias · ${hora}` : `atrasada ${Math.abs(dias)}d`;
};

export default function Crm() {
  const navigate = useNavigate();
  const [painel, setPainel] = useState(null);
  const [aba, setAba] = useState("pipeline");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(null); // contato em detalhe
  const [form, setForm] = useState(null); // {tipo:'contato'|'negocio'|'atividade', editando}
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const d = await api("crm?recurso=painel");
      if (!d?.ok) { setErro(d?.error || "Não consegui carregar o CRM."); return; }
      setErro(null);
      setPainel(d);
    } catch (e) {
      setErro(String(e?.message || e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const contatosFiltrados = useMemo(() => {
    const lista = painel?.contatos ?? [];
    const t = busca.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter((c) =>
      [c.nome, c.empresa, c.email, c.telefone].filter(Boolean).some((v) => String(v).toLowerCase().includes(t)));
  }, [painel, busca]);

  const abrirContato = useCallback(async (id) => {
    setAberto({ carregando: true, id });
    const d = await api(`crm?recurso=contato&id=${id}`);
    if (!d?.ok) { setAviso(d?.error || "Falha ao abrir o contato."); setAberto(null); return; }
    setAberto(d);
  }, []);

  const enviar = useCallback(async (acao, corpo) => {
    setSalvando(true);
    const d = await api(`crm?acao=${acao}`, { method: "POST", body: corpo });
    setSalvando(false);
    if (!d?.ok) { setAviso(d?.error || "Não consegui salvar."); return null; }
    setAviso(null);
    setForm(null);
    await carregar();
    if (aberto?.contato && corpo?.contato_id === aberto.contato.id) await abrirContato(aberto.contato.id);
    return d;
  }, [aberto, abrirContato, carregar]);

  const mover = useCallback(async (id, etapa) => {
    setPainel((prev) => prev ? {
      ...prev,
      negocios: prev.negocios.map((n) => (n.id === id ? { ...n, etapa } : n)),
    } : prev);
    const d = await api("crm?acao=etapa", { method: "POST", body: { id, etapa } });
    if (!d?.ok) setAviso(d?.error || "Não consegui mover o negócio.");
    await carregar();
  }, [carregar]);

  const m = painel?.metricas ?? {};
  const negocioDoContato = (contatoId) => (painel?.negocios ?? []).filter((n) => n.contato_id === contatoId);

  return (
    <div className="tela-crm">
      <header className="crm-topo">
        <button type="button" className="crm-voltar" onClick={() => navigate("/")} aria-label="Voltar ao chat">←</button>
        <div className="crm-titulo">
          <h1>CRM</h1>
          <p>Contatos, pipeline e o que precisa de você hoje.</p>
        </div>
        <div className="crm-acoes-topo">
          <button type="button" className="crm-btn-sec" onClick={() => setForm({ tipo: "contato" })}>+ Contato</button>
          <button type="button" className="crm-btn-prim" onClick={() => setForm({ tipo: "negocio", contato_id: aberto?.contato?.id })}>+ Negócio</button>
        </div>
      </header>

      {erro && (
        <div className="crm-erro" role="alert">
          {erro} <button type="button" className="acao-toque" onClick={carregar}>tentar de novo</button>
        </div>
      )}
      {aviso && <div className="crm-aviso" role="status">{aviso}</div>}

      <section className="crm-metricas" aria-label="Indicadores">
        {[
          ["Pipeline aberto", dinheiro(m.pipeline), "soma dos negócios em aberto"],
          ["Ponderado", dinheiro(m.ponderado), "por probabilidade de fechamento"],
          ["Ganho", dinheiro(m.ganho_total), "negócios fechados"],
          ["Conversão", `${m.conversao ?? 0}%`, "ganhos sobre decididos"],
          ["Contatos", m.contatos ?? 0, `${m.novos_7d ?? 0} novos em 7 dias`],
          ["Hoje", m.atividades_hoje ?? 0, `${m.atividades_atrasadas ?? 0} atrasadas · ${m.atividades_proximas ?? 0} à frente`],
        ].map(([rotulo, valor, nota]) => (
          <div className="crm-tile" key={rotulo}>
            <span>{rotulo}</span>
            <strong>{valor}</strong>
            <small>{nota}</small>
          </div>
        ))}
      </section>

      <nav className="crm-abas" role="tablist" aria-label="Seções do CRM">
        {[["pipeline", "Pipeline"], ["contatos", "Contatos"], ["atividades", "Atividades"]].map(([chave, rotulo]) => (
          <button
            key={chave}
            type="button"
            role="tab"
            aria-selected={aba === chave}
            className={aba === chave ? "ativa" : ""}
            onClick={() => setAba(chave)}
          >
            {rotulo}
            {chave === "atividades" && ((m.atividades_hoje ?? 0) + (m.atividades_atrasadas ?? 0)) > 0 && (
              <span className="crm-badge">{(m.atividades_hoje ?? 0) + (m.atividades_atrasadas ?? 0)}</span>
            )}
          </button>
        ))}
      </nav>

      {carregando && <p className="crm-vazio">Carregando o CRM…</p>}

      {!carregando && aba === "pipeline" && (
        <section className="crm-pipeline" aria-label="Pipeline de negócios">
          {ETAPAS.map(({ chave, titulo }) => {
            const itens = (painel?.negocios ?? []).filter((n) => n.etapa === chave);
            const total = itens.reduce((s, n) => s + Number(n.valor ?? 0), 0);
            return (
              <div className={`crm-coluna etapa-${chave}`} key={chave}>
                <header>
                  <strong>{titulo}</strong>
                  <span>{itens.length} · {dinheiro(total)}</span>
                </header>
                {itens.length === 0 && <p className="crm-coluna-vazia">nada aqui</p>}
                {itens.map((n) => (
                  <article className="crm-card" key={n.id}>
                    <div className="crm-card-topo">
                      <strong>{n.titulo}</strong>
                      <span>{dinheiro(n.valor)}</span>
                    </div>
                    <p className="crm-card-sub">
                      {n.contato_id ? (painel?.contatos ?? []).find((c) => c.id === n.contato_id)?.nome ?? "contato" : "sem contato"}
                      {n.previsao ? ` · previsto ${dataCurta(n.previsao)}` : ""}
                    </p>
                    <div className="crm-card-barra" aria-hidden="true">
                      <i style={{ width: `${Math.max(4, Math.min(100, Number(n.probabilidade ?? 0)))}%` }} />
                    </div>
                    <div className="crm-card-acoes">
                      <select
                        aria-label={`Etapa de ${n.titulo}`}
                        value={n.etapa}
                        onChange={(e) => mover(n.id, e.target.value)}
                      >
                        {ETAPAS.map((e) => <option key={e.chave} value={e.chave}>{e.titulo}</option>)}
                      </select>
                      <button type="button" onClick={() => setForm({ tipo: "negocio", editando: n })}>editar</button>
                    </div>
                  </article>
                ))}
              </div>
            );
          })}
        </section>
      )}

      {!carregando && aba === "contatos" && (
        <section className="crm-contatos" aria-label="Contatos">
          <input
            className="crm-busca"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="buscar por nome, empresa, e-mail ou telefone"
            aria-label="Buscar contato"
          />
          {contatosFiltrados.length === 0 && (
            <p className="crm-vazio">
              {busca ? `Nenhum contato com “${busca}”.` : "Nenhum contato ainda. Comece com + Contato."}
            </p>
          )}
          <ul className="crm-lista">
            {contatosFiltrados.map((c) => {
              const deals = negocioDoContato(c.id);
              const abertoValor = deals.filter((d) => !["ganho", "perdido"].includes(d.etapa)).reduce((s, d) => s + Number(d.valor ?? 0), 0);
              return (
                <li key={c.id}>
                  <button type="button" className="crm-linha" onClick={() => abrirContato(c.id)}>
                    <span className="crm-avatar" aria-hidden="true">{(c.nome || "?").slice(0, 1).toUpperCase()}</span>
                    <span className="crm-linha-info">
                      <strong>{c.nome}</strong>
                      <small>{[c.cargo, c.empresa].filter(Boolean).join(" · ") || "sem empresa"}</small>
                    </span>
                    <span className="crm-linha-valor">
                      {deals.length ? `${deals.length} negócio${deals.length > 1 ? "s" : ""}` : "sem negócio"}
                      {abertoValor > 0 && <small>{dinheiro(abertoValor)}</small>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!carregando && aba === "atividades" && (
        <section className="crm-atividades" aria-label="Atividades">
          {[["Atrasadas", painel?.atrasadas ?? []], ["Hoje", painel?.hoje ?? []], ["Próximos 7 dias", painel?.proximas ?? []]].map(([titulo, lista]) => (
            <div key={titulo} className="crm-grupo-ativ">
              <h2>{titulo} <small>{lista.length}</small></h2>
              {lista.length === 0 && <p className="crm-coluna-vazia">nada por aqui</p>}
              {lista.map((a) => (
                <div className="crm-ativ" key={a.id}>
                  <button
                    type="button"
                    className="crm-check"
                    aria-label={`Concluir ${a.titulo}`}
                    onClick={() => enviar("concluir", { id: a.id })}
                  />
                  <div>
                    <strong>{a.titulo}</strong>
                    <small>{ROTULO_TIPO[a.tipo] ?? a.tipo} · {quandoRelativo(a.quando)}</small>
                  </div>
                </div>
              ))}
            </div>
          ))}
          <button type="button" className="crm-btn-sec" onClick={() => setForm({ tipo: "atividade", contato_id: aberto?.contato?.id })}>
            + Atividade
          </button>
        </section>
      )}

      {aberto && (
        <aside className="crm-detalhe" role="dialog" aria-label="Detalhe do contato">
          <header>
            <h2>{aberto.carregando ? "Abrindo…" : aberto.contato?.nome}</h2>
            <button type="button" onClick={() => setAberto(null)} aria-label="Fechar">×</button>
          </header>
          {aberto.carregando && <p className="crm-vazio">Carregando…</p>}
          {!aberto.carregando && aberto.contato && (
            <>
              <dl className="crm-dados">
                <div><dt>Empresa</dt><dd>{aberto.contato.empresa || "—"}</dd></div>
                <div><dt>Cargo</dt><dd>{aberto.contato.cargo || "—"}</dd></div>
                <div><dt>E-mail</dt><dd>{aberto.contato.email || "—"}</dd></div>
                <div><dt>Telefone</dt><dd>{aberto.contato.telefone || "—"}</dd></div>
                <div><dt>Origem</dt><dd>{aberto.contato.origem || "manual"}</dd></div>
                <div><dt>Último contato</dt><dd>{quandoRelativo(aberto.contato.ultimo_contato)}</dd></div>
              </dl>
              {Array.isArray(aberto.contato.tags) && aberto.contato.tags.length > 0 && (
                <p className="crm-tags">{aberto.contato.tags.map((t) => <span key={t}>{t}</span>)}</p>
              )}
              <h3>Negócios</h3>
              {(aberto.negocios ?? []).length === 0 && <p className="crm-coluna-vazia">nenhum negócio</p>}
              {(aberto.negocios ?? []).map((n) => (
                <div className="crm-mini" key={n.id}>
                  <strong>{n.titulo}</strong>
                  <span>{dinheiro(n.valor)} · {ETAPAS.find((e) => e.chave === n.etapa)?.titulo}</span>
                </div>
              ))}
              <h3>Histórico</h3>
              {(aberto.atividades ?? []).length === 0 && <p className="crm-coluna-vazia">sem interações registradas</p>}
              <ol className="crm-timeline">
                {(aberto.atividades ?? []).map((a) => (
                  <li key={a.id}>
                    <span className="crm-timeline-tipo">{ROTULO_TIPO[a.tipo] ?? a.tipo}</span>
                    <strong>{a.titulo}</strong>
                    <small>{quandoRelativo(a.quando)}{a.concluida ? " · concluída" : ""}</small>
                  </li>
                ))}
              </ol>
              <div className="crm-detalhe-acoes">
                <button type="button" className="crm-btn-sec" onClick={() => setForm({ tipo: "atividade", contato_id: aberto.contato.id })}>Registrar interação</button>
                <button type="button" className="crm-btn-prim" onClick={() => setForm({ tipo: "negocio", contato_id: aberto.contato.id })}>Novo negócio</button>
                <button type="button" className="crm-btn-sec" onClick={() => setForm({ tipo: "contato", editando: aberto.contato })}>Editar</button>
              </div>
            </>
          )}
        </aside>
      )}

      {form && (
        <div className="crm-overlay" role="dialog" aria-modal="true" aria-label={`Formulário de ${form.tipo}`}>
          <form
            className="crm-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const dados = Object.fromEntries(new FormData(e.target).entries());
              if (form.tipo === "atividade" && dados.quando) dados.quando = new Date(String(dados.quando)).toISOString();
              if (form.tipo === "contato" && typeof dados.tags === "string") {
                dados.tags = dados.tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10);
              }
              await enviar(form.tipo, { ...dados, ...(form.editando?.id ? { id: form.editando.id } : {}) });
            }}
          >
            <h2>{form.editando ? `Editar ${form.tipo}` : `Novo ${form.tipo}`}</h2>

            {form.tipo === "contato" && (
              <>
                <label>Nome<input name="nome" defaultValue={form.editando?.nome ?? ""} required maxLength={120} /></label>
                <label>Empresa<input name="empresa" defaultValue={form.editando?.empresa ?? ""} maxLength={120} /></label>
                <label>Cargo<input name="cargo" defaultValue={form.editando?.cargo ?? ""} maxLength={120} /></label>
                <label>E-mail<input name="email" type="email" defaultValue={form.editando?.email ?? ""} maxLength={160} /></label>
                <label>Telefone<input name="telefone" defaultValue={form.editando?.telefone ?? ""} maxLength={40} /></label>
                <label>Origem<input name="origem" defaultValue={form.editando?.origem ?? "manual"} maxLength={40} /></label>
                <label>Tags (separadas por vírgula)
                  <input name="tags" defaultValue={(form.editando?.tags ?? []).join(", ")} maxLength={200} />
                </label>
                <label>Notas<textarea name="notas" defaultValue={form.editando?.notas ?? ""} rows={3} maxLength={4000} /></label>
              </>
            )}

            {form.tipo === "negocio" && (
              <>
                <label>Título<input name="titulo" defaultValue={form.editando?.titulo ?? ""} required maxLength={140} /></label>
                <label>Valor (R$)<input name="valor" inputMode="decimal" defaultValue={form.editando?.valor ?? ""} placeholder="4800" /></label>
                <label>Etapa
                  <select name="etapa" defaultValue={form.editando?.etapa ?? "novo"}>
                    {ETAPAS.map((e) => <option key={e.chave} value={e.chave}>{e.titulo}</option>)}
                  </select>
                </label>
                <label>Previsão de fechamento
                  <input name="previsao" type="date" defaultValue={form.editando?.previsao ?? ""} />
                </label>
                <label>Contato
                  <select name="contato_id" defaultValue={form.editando?.contato_id ?? form.contato_id ?? ""}>
                    <option value="">sem contato</option>
                    {(painel?.contatos ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </label>
                <label>Notas<textarea name="notas" defaultValue={form.editando?.notas ?? ""} rows={2} maxLength={4000} /></label>
              </>
            )}

            {form.tipo === "atividade" && (
              <>
                <label>Título<input name="titulo" required maxLength={160} /></label>
                <label>Tipo
                  <select name="tipo" defaultValue="ligacao">
                    {TIPOS.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
                  </select>
                </label>
                <label>Quando<input name="quando" type="datetime-local" /></label>
                <label>Contato
                  <select name="contato_id" defaultValue={form.contato_id ?? ""}>
                    <option value="">sem contato</option>
                    {(painel?.contatos ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </label>
                <label>Detalhes<textarea name="descricao" rows={3} maxLength={4000} /></label>
              </>
            )}

            <div className="crm-form-acoes">
              <button type="button" className="crm-btn-sec" onClick={() => setForm(null)}>Cancelar</button>
              <button type="submit" className="crm-btn-prim" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
            </div>
          </form>
        </div>
      )}

      <footer className="crm-rodape">
        <span>{painel ? `${(painel.negocios ?? []).length} negócios · ${(painel.contatos ?? []).length} contatos` : ""}</span>
        <button type="button" className="acao-toque" onClick={() => navigate("/")}>Voltar ao chat</button>
      </footer>
    </div>
  );
}
