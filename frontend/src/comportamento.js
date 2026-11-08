// SKYNET · camada de comportamento: transforma as configurações em instrução
// curta enviada junto do pedido. Nada aqui depende do backend.

export const TONS = {
  neutro: { rotulo: "Neutro", dica: "" },
  direto: { rotulo: "Direto", dica: "Responda direto, sem preâmbulo e sem repetir a pergunta." },
  tecnico: { rotulo: "Técnico", dica: "Responda em linguagem técnica, com nomes próprios e números exatos." },
  professor: { rotulo: "Professor", dica: "Explique passo a passo, definindo cada termo na primeira vez que aparecer." },
  critico: { rotulo: "Crítico", dica: "Aponte o que está frágil ou mal fundamentado antes de concordar." },
  amigavel: { rotulo: "Amigável", dica: "Fale de forma próxima e simples, sem jargão desnecessário." },
};

export const ESTILOS = {
  conciso: { rotulo: "Conciso", dica: "Máximo 6 linhas; se precisar de mais, use tópicos de uma linha." },
  padrao: { rotulo: "Padrão", dica: "" },
  detalhado: { rotulo: "Detalhado", dica: "Desenvolva com contexto, exemplos e ressalvas." },
  checklist: { rotulo: "Passo a passo", dica: "Entregue como lista numerada de passos executáveis." },
};

export const RACIOCINIO = {
  rapido: { rotulo: "Rápido", etapas: 3, verificar: false, desc: "resposta curta, sem segunda passada" },
  padrao: { rotulo: "Padrão", etapas: 6, verificar: true, desc: "checagem simples de coerência" },
  profundo: { rotulo: "Profundo", etapas: 12, verificar: true, desc: "revisa, testa hipótese e revisa de novo" },
};

/** Monta o bloco que vai junto com a mensagem do usuário. */
export function camadaDeComportamento(cfg = {}, memoria = "", extra = "") {
  const partes = [];
  const tom = TONS[cfg.tom];
  if (tom?.dica) partes.push(tom.dica);
  const estilo = ESTILOS[cfg.estilo];
  if (estilo?.dica) partes.push(estilo.dica);
  const raciocinio = RACIOCINIO[cfg.raciocinio];
  if (cfg.raciocinio === "profundo") partes.push("Antes de responder, levante as duas melhores objeções ao seu próprio raciocínio e responda a elas.");
  if (cfg.citacaoObrigatoria) partes.push("Numere as fontes que usar; se não houver fonte, diga que é inferência.");
  if (cfg.idioma === "pt") partes.push("Responda em português do Brasil.");
  if (cfg.idioma === "en") partes.push("Answer in English.");
  if (memoria) partes.push(memoria);
  if (extra) partes.push(extra);
  if (!partes.length) return "";
  return `[orientações do painel]\n${partes.join("\n")}`;
}

export function resumoComportamento(cfg = {}) {
  const tom = TONS[cfg.tom]?.rotulo || "—";
  const estilo = ESTILOS[cfg.estilo]?.rotulo || "—";
  const r = RACIOCINIO[cfg.raciocinio]?.rotulo || "—";
  return `${tom} · ${estilo} · raciocínio ${r}`;
}
