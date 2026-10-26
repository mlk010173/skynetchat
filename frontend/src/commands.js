/** Comandos de ferramenta digitados no chat (puro e testavel). */
export const COMANDOS = [
  { nome: "pesquisar", ajuda: "Pesquisa na web agora (tempo real)", ex: "/pesquisar ultimas noticias de IA" },
  { nome: "abrir", ajuda: "Abre uma pagina e resume o conteudo", ex: "/abrir https://exemplo.com" },
  { nome: "ferramentas", ajuda: "Lista as ferramentas do agente", ex: "/ferramentas" },
];

export function parseCommand(texto) {
  const t = String(texto ?? "").trim();
  const m = t.match(/^\/([a-zA-Z_]+)\s*([\s\S]*)$/);
  if (!m) return null;
  return { nome: m[1].toLowerCase(), args: m[2].trim() };
}

export function ajudaComandos() {
  return COMANDOS.map((c) => `/${c.nome} — ${c.ajuda}\n   ex.: ${c.ex}`).join("\n");
}
