#!/usr/bin/env node
/** Apply the Supabase image function rate limit. Dry-run by default. */
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const root = path.resolve(args.find((a) => !a.startsWith('--')) ?? '.');
const apply = args.includes('--apply');
const rel = 'supabase/functions/imagem/index.ts';
const file = path.join(root, rel);
if (!fs.existsSync(file)) { console.error(`Arquivo não encontrado: ${rel}`); process.exit(1); }
let s = fs.readFileSync(file, 'utf8');
const changes = [];
function one(oldText, newText, label) {
  const n = s.split(oldText).length - 1;
  if (!n && s.includes(newText)) { changes.push(`${label} (já aplicado)`); return; }
  if (n !== 1) throw new Error(`${label}: esperado 1 trecho, encontrado ${n}; nenhum arquivo será gravado.`);
  s = s.replace(oldText, newText); changes.push(label);
}
try {
  one(
    `// imagem — geração de imagem pelo nosso backend (NVIDIA genai / flux).\nconst K = Deno.env.get("OPENAI_API_KEY") ?? "";`,
    `// imagem — geração de imagem pelo nosso backend (NVIDIA genai / flux).\nimport { createClient } from "npm:@supabase/supabase-js@2";\nconst K = Deno.env.get("OPENAI_API_KEY") ?? "";\nconst SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "";\nconst SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";\nconst admin = SUPA_URL && SERVICE_ROLE ? createClient(SUPA_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } }) : null;\nconst LIMITE_IMAGENS_HORA = 5;\n\nasync function quotaDeImagem(req: Request): Promise<{ ok: boolean; status: number; error?: string }> {\n  if (!admin) return { ok: false, status: 503, error: "rate_limit_not_configured" };\n  const rawIp = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for") ?? "desconhecido";\n  const ip = rawIp.split(",")[0].trim().slice(0, 128) || "desconhecido";\n  const { data, error } = await admin.rpc("consume_image_quota", { p_ip: ip, p_limit: LIMITE_IMAGENS_HORA });\n  if (error) return { ok: false, status: 503, error: "rate_limit_unavailable" };\n  if (data !== true) return { ok: false, status: 429, error: "limite de 5 gerações por hora atingido para este IP" };\n  return { ok: true, status: 200 };\n}`,
    'configuração e rate-limit persistente',
  );
  one(
    `  if (!K) return json(500, { ok: false, error: "chave de imagem nao configurada" });\n  let body: Record<string, unknown> = {};`,
    `  if (!K) return json(503, { ok: false, error: "chave de imagem nao configurada" });\n  const quota = await quotaDeImagem(req);\n  if (!quota.ok) return json(quota.status, { ok: false, error: quota.error });\n  let body: Record<string, unknown> = {};`,
    'limite obrigatório antes de chamar o provedor',
  );
  one(
    `  const qual = MODELOS[String(body.modelo ?? body.model ?? "flux3")] ?? MODELOS.flux3;\n  const envio = corpoDoModelo(qual, prompt, String(body.aspect_ratio ?? "1:1"), Math.min(Math.max(Number(body.steps) || 30, 10), 50));`,
    `  const qual = MODELOS[String(body.modelo ?? body.model ?? "flux3")] ?? MODELOS.flux3;\n  const requestedAspect = String(body.aspect_ratio ?? "1:1");\n  const allowedAspects = new Set(["1:1", "16:9", "9:16", "4:3", "3:4"]);\n  const aspecto = allowedAspects.has(requestedAspect) ? requestedAspect : "1:1";\n  const envio = corpoDoModelo(qual, prompt, aspecto, Math.min(Math.max(Number(body.steps) || 30, 10), 50));`,
    'validação da proporção da imagem',
  );
  one(
    `    body: JSON.stringify(envio),\n  });`,
    `    body: JSON.stringify(envio),\n    signal: AbortSignal.timeout(90_000),\n  });`,
    'timeout da chamada ao provedor',
  );
  console.log(`${apply ? 'APLICAÇÃO' : 'SIMULAÇÃO'} — ${changes.length} alterações`);
  for (const c of changes) console.log(`- ${c}`);
  if (!apply) console.log('Nada foi gravado. Rode com --apply para modificar o arquivo.');
  else {
    const backupDir = path.join(root, `.skynet-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    const backup = path.join(backupDir, rel);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(file, backup);
    fs.writeFileSync(file, s, 'utf8');
    console.log(`Backup criado: ${backup}`);
  }
} catch (e) { console.error(`ERRO: ${e.message}`); console.error('Nenhum arquivo foi gravado.'); process.exit(1); }
