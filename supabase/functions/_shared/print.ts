// Captura de tela de página web sem chave de API.
// Ordem: Microlink (melhor qualidade, devolve JSON) -> thum.io (imagem direta).
const UA = "Mozilla/5.0 (compatible; SKYNETbot/1.0)";

export type Captura = { ok: boolean; url?: string; alvo?: string; provedor?: string; erro?: string };

function normalizar(alvo: string): string {
  const t = String(alvo || "").trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export async function capturarTela(alvo: string, largura = 1280, altura = 800): Promise<Captura> {
  const url = normalizar(alvo);
  if (!url) return { ok: false, erro: "informe o endereço da página" };
  try {
    new URL(url);
  } catch {
    return { ok: false, erro: "endereço inválido" };
  }

  // 1. Microlink
  try {
    const api = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&viewport.width=${largura}&viewport.height=${altura}`;
    const r = await fetch(api, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(25000) });
    if (r.ok) {
      const d = await r.json().catch(() => null);
      const shot = d?.data?.screenshot?.url;
      if (shot) return { ok: true, url: shot, alvo: url, provedor: "microlink" };
    }
  } catch { /* tenta o próximo */ }

  // 2. thum.io
  try {
    const direto = `https://image.thum.io/get/width/${largura}/crop/${altura}/noanimate/${url}`;
    const r = await fetch(direto, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(25000) });
    const tipo = r.headers.get("content-type") ?? "";
    if (r.ok && tipo.startsWith("image/")) return { ok: true, url: direto, alvo: url, provedor: "thum.io" };
  } catch { /* sem provedor */ }

  return { ok: false, erro: "os provedores de captura não responderam agora", alvo: url };
}
