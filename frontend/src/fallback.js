// SKYNET · modo local: resposta montada no navegador quando o backend falha.
// Usa o dossiê já pesquisado (fontes lidas na íntegra + resumo executivo) para
// que o chat continue respondendo mesmo com a API fora (429, queda, sem cota).
import { pesquisarProfundo } from "./agente.js";
import { convergencia, resumoTldr } from "./habilidades.js";

const limpo = (t) => String(t == null ? "" : t).replace(/\s+/g, " ").trim();

function frasesDe(item) {
  const base = limpo(item.excerto || item.resumo || "");
  if (!base) return [];
  return base
    .split(/(?<=[.!?])\s+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 60 && f.length < 320);
}

/** Monta uma resposta em markdown a partir de um dossiê pronto. */
export function respostaLocal(pedido, dossie) {
  const fontes = (dossie && dossie.fontes) || [];
  const plano = (dossie && dossie.plano) || { ramos: [] };
  if (!fontes.length) {
    return [
      "> modo local: o servidor do chat não respondeu e a busca também voltou vazia.",
      "",
      "Não vou inventar. Tente reformular o pedido ou repetir em alguns segundos.",
    ].join("\n");
  }

  const lidas = fontes.filter((f) => f.excerto);
  const consenso = convergencia(fontes).slice(0, 5);
  const tldr = resumoTldr(fontes);

  const partes = [];
  partes.push(`**Resposta em modo local** — o servidor do chat não respondeu (limite ou queda), então montei isto direto das ${fontes.length} fontes que acabei de pesquisar.`);
  partes.push("");
  partes.push("### O que os dados mostram");
  const tiros = (lidas.length ? lidas : fontes).slice(0, 4);
  tiros.forEach((f, i) => {
    const frase = frasesDe(f)[0] || limpo(f.resumo) || limpo(f.titulo);
    partes.push(`${i + 1}. **${limpo(f.titulo)}** — ${frase} [${i + 1}]`);
  });

  if (consenso.length) {
    partes.push("");
    partes.push("### Convergência entre veículos");
    partes.push(`Aparecem em vários domínios diferentes: ${consenso.join(", ")}. Onde só um veículo fala, trate como versão única.`);
  }

  if (tldr && tldr.linhas?.length) {
    partes.push("");
    partes.push("### Em três linhas");
    tldr.linhas.forEach((l) => partes.push(`- ${l.texto}`));
    if (tldr.numeros?.length) partes.push(`_Números citados:_ ${tldr.numeros.join(" · ")}`);
  }

  partes.push("");
  partes.push("### De onde veio");
  fontes.slice(0, 6).forEach((f, i) => {
    partes.push(`${i + 1}. [${limpo(f.titulo)}](${f.url}) — ${f.domain || ""}`);
  });

  if (plano.ramos?.length) {
    partes.push("");
    partes.push(`_Frentes usadas: ${plano.ramos.map((r) => r.chave).join(", ")}._`);
  }

  return partes.join("\n");
}

/** Pesquisa do zero e devolve resposta local (usado quando nada está pronto). */
export async function responderLocal(pedido, aoPasso) {
  const dossie = await pesquisarProfundo(pedido, { aoPasso });
  return { texto: respostaLocal(pedido, dossie), dossie };
}
