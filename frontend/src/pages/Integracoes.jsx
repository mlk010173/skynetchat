import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AuthShell from "../components/AuthShell.jsx";
import {
  IconBrain,
  IconCode,
  IconDatabase,
  IconGlobe,
  IconMail,
  IconPlug,
  IconServer,
} from "../components/Icons.jsx";
import { api } from "../lib.js";

/** Map icons by integration ID */
function getIcon(id) {
  switch (id) {
    case "agente":
      return IconServer;
    case "ia":
      return IconBrain;
    case "web":
      return IconGlobe;
    case "terminal":
      return IconCode;
    case "email":
      return IconMail;
    case "banco":
      return IconDatabase;
    default:
      return IconPlug;
  }
}

/** Render status badge with exact color and label */
function renderStatusBadge(estado) {
  switch (estado) {
    case "online":
      return (
        <span className="badge-status online" style={badgeStyle("#22c55e", "rgba(34, 197, 94, 0.15)")}>
          ● Online
        </span>
      );
    case "dormindo":
      return (
        <span className="badge-status dormindo" style={badgeStyle("#eab308", "rgba(234, 179, 8, 0.15)")}>
          ● Standby
        </span>
      );
    case "pendente_configuracao":
      return (
        <span className="badge-status pendente" style={badgeStyle("#f59e0b", "rgba(245, 158, 11, 0.15)")}>
          ● Pendente Configuração
        </span>
      );
    case "indisponivel":
    default:
      return (
        <span className="badge-status indisponivel" style={badgeStyle("#ef4444", "rgba(239, 68, 68, 0.15)")}>
          ● Indisponível
        </span>
      );
  }
}

function badgeStyle(color, bg) {
  return {
    color,
    background: bg,
    border: `1px solid ${color}`,
    borderRadius: "999px",
    padding: "3px 10px",
    fontSize: "11px",
    fontWeight: "600",
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    letterSpacing: "0.5px",
  };
}

export default function Integracoes() {
  const [integracoes, setIntegracoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState(null); // id of integration currently being tested
  const [lastCheck, setLastCheck] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const carregarIntegracoes = useCallback(async (singleId = null) => {
    if (singleId) {
      setTestingId(singleId);
    } else {
      setLoading(true);
    }
    setErrorMsg("");

    try {
      const data = await api("integracoes");
      if (data?.ok && Array.isArray(data.integracoes)) {
        setIntegracoes(data.integracoes);
        setLastCheck(new Date().toLocaleTimeString("pt-BR"));
      } else {
        setErrorMsg("Não foi possível consultar os estados das integrações.");
      }
    } catch (err) {
      setErrorMsg(String(err?.message || err));
    } finally {
      setLoading(false);
      setTestingId(null);
    }
  }, []);

  useEffect(() => {
    carregarIntegracoes();
  }, [carregarIntegracoes]);

  return (
    <AuthShell title="CENTRAL DE INTEGRAÇÕES" links={<Link to="/">VOLTAR AO CHAT</Link>}>
      <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p style={{ margin: 0, fontSize: "13px", color: "#ccc" }}>
            Status real das integrações consultado ao vivo no backend Supabase.
          </p>
          {lastCheck && (
            <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: "#888" }}>
              Última verificação: {lastCheck}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => carregarIntegracoes()}
          disabled={loading || testingId !== null}
          style={{
            background: "#161616",
            border: "1px solid #333",
            color: "#fff",
            borderRadius: "6px",
            padding: "8px 14px",
            fontSize: "12px",
            fontWeight: "600",
            cursor: loading ? "wait" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            transition: "all 0.15s ease",
          }}
        >
          {loading ? "Testando..." : "Testar Tudo Ao Vivo"}
        </button>
      </div>

      {errorMsg && (
        <div style={{ padding: "10px", background: "#2a1010", border: "1px solid #5a1c1c", color: "#fca5a5", borderRadius: "6px", marginBottom: "16px", fontSize: "12px" }}>
          {errorMsg}
        </div>
      )}

      {loading && !integracoes.length ? (
        <div style={{ padding: "24px 0", textAlign: "center", color: "#888", fontSize: "13px" }}>
          Consultando serviços e secrets do backend ao vivo...
        </div>
      ) : (
        <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", marginBottom: "20px" }}>
          {integracoes.map((item) => {
            const IconComponent = getIcon(item.id);
            const isTestingThis = testingId === item.id || (loading && testingId === null);

            return (
              <div
                key={item.id}
                className="integracao-card"
                style={{
                  background: "#0d0d0d",
                  border: item.estado === "online" ? "1px solid #1f2937" : item.estado === "pendente_configuracao" ? "1px solid #374151" : "1px solid #1a1a1a",
                  borderRadius: "10px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  justify: "space-between",
                  gap: "12px",
                  position: "relative",
                  boxSizing: "border-box",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ padding: "8px", background: "#161616", borderRadius: "8px", color: item.estado === "online" ? "#22c55e" : "#aaa", display: "flex" }}>
                      <IconComponent style={{ width: "20px", height: "20px" }} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "600", color: "#f3f4f6" }}>
                        {item.nome}
                      </h3>
                      <p style={{ margin: "2px 0 0 0", fontSize: "11px", color: "#9ca3af", fontFamily: "var(--mono)" }}>
                        id: {item.id}
                      </p>
                    </div>
                  </div>

                  <div>{renderStatusBadge(item.estado)}</div>
                </div>

                <div style={{ background: "#050505", border: "1px solid #1a1a1a", borderRadius: "6px", padding: "10px", fontSize: "12px" }}>
                  <span style={{ color: "#888", display: "block", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "3px" }}>
                    Detalhe em tempo real
                  </span>
                  <span style={{ color: item.estado === "pendente_configuracao" ? "#fbbf24" : "#e5e7eb", fontWeight: "500", wordBreak: "break-word" }}>
                    {item.detalhe}
                  </span>
                </div>

                {item.estado === "pendente_configuracao" && (
                  <div style={{ fontSize: "11px", color: "#f59e0b", background: "rgba(245, 158, 11, 0.08)", border: "1px dashed rgba(245, 158, 11, 0.3)", borderRadius: "6px", padding: "8px 10px" }}>
                    <b>Pendente:</b> {item.detalhe}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "auto" }}>
                  <button
                    type="button"
                    onClick={() => carregarIntegracoes(item.id)}
                    disabled={isTestingThis}
                    style={{
                      background: isTestingThis ? "#222" : "var(--red, #dc2626)",
                      color: isTestingThis ? "#888" : "#000",
                      border: "none",
                      borderRadius: "6px",
                      padding: "6px 14px",
                      fontSize: "12px",
                      fontWeight: "bold",
                      cursor: isTestingThis ? "wait" : "pointer",
                      transition: "all 0.15s ease",
                      fontFamily: "var(--mono)",
                    }}
                  >
                    {isTestingThis ? "Testando..." : "Testar"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="hint" style={{ marginTop: "12px", textAlign: "center" }}>
        Todos os testes consultam a infraestrutura e secrets ativas em tempo real. Sem botões falsos ou simulações.
      </p>
    </AuthShell>
  );
}
