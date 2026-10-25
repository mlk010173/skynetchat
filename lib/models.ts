/** Modelos disponíveis no seletor. Configurável por env SKYNET_MODELS. */

export function getModels(): string[] {
  const raw = process.env.SKYNET_MODELS ?? "";
  const list = raw
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  if (list.length > 0) return list;
  // padrão: provedor OpenAI compatível
  return ["gpt-4o-mini", "gpt-4o"];
}

export function isValidModel(model: string): boolean {
  return getModels().includes(model);
}

export function getProviderBaseUrl(): string {
  return (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
}
