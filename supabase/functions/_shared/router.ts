// Roteador automático de modelos do SKYNET (compartilhado pelas edge functions).
// Objetivo: o frontend nunca escolhe "o modelo da moda" — ele pede "auto" e o
// servidor decide quem responde, com base em saúde, latência e prioridade.
// Se um modelo falhar, demorar ou der erro, o próximo da fila assume sozinho.

export type ModelTier = "rapido" | "equilibrado" | "potente" | "raciocinio";

export interface Provider {
  id: string;
  baseUrl: string;
  keyEnv: string;
}

export interface ModelInfo {
  id: string;
  provider: string;
  label: string;
  tier: ModelTier;
  priority: number; // menor = preferido dentro do mesmo tier
}

export interface HealthRow {
  model_id: string;
  ok: number;
  fail: number;
  avg_ms: number;
  cooldown_until: string | null;
  last_error: string | null;
}

const DEFAULT_TIMEOUT_MS = 20000; // tempo máximo para o 1º byte
const DEFAULT_HEDGE_MS = 5500; // depois disso, dispara um segundo modelo em paralelo
const COOLDOWN_MS = 90_000; // modelo que falha fica de castigo por 90s
const COOLDOWN_DURO_MS = 600_000; // falha repetida (3+) => 10 min

export const timeoutMs = () => Number(Deno.env.get("SKYNET_MODEL_TIMEOUT_MS") ?? DEFAULT_TIMEOUT_MS);
export const hedgeMs = () => Number(Deno.env.get("SKYNET_HEDGE_MS") ?? DEFAULT_HEDGE_MS);

// ------------------------------------------------------------------ provedores
export function providers(): Provider[] {
  const lista: Provider[] = [];
  const primario: Provider = {
    id: "primary",
    baseUrl: (Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
    keyEnv: "OPENAI_API_KEY",
  };
  lista.push(primario);

  // Provedores extras opcionais: SKYNET_PROVIDERS = [{"id":"nvidia","baseUrl":"https://integrate.api.nvidia.com/v1","keyEnv":"NVIDIA_API_KEY"}]
  const extra = Deno.env.get("SKYNET_PROVIDERS");
  if (extra) {
    try {
      const arr = JSON.parse(extra);
      if (Array.isArray(arr)) {
        for (const p of arr) {
          if (p && typeof p.id === "string" && typeof p.baseUrl === "string") {
            lista.push({
              id: p.id,
              baseUrl: String(p.baseUrl).replace(/\/+$/, ""),
              keyEnv: typeof p.keyEnv === "string" ? p.keyEnv : "OPENAI_API_KEY",
            });
          }
        }
      }
    } catch { /* catálogo extra inválido: ignora */ }
  }
  return lista;
}

export function providerOf(id: string): Provider | null {
  const p = providers().find((x) => x.id === id);
  if (!p) return null;
  return Deno.env.get(p.keyEnv) ? p : null;
}

// ------------------------------------------------------------------ catálogo
const TIERS: ModelTier[] = ["rapido", "equilibrado", "potente", "raciocinio"];

export function catalog(): ModelInfo[] {
  // 1) Catálogo completo em JSON (recomendado)
  const raw = Deno.env.get("SKYNET_CATALOG");
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) {
        return arr
          .filter((m) => m && typeof m.id === "string")
          .map((m, i) => ({
            id: m.id,
            provider: typeof m.provider === "string" ? m.provider : "primary",
            label: typeof m.label === "string" ? m.label : m.id,
            tier: (TIERS.includes(m.tier) ? m.tier : "equilibrado") as ModelTier,
            priority: Number.isFinite(m.priority) ? Number(m.priority) : i,
          }));
      }
    } catch { /* cai para o formato antigo */ }
  }

  // 2) Formato antigo: SKYNET_MODELS="a,b,c" (o 1º é o potente, os demais equilibrados)
  const lista = (Deno.env.get("SKYNET_MODELS") ?? "gpt-4o-mini,gpt-4o")
    .split(",").map((m) => m.trim()).filter(Boolean);
  return lista.map((id, i) => ({
    id,
    provider: "primary",
    label: id,
    tier: (i === 0 ? "equilibrado" : i === 1 ? "potente" : "rapido") as ModelTier,
    priority: i,
  }));
}

export function isKnown(id: string): boolean {
  return catalog().some((m) => m.id === id);
}

