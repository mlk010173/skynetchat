import { getProviderBaseUrl } from "./models";

export interface ChatTurn {
  role: "user" | "assistant" | "system";
  content: string;
}

const SYSTEM_PROMPT =
  "Você é o SKYHUB, um assistente de IA em português com estética de terminal, direto e honesto. " +
  "Responda de forma clara, técnica quando apropriado, sem enrolação. Use Markdown simples quando ajudar.";

/**
 * Chamada ao provedor de IA (API compatível com OpenAI /chat/completions).
 * Funciona com OpenAI, Groq, OpenRouter e afins — basta trocar base URL e chave.
 */
export async function chatCompletion(
  model: string,
  turns: ChatTurn[]
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Servidor sem chave de IA configurada (OPENAI_API_KEY).");
  }
  const base = getProviderBaseUrl();
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...turns],
      max_tokens: 2048,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Provedor de IA respondeu ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content ?? undefined;
  if (!content) throw new Error("Resposta vazia do provedor de IA.");
  return content;
}
