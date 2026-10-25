// Limite simples em memória para uso anônimo do /api/chat.
// Vercel serverless pode rodar em várias instâncias — é um freio de cortesia,
// não um limite rígido. Usuários logados não passam por aqui.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_PER_HOUR = 20;

export function anonymousAllowed(ip: string): boolean {
  const now = Date.now();
  const key = `ip:${ip}`;
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (b.count >= MAX_PER_HOUR) return false;
  b.count += 1;
  return true;
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0].trim() || "desconhecido";
}
