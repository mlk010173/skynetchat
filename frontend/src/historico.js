// SKYNET · histórico local de dossiês (o "Arquivo" do agente).
// Guarda o resultado das pesquisas para reabrir depois, sem servidor.
const CHAVE = "skynet.agente.arquivo.v1";
const LIMITE = 60;

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
  } catch {}
};

export function lerArquivo() {
  return ler();
}

/** Guarda um dossiê. Devolve o item salvo (com id). */
export function guardarDossie(pedido, spec) {
  if (!spec || !Array.isArray(spec.itens) || !spec.itens.length) return null;
  const item = {
    id: `d_${Date.now().toString(36)}`,
    pedido: String(pedido || "").slice(0, 220),
    quando: new Date().toISOString(),
    titulo: spec.titulo || "Dossiê",
    fontes: spec.itens.length,
    lidas: spec.itens.filter((f) => f.excerto).length,
    itens: spec.itens.slice(0, 14).map((f) => ({
      titulo: f.titulo,
      url: f.url,
      domain: f.domain,
      excerto: f.excerto || "",
      resumo: f.resumo || "",
    })),
  };
  const lista = ler().filter((x) => x.pedido !== item.pedido || x.titulo !== item.titulo);
  gravar([item, ...lista]);
  return item;
}

export function removerDossie(id) {
  gravar(ler().filter((x) => x.id !== id));
  return ler();
}

export function limparArquivo() {
  gravar([]);
  return [];
}

/** Transforma um item do arquivo de volta em spec de dossiê para o chat. */
export function specDoArquivo(item) {
  if (!item) return null;
  return {
    tipo: "fontes",
    titulo: item.titulo,
    subtitulo: `${item.fontes} fontes · arquivo de ${new Date(item.quando).toLocaleDateString("pt-BR")}`,
    itens: item.itens,
    rodape: "do arquivo local",
  };
}