// ------------------------------------------------------------------ saúde
export async function health(svc: any): Promise<Map<string, HealthRow>> {
  const mapa = new Map<string, HealthRow>();
  try {
    const { data } = await svc.from("model_health").select("*").limit(200);
    for (const row of data ?? []) mapa.set(row.model_id, row as HealthRow);
  } catch { /* tabela ausente: todos começam saudáveis */ }
  return mapa;
}

function emCooldown(h: HealthRow | undefined): boolean {
  if (!h?.cooldown_until) return false;
  return new Date(h.cooldown_until).getTime() > Date.now();
}

function pontuacao(m: ModelInfo, h: HealthRow | undefined): number {
  const ok = h?.ok ?? 0;
  const fail = h?.fail ?? 0;
  const total = ok + fail;
  const taxa = total === 0 ? 0.85 : ok / total; // sem histórico: otimista, mas não perfeito
  const latencia = h?.avg_ms && h.avg_ms > 0 ? h.avg_ms : 2500;
  const penalLatencia = Math.min(latencia / 1000, 30) * 1.6;
  const penalFalha = (1 - taxa) * 60;
  const penalPrioridade = m.priority * 0.8;
  // taxa de sucesso alta, latência baixa e prioridade baixa => nota maior
  return 100 * taxa - penalLatencia - penalFalha - penalPrioridade;
}

/**
 * Monta a fila de modelos que vão tentar responder.
 * - "auto" (ou vazio): todos, ordenados pela melhor nota agora.
 * - "melhor"/"best": começa pelos tiers mais fortes e cai para os leves.
 * - id específico: começa nele e mantém o resto como rede de segurança.
 */
export async function pickChain(
  svc: any,
  pedido: string | undefined,
  opts: { apenasConhecidos?: boolean } = {},
): Promise<{ fila: ModelInfo[]; pedido: string; auto: boolean }> {
  const todos = catalog().filter((m) => providerOf(m.provider));
  if (!todos.length) return { fila: [], pedido: pedido ?? "auto", auto: true };

  const h = await health(svc);
  const disponiveis = todos.filter((m) => !emCooldown(h.get(m.id)));
  const base = disponiveis.length ? disponiveis : todos; // se todos de castigo, tenta de novo

  const pedidoLimpo = (pedido ?? "auto").trim().toLowerCase();
  const auto = !pedidoLimpo || pedidoLimpo === "auto" || pedidoLimpo === "melhor" || pedidoLimpo === "best";

  const ordenado = [...base].sort((a, b) => pontuacao(b, h.get(b.id)) - pontuacao(a, h.get(a.id)));

  let fila = ordenado;
  const pedidoValido = todos.find((m) => m.id.toLowerCase() === pedidoLimpo);
  if (pedidoValido) {
    fila = [pedidoValido, ...ordenado.filter((m) => m.id !== pedidoValido.id)];
  } else if (pedidoLimpo === "melhor" || pedidoLimpo === "best") {
    const fortes = ordenado.filter((m) => m.tier === "raciocinio" || m.tier === "potente");
    const resto = ordenado.filter((m) => m.tier !== "raciocinio" && m.tier !== "potente");
    fila = [...fortes, ...resto];
  }

  return { fila: fila.slice(0, 6), pedido: pedido ?? "auto", auto };
}

// ------------------------------------------------------------------ registro
export async function registrar(
  svc: any,
  modelId: string,
  sucesso: boolean,
  ms: number,
  erro?: string,
): Promise<void> {
  try {
    const { data } = await svc.from("model_health").select("*").eq("model_id", modelId).maybeSingle();
    const row = data as HealthRow | null;
    const ok = (row?.ok ?? 0) + (sucesso ? 1 : 0);
    const fail = (row?.fail ?? 0) + (sucesso ? 0 : 1);
    const mediaAntiga = row?.avg_ms ?? 0;
    const avg = sucesso ? Math.round(mediaAntiga ? (mediaAntiga + ms) / 2 : ms) : (mediaAntiga || 0);

    let cooldown: string | null = null;
    if (!sucesso) {
      const janela = fail >= 3 ? COOLDOWN_DURO_MS : COOLDOWN_MS;
      cooldown = new Date(Date.now() + janela).toISOString();
    }

    await svc.from("model_health").upsert({
      model_id: modelId,
      ok,
      fail,
      avg_ms: avg,
      cooldown_until: cooldown,
      last_error: sucesso ? null : (erro ?? "erro").slice(0, 200),
      updated_at: new Date().toISOString(),
    }, { onConflict: "model_id" });
  } catch { /* métrica é opcional: nunca quebra o chat */ }
}
