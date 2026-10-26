/** Catalogo e logica de modelos — puro e testavel. */

const INFO = {
  "nvidia/nemotron-3.5-super-vl-120b-a12b": { short: "Nemotron 3.5 Super", tier: "topo" },
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning": { short: "Nemotron Nano", tier: "medio" },
  "nvidia/nemotron-3.5-lightning-30b-a3b": { short: "Nemotron Lightning", tier: "leve" },
};

export function parseModels(value) {
  if (!value) return [];
  const seen = new Set();
  const out = [];
  for (const raw of String(value).split(",")) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function labelFor(id) {
  if (INFO[id]) return INFO[id].short;
  const tail = String(id).split("/").pop() ?? String(id);
  return tail.replace(/[-_]/g, " ").slice(0, 28);
}

export function tierFor(id) {
  return INFO[id]?.tier ?? "medio";
}

/** Modelo escolhido primeiro; os outros entram como reserva. */
export function orderModels(current, all) {
  const list = parseModels((all ?? []).join(","));
  if (!current) return list;
  return [current, ...list.filter((m) => m !== current)];
}

/** Proximo modelo de reserva, ou null quando acabou. */
export function nextModel(current, all) {
  const list = parseModels((all ?? []).join(","));
  const i = list.indexOf(current);
  if (i === -1) return list.length ? list[0] : null;
  return i + 1 < list.length ? list[i + 1] : null;
}

/** Fila de tentativas: o escolhido primeiro, o resto como reserva. */
export function fallbackChain(current, all) {
  return orderModels(current, all);
}
