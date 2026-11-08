// SKYNET · memória do agente (local, sem servidor).
// Fatos que o usuário quer que o agente lembre entre conversas neste navegador.
const CHAVE = "skynet.agente.memoria.v1";
const LIMITE = 200;

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
    localStorage.setItem(CHAVE, JSON.stringify(lista.slice(0, LIMITE)));
  } catch {
    /* modo privado */
  }
  return lista;
};

export function lerMemoria() {
  return ler();
}

export function lembrar(texto) {
  const t = String(texto || "").replace(/\s+/g, " ").trim();
  if (t.length < 3) return ler();
  const lista = ler().filter((m) => m.texto.toLowerCase() !== t.toLowerCase());
  lista.unshift({ id: String(Date.now()), texto: t.slice(0, 240), quando: new Date().toISOString() });
  return gravar(lista);
}

export function esquecer(id) {
  return gravar(ler().filter((m) => m.id !== id));
}

export function limparMemoria() {
  return gravar([]);
}

/** Texto injetado antes do pedido; vazio quando não há nada lembrado. */
export function memoriaParaPrompt(max = 12) {
  const lista = ler().slice(0, max);
  if (!lista.length) return "";
  return `O que você já sabe sobre mim (memória):\n${lista.map((m) => `- ${m.texto}`).join("\n")}`;
}
