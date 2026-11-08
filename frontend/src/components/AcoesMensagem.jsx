// SKYNET · barra de ações da mensagem: copiar, ouvir, baixar, avaliar e
// regenerar. Tudo local; nada depende do backend.
import { useState } from "react";
import { falar, pararFala } from "../voz.js";
import { baixarArquivo, paraMarkdown } from "../habilidades.js";

const CHAVE = "skynet.agente.avaliacoes.v1";

const lerNotas = () => {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) || "{}");
  } catch {
    return {};
  }
};

const gravarNota = (id, valor) => {
  const mapa = lerNotas();
  if (valor === null) delete mapa[id];
  else mapa[id] = valor;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(mapa));
  } catch {}
  return mapa;
};

export default function AcoesMensagem({ id, texto, papel = "assistant", aoRegenerar, aoOuvir, say }) {
  const [copiado, setCopiado] = useState(false);
  const [nota, setNota] = useState(() => lerNotas()[id] || null);
  const [falando, setFalando] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto || "");
      setCopiado(true);
      say?.("Copiado.");
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      say?.("Não consegui copiar neste navegador.");
    }
  };

  const ouvir = async () => {
    if (falando) {
      pararFala();
      setFalando(false);
      return;
    }
    try {
      setFalando(true);
      await (aoOuvir ? aoOuvir(texto) : falar(texto));
    } catch {
      say?.("Voz indisponível agora.");
    } finally {
      setFalando(false);
    }
  };

  const baixar = () => {
    baixarArquivo(`skynet-${id}.md`, paraMarkdown("Mensagem SKYNET", [{ tipo: "par", texto }]));
    say?.("Mensagem salva em markdown.");
  };

  const avaliar = (valor) => {
    const proximo = nota === valor ? null : valor;
    setNota(proximo);
    gravarNota(id, proximo);
    say?.(proximo === "util" ? "Marcado como útil." : proximo === "ruim" ? "Anotado como ruim." : "Avaliação removida.");
  };

  return (
    <div className="acoes-msg" role="group" aria-label="ações da mensagem">
      <button type="button" onClick={copiar}>{copiado ? "copiado" : "copiar"}</button>
      {papel === "assistant" && (
        <>
          <button type="button" onClick={ouvir}>{falando ? "parar voz" : "ouvir"}</button>
          {aoRegenerar && <button type="button" onClick={() => aoRegenerar()}>regenerar</button>}
          <button type="button" onClick={baixar}>.md</button>
          <span className="acoes-voto">
            <button
              type="button"
              className={nota === "util" ? "on" : ""}
              aria-label="resposta útil"
              onClick={() => avaliar("util")}
            >
              ▲
            </button>
            <button
              type="button"
              className={nota === "ruim" ? "on" : ""}
              aria-label="resposta ruim"
              onClick={() => avaliar("ruim")}
            >
              ▼
            </button>
          </span>
        </>
      )}
    </div>
  );
}
