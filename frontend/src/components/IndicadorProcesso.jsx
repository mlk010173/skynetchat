// SKYNET · indicador de processamento com fases reais do pedido.
// Cada fase corresponde ao que o agente está fazendo naquele momento.
import { useEffect, useState } from "react";

const FASES = {
  pensando: { rotulo: "Agente pensando", dica: "organizando o pedido" },
  pesquisa: { rotulo: "Pesquisando na internet", dica: "abrindo fontes e comparando" },
  imagem: { rotulo: "Analisando imagem", dica: "lendo o que está no print" },
  documento: { rotulo: "Lendo documento", dica: "extraindo o texto do arquivo" },
  gerando: { rotulo: "Gerando resposta", dica: "escrevendo e conferindo" },
  enviando: { rotulo: "Processando solicitação", dica: "enviando para o motor" },
};

export default function IndicadorProcesso({ fase = "pensando", segundos = 0 }) {
  const [atual, setAtual] = useState(fase);
  useEffect(() => { setAtual(fase); }, [fase]);
  const info = FASES[atual] || FASES.pensando;
  return (
    <div className={`indicador-processo fase-${atual}`} role="status" aria-live="polite">
      <span className="ip-orb" aria-hidden="true"><i /><i /><i /></span>
      <span className="ip-texto">
        <b>{info.rotulo}…</b>
        <small>{info.dica}{segundos > 2 ? ` · ${segundos}s` : ""}</small>
      </span>
      <span className="ip-barra" aria-hidden="true"><i /></span>
    </div>
  );
}
