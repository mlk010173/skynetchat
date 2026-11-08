// SKYNET · biblioteca de prompts úteis + prompts salvos pelo usuário.
const CHAVE = "skynet.agente.prompts.v1";

export const PROMPTS_BASE = [
  { id: "p1", tag: "pesquisa", titulo: "Dossiê com fontes", texto: "Monte um dossiê sobre [tema] com fontes primárias, números e o que ainda está em disputa." },
  { id: "p2", tag: "pesquisa", titulo: "Contra-argumento", texto: "Ache os melhores argumentos contra [tese] e diga onde ela quebra." },
  { id: "p3", tag: "análise", titulo: "Comparar dois caminhos", texto: "Compare [A] e [B] em custo, prazo, risco e reversibilidade. Feche com uma escolha." },
  { id: "p4", tag: "código", titulo: "Revisar código", texto: "Revise este código procurando bug real, corrida e vazamento:\n\n```\n[cole aqui]\n```" },
  { id: "p5", tag: "código", titulo: "Explicar decisão técnica", texto: "Explique como se eu fosse júnior por que [decisão técnica] foi tomada e o que ela custa." },
  { id: "p6", tag: "escrita", titulo: "Reescrever sem enfeite", texto: "Reescreva este texto mais curto e direto, sem perder fato nem ressalva:\n\n[cole aqui]" },
  { id: "p7", tag: "escrita", titulo: "Resumo executivo", texto: "Resuma [documento/tema] em 5 linhas, com a decisão que precisa ser tomada no fim." },
  { id: "p8", tag: "estudo", titulo: "Plano de estudo", texto: "Monte um plano de 30 dias para aprender [assunto], com entrega prática a cada semana." },
  { id: "p9", tag: "decisão", titulo: "Pré-mortem", texto: "Faça o pré-mortem de [plano]: em 6 meses deu errado. O que aconteceu primeiro?" },
  { id: "p10", tag: "dados", titulo: "Ler números", texto: "Recebi estes números: [dados]. O que eles mostram, o que não mostram e que dado falta." },
];

const ler = () => {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE) || "[]");
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
};

const gravar = (lista) => {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista.slice(0, 80)));
  } catch {
    /* modo privado */
  }
  return lista;
};

export function lerPrompts() {
  return ler();
}

export function salvarPrompt(titulo, texto, tag = "meu") {
  const t = String(titulo || "").trim() || "prompt salvo";
  const x = String(texto || "").trim();
  if (x.length < 5) return ler();
  return gravar([{ id: String(Date.now()), titulo: t.slice(0, 60), texto: x.slice(0, 600), tag }, ...ler()]);
}

export function removerPrompt(id) {
  return gravar(ler().filter((p) => p.id !== id));
}

export function todosPrompts() {
  return [...lerPrompts(), ...PROMPTS_BASE];
}
