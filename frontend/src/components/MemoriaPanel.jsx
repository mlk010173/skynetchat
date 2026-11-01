import React, { useCallback, useEffect, useState } from "react";
import { api } from "../lib.js";
import { IconBrain, IconClock } from "./Icons.jsx";

export default function MemoriaPanel({ logged }) {
  const [memorias, setMemorias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const loadMemorias = useCallback(async () => {
    if (!logged) {
      setMemorias([]);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api("memorias", {
        method: "POST",
        body: { action: "list" },
      });

      if (!res.ok) {
        throw new Error(res.error || "Erro ao carregar memórias.");
      }

      setMemorias(res.memorias || res.data || []);
    } catch (err) {
      setErrorMsg(err?.message || "Erro ao comunicar com o serviço de memória.");
    } finally {
      setLoading(false);
    }
  }, [logged]);

  useEffect(() => {
    loadMemorias();
  }, [loadMemorias]);

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleDelete = async (memoria) => {
    if (!window.confirm("Deseja realmente apagar esta memória de longo prazo?")) return;

    setDeletingId(memoria.id);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await api("memorias", {
        method: "POST",
        body: { action: "delete", id: memoria.id },
      });

      if (!res.ok) {
        throw new Error(res.error || "Erro ao apagar memória.");
      }

      setSuccessMsg("Memória apagada com sucesso.");
      if (expandedId === memoria.id) setExpandedId(null);
      await loadMemorias();
    } catch (err) {
      setErrorMsg(err?.message || "Falha ao apagar memória.");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      return d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  if (!logged) {
    return (
      <div className="panel-card" style={{ background: "#0a0a0a", border: "1px solid #222" }}>
        <p style={{ color: "#a3a3a3", fontSize: "13px", margin: 0 }}>
          Requer login para acessar o painel de Memória. Por favor, entre na sua conta.
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

      {/* Cabeçalho do Painel */}
      <div className="panel-card" style={{ background: "#0a0a0a", border: "1px solid #222", margin: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <IconBrain style={{ color: "#C41E3A", width: "18px", height: "18px" }} />
            <b style={{ color: "#fff", fontSize: "13px" }}>Memória de Longo Prazo</b>
          </div>
          <button
            type="button"
            onClick={loadMemorias}
            disabled={loading}
            style={{
              background: "#161616",
              border: "1px solid #333",
              color: "#ccc",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "11px",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
        <p style={{ color: "#8d8d8d", fontSize: "11px", marginTop: "6px", marginBottom: 0 }}>
          Memórias e fatos recordados automaticamente pelo assistente ao longo das suas conversas.
        </p>
      </div>

      {/* Lista de Memórias */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: "11px", color: "#8d8d8d", letterSpacing: "1px", textTransform: "uppercase" }}>
          Memórias Gravadas ({memorias.length})
        </span>

        {loading && memorias.length === 0 ? (
          <p style={{ color: "#8d8d8d", fontSize: "13px" }}>Carregando memórias...</p>
        ) : memorias.length === 0 ? (
          <div className="panel-card" style={{ background: "#0a0a0a", border: "1px solid #222", margin: 0, textAlign: "center", color: "#8d8d8d", padding: "16px", fontSize: "13px" }}>
            Nenhuma memória salva ainda.
          </div>
        ) : (
          memorias.map((item) => {
            const isExpanded = expandedId === item.id;
            const isDeleting = deletingId === item.id;
            const textoFormatado = item.texto || "";
            const resumo = textoFormatado.length > 120 && !isExpanded
              ? textoFormatado.slice(0, 120) + "..."
              : textoFormatado;

            return (
              <div
                key={item.id}
                className="panel-card"
                style={{
                  background: "#0a0a0a",
                  border: "1px solid #222",
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#8d8d8d", fontSize: "11px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <IconClock style={{ width: "12px", height: "12px" }} />
                    <span>{formatDate(item.criado_em)}</span>
                  </div>
                  {item.score !== null && item.score !== undefined && (
                    <span style={{ background: "#1a1a1a", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", color: "#aaa" }}>
                      relevância: {item.score}
                    </span>
                  )}
                </div>

                <div style={{ color: "#eee", fontSize: "12px", lineHeight: "1.4", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {resumo}
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
                  {textoFormatado.length > 120 && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(item.id)}
                      style={{
                        background: "transparent",
                        border: "1px solid #333",
                        color: "#ccc",
                        borderRadius: "4px",
                        padding: "3px 8px",
                        fontSize: "11px",
                        cursor: "pointer",
                      }}
                    >
                      {isExpanded ? "Recolher" : "Ver completo"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    disabled={isDeleting}
                    style={{
                      background: isDeleting ? "#444" : "#2a0808",
                      border: "1px solid #7f1d1d",
                      color: "#f87171",
                      borderRadius: "4px",
                      padding: "3px 8px",
                      fontSize: "11px",
                      cursor: isDeleting ? "not-allowed" : "pointer",
                    }}
                  >
                    {isDeleting ? "Apagando..." : "Apagar"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
