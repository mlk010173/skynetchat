import React, { useCallback, useEffect, useState } from "react";
import { api, getSession, supabase } from "../lib.js";
import { IconClock, IconZap } from "./Icons.jsx";

export default function AutomationsPanel({ logged }) {
  const [automations, setAutomations] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Form states
  const [nome, setNome] = useState("");
  const [prompt, setPrompt] = useState("");
  const [cronMinutos, setCronMinutos] = useState("15");
  const [creating, setCreating] = useState(false);

  // Execution state: automation_id being executed
  const [executingId, setExecutingId] = useState(null);
  const [expandedRunId, setExpandedRunId] = useState(null);

  const loadData = useCallback(async () => {
    if (!logged) {
      setAutomations([]);
      setRuns([]);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Fetch user automations via client with RLS
      const { data: autoData, error: autoErr } = await supabase
        .from("automations")
        .select("*")
        .order("criado_em", { ascending: false });

      if (autoErr) throw autoErr;
      const autos = autoData || [];
      setAutomations(autos);

      // 2. Fetch last 10 runs for user automations
      if (autos.length > 0) {
        const autoIds = autos.map((a) => a.id);
        const { data: runsData, error: runsErr } = await supabase
          .from("automations_runs")
          .select("*")
          .in("automation_id", autoIds)
          .order("iniciado_em", { ascending: false })
          .limit(10);

        if (runsErr) throw runsErr;
        setRuns(runsData || []);
      } else {
        setRuns([]);
      }
    } catch (err) {
      setErrorMsg(err?.message || "Erro ao carregar automações.");
    } finally {
      setLoading(false);
    }
  }, [logged]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!nome.trim() || !prompt.trim() || creating) return;

    setCreating(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const session = await getSession();
      if (!session) throw new Error("Usuário não autenticado.");

      const { data, error } = await supabase
        .from("automations")
        .insert({
          user_id: session.user.id,
          nome: nome.trim(),
          prompt: prompt.trim(),
          cron_minutos: parseInt(cronMinutos, 10) || 15,
          ativo: true,
        })
        .select();

      if (error) throw error;

      setSuccessMsg(`Automação "${nome}" criada com sucesso!`);
      setNome("");
      setPrompt("");
      setCronMinutos("15");
      await loadData();
    } catch (err) {
      setErrorMsg(err?.message || "Erro ao criar automação.");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleAtivo = async (auto) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const { error } = await supabase
        .from("automations")
        .update({ ativo: !auto.ativo })
        .eq("id", auto.id);

      if (error) throw error;

      setSuccessMsg(`Automação "${auto.nome}" ${!auto.ativo ? "ativada" : "desativada"}.`);
      await loadData();
    } catch (err) {
      setErrorMsg(err?.message || "Erro ao alterar status da automação.");
    }
  };

  const handleDelete = async (auto) => {
    if (!window.confirm(`Deseja realmente apagar a automação "${auto.nome}"?`)) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const { error } = await supabase
        .from("automations")
        .delete()
        .eq("id", auto.id);

      if (error) throw error;

      setSuccessMsg(`Automação "${auto.nome}" removida.`);
      await loadData();
    } catch (err) {
      setErrorMsg(err?.message || "Erro ao apagar automação.");
    }
  };

  const handleExecutarAgora = async (auto) => {
    setExecutingId(auto.id);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await api("automations-run", {
        method: "POST",
        body: { automation_id: auto.id },
      });

      if (!res.ok) {
        throw new Error(res.error || "Falha na execução.");
      }

      setSuccessMsg(`Execução concluída para "${auto.nome}" (status: ${res.status}).`);
      await loadData();
    } catch (err) {
      setErrorMsg(err?.message || "Erro ao executar automação.");
    } finally {
      setExecutingId(null);
    }
  };

  if (!logged) {
    return (
      <div className="panel-card">
        <p style={{ color: "#a3a3a3", fontSize: "13px", margin: 0 }}>
          Requer login para acessar as Automações. Por favor, entre na sua conta.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* Mensagens de feedback */}
      {errorMsg && (
        <div style={{ background: "#2a0808", border: "1px solid #7f1d1d", color: "#f87171", padding: "8px 12px", borderRadius: "8px", fontSize: "12px" }}>
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div style={{ background: "#052e16", border: "1px solid #14532d", color: "#4ade80", padding: "8px 12px", borderRadius: "8px", fontSize: "12px" }}>
          {successMsg}
        </div>
      )}

      {/* Formulário de Criação */}
      <div className="panel-card" style={{ margin: 0 }}>
        <b style={{ color: "#fff", display: "block", marginBottom: "8px", fontSize: "13px" }}>
          Nova Automação
        </b>
        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div>
            <label style={{ fontSize: "11px", color: "#8d8d8d", display: "block", marginBottom: "3px" }}>
              Nome da automação
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Resumo de notícias, Cotações..."
              required
              disabled={creating}
              style={{
                width: "100%",
                background: "#050505",
                border: "1px solid #282828",
                borderRadius: "6px",
                padding: "7px 10px",
                color: "#fff",
                fontSize: "13px",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: "11px", color: "#8d8d8d", display: "block", marginBottom: "3px" }}>
              Prompt para o Agente / Chat
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex: Pesquise a cotação do dólar hoje e resuma em tópicos..."
              required
              rows={3}
              disabled={creating}
              style={{
                width: "100%",
                background: "#050505",
                border: "1px solid #282828",
                borderRadius: "6px",
                padding: "7px 10px",
                color: "#fff",
                fontSize: "12px",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: "11px", color: "#8d8d8d", display: "block", marginBottom: "3px" }}>
              Intervalo de execução
            </label>
            <select
              value={cronMinutos}
              onChange={(e) => setCronMinutos(e.target.value)}
              disabled={creating}
              style={{
                width: "100%",
                background: "#050505",
                border: "1px solid #282828",
                borderRadius: "6px",
                padding: "7px 10px",
                color: "#fff",
                fontSize: "12px",
                boxSizing: "border-box",
              }}
            >
              <option value="5">A cada 5 minutos</option>
              <option value="15">A cada 15 minutos</option>
              <option value="30">A cada 30 minutos</option>
              <option value="60">A cada 1 hora</option>
              <option value="360">A cada 6 horas</option>
              <option value="1440">A cada 24 horas</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={creating || !nome.trim() || !prompt.trim()}
            style={{
              marginTop: "4px",
              background: creating ? "#444" : "var(--red)",
              color: "#000",
              fontWeight: "bold",
              border: "none",
              borderRadius: "6px",
              padding: "8px 12px",
              cursor: creating ? "not-allowed" : "pointer",
              fontSize: "12px",
            }}
          >
            {creating ? "Criando..." : "Criar Automação"}
          </button>
        </form>
      </div>

      {/* Lista de Automações */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: "11px", color: "#8d8d8d", letterSpacing: "1px", textTransform: "uppercase" }}>
          Suas Automações ({automations.length})
        </span>

        {loading && automations.length === 0 ? (
          <p style={{ color: "#8d8d8d", fontSize: "13px" }}>Carregando automações...</p>
        ) : automations.length === 0 ? (
          <div className="panel-card" style={{ margin: 0, textAlign: "center", color: "#8d8d8d", padding: "16px" }}>
            Nenhuma automação cadastrada ainda.
          </div>
        ) : (
          automations.map((auto) => {
            const isExecuting = executingId === auto.id;

            return (
              <div
                key={auto.id}
                className="panel-card"
                style={{
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  borderColor: isExecuting ? "var(--red)" : "#1f1f1f",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <b style={{ color: "#fff", fontSize: "13px" }}>{auto.nome}</b>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: "10px",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: "#1f1f1f",
                        color: "#aaa",
                      }}
                    >
                      {auto.cron_minutos} min
                    </span>
                    <span
                      style={{
                        fontSize: "10px",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        fontWeight: "bold",
                        background: auto.ativo ? "#14532d" : "#2a2a2a",
                        color: auto.ativo ? "#4ade80" : "#888",
                      }}
                    >
                      {auto.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                </div>

                <p style={{ fontSize: "12px", color: "#aaa", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {auto.prompt}
                </p>

                {/* Ações */}
                <div style={{ display: "flex", gap: "6px", marginTop: "4px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => handleExecutarAgora(auto)}
                    disabled={isExecuting}
                    style={{
                      flex: 1,
                      background: isExecuting ? "#444" : "#1e293b",
                      color: isExecuting ? "#ccc" : "#38bdf8",
                      border: "1px solid #334155",
                      borderRadius: "6px",
                      padding: "6px 10px",
                      fontSize: "11px",
                      fontWeight: "bold",
                      cursor: isExecuting ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "4px",
                    }}
                  >
                    <IconZap style={{ width: 14, height: 14 }} />
                    {isExecuting ? "Executando..." : "Executar agora"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleAtivo(auto)}
                    style={{
                      background: "#141414",
                      color: auto.ativo ? "#fbbf24" : "#4ade80",
                      border: "1px solid #282828",
                      borderRadius: "6px",
                      padding: "6px 10px",
                      fontSize: "11px",
                      cursor: "pointer",
                    }}
                  >
                    {auto.ativo ? "Desativar" : "Ativar"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(auto)}
                    style={{
                      background: "#141414",
                      color: "#f87171",
                      border: "1px solid #282828",
                      borderRadius: "6px",
                      padding: "6px 10px",
                      fontSize: "11px",
                      cursor: "pointer",
                    }}
                  >
                    Apagar
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Histórico das últimas 10 execuções */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "6px" }}>
        <span style={{ fontSize: "11px", color: "#8d8d8d", letterSpacing: "1px", textTransform: "uppercase" }}>
          Histórico Recente (Últimas 10 Runs)
        </span>

        {runs.length === 0 ? (
          <div className="panel-card" style={{ margin: 0, textAlign: "center", color: "#8d8d8d", padding: "12px", fontSize: "12px" }}>
            Nenhuma execução registrada no histórico.
          </div>
        ) : (
          runs.map((run) => {
            const autoRel = automations.find((a) => a.id === run.automation_id);
            const isSucesso = run.status === "sucesso";
            const isExpanded = expandedRunId === run.id;
            const resText = run.resultado || "";
            const isTruncated = resText.length > 80;
            const previewText = isTruncated ? resText.slice(0, 80) + "..." : resText;

            return (
              <div
                key={run.id}
                className="panel-card"
                style={{
                  margin: 0,
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  fontSize: "12px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#fff", fontWeight: "bold", fontSize: "12px" }}>
                    {autoRel?.nome || "Automação"}
                  </span>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: "10px",
                        padding: "1px 5px",
                        borderRadius: "4px",
                        fontWeight: "bold",
                        background: isSucesso ? "#14532d" : "#7f1d1d",
                        color: isSucesso ? "#4ade80" : "#f87171",
                      }}
                    >
                      {run.status}
                    </span>
                    <span style={{ color: "#666", fontSize: "10px" }}>
                      {new Date(run.iniciado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>

                <p
                  style={{
                    color: "#ccc",
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontSize: "11.5px",
                    fontFamily: "var(--mono)",
                  }}
                >
                  {isExpanded ? resText : previewText}
                </p>

                {isTruncated && (
                  <button
                    type="button"
                    onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#38bdf8",
                      fontSize: "10px",
                      padding: 0,
                      textAlign: "left",
                      cursor: "pointer",
                      marginTop: "2px",
                    }}
                  >
                    {isExpanded ? "Ver menos" : "Ver resultado completo"}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
