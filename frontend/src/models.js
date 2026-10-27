/** Catalogo e logica de modelos — puro e testavel. */

const INFO = {
  "nvidia/nemotron-3-ultra-550b-a55b": { short: "Nemotron Ultra 550B", tier: "topo", familia: "NVIDIA" },
  "nvidia/nemotron-3.5-super-vl-120b-a12b": { short: "Nemotron 3.5 Super VL", tier: "topo", familia: "NVIDIA" },
  "deepseek-ai/deepseek-v4.1-flash": { short: "DeepSeek v4.1 Flash", tier: "topo", familia: "DeepSeek" },
  "minimaxai/minimax-m3.1-flash": { short: "MiniMax m3.1 Flash", tier: "topo", familia: "MiniMax" },
  "stepfun-ai/step-5-preview": { short: "Step-5 Preview", tier: "topo", familia: "StepFun" },
  "meta/muse-glimmer-30b": { short: "Muse Glimmer 30B", tier: "medio", familia: "Meta" },
  "google/gemma-4-31b-it": { short: "Gemma 4 31B", tier: "medio", familia: "Google" },
  "google/diffusiongemma-26b-a4b-it": { short: "DiffusionGemma", tier: "medio", familia: "Google" },
  "openai/gpt-oss-20b": { short: "GPT-OSS 20B", tier: "medio", familia: "OpenAI" },
  "poolside/laguna-xs-2.1": { short: "Laguna XS (codigo)", tier: "topo", familia: "Poolside" },
  "meta/llama-3.2-90b-vision-instruct": { short: "Llama 3.2 90B Vision", tier: "topo", familia: "Meta" },
  "meta/llama-3.2-11b-vision-instruct": { short: "Llama 3.2 11B Vision", tier: "medio", familia: "Meta" },
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning": { short: "Nemotron Nano Omni", tier: "medio", familia: "NVIDIA" },
  "nvidia/nemotron-3.5-lightning-30b-a3b": { short: "Nemotron Lightning", tier: "leve", familia: "NVIDIA" },
  "nvidia/nemotron-3.5-bolt-e4b": { short: "Nemotron Bolt", tier: "leve", familia: "NVIDIA" },
  "meta/llama-guard-4-12b": { short: "Llama Guard 4 (seguranca)", tier: "leve", familia: "Meta" },
  "nvidia/ising-calibration-1.5-31b": { short: "Ising Calibration", tier: "medio", familia: "NVIDIA" },
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
  if (id === "auto") return "Automático";
  if (id === "melhor") return "Máxima qualidade";
  if (INFO[id]) return INFO[id].short;
  const tail = String(id).split("/").pop() ?? String(id);
  return tail.replace(/[-_]/g, " ").slice(0, 28);
}

export function tierFor(id) {
  return INFO[id]?.tier ?? "medio";
}

export function familiaFor(id) {
  return INFO[id]?.familia ?? "outro";
}

/** Modelos de reserva, na ordem em que o backend deve tentar. */
export const CATALOGO = Object.keys(INFO);

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

/** Modelos que existem no catalogo mas nao conversam (guardas/calibracao). */
export const SEM_CHAT = new Set(["meta/llama-guard-4-12b", "nvidia/ising-calibration-1.5-31b"]);

/** Remove modelos que nao servem para conversa. */
export function chatModels(all) {
  return (all ?? []).filter((m) => typeof m === "string" && m && !SEM_CHAT.has(m));
}

/** Fila de tentativas: o escolhido primeiro, o resto como reserva (so modelos de chat). */
export function fallbackChain(current, all) {
  const fila = orderModels(current, all).filter((m) => !SEM_CHAT.has(m));
  return fila.length ? fila : ["auto"];
}
