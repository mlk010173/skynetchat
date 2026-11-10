#!/usr/bin/env node
// SKYNETchat · conferência de gateway compatível com OpenAI (OmniRoute, OpenRouter, etc.)
//
// uso:  node scripts/testar-gateway.mjs https://SEU-HOST/v1 SUA_CHAVE
//       OMNIROUTE_BASE=https://... OMNIROUTE_KEY=... node scripts/testar-gateway.mjs
//
// O que ele faz, sem inventar nada:
//   1. chama GET {base}/models e lista o que o gateway realmente devolve
//   2. monta o JSON do segredo SKYNET_PROVIDERS para colar no Supabase
//   3. faz uma chamada curta em POST {base}/chat/completions para provar que a chave vale

const base = (process.argv[2] || process.env.OMNIROUTE_BASE || "").replace(/\/+$/, "");
const chave = process.argv[3] || process.env.OMNIROUTE_KEY || "";

if (!base || !chave) {
  console.error("uso: node scripts/testar-gateway.mjs https://SEU-HOST/v1 SUA_CHAVE");
  process.exit(1);
}
if (!/^https?:\/\//.test(base)) {
  console.error("o endereço precisa começar com http:// ou https://");
  process.exit(1);
}

const cab = { Authorization: `Bearer ${chave}` };

async function pegarModelos() {
  const r = await fetch(`${base}/models`, { headers: cab });
  const texto = await r.text();
  if (!r.ok) throw new Error(`GET /models respondeu ${r.status}: ${texto.slice(0, 200)}`);
  const dados = JSON.parse(texto);
  const lista = Array.isArray(dados?.data) ? dados.data : Array.isArray(dados) ? dados : [];
  return lista.map((m) => m?.id).filter(Boolean);
}

async function conversar(modelo) {
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { ...cab, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: "user", content: "responda apenas: ok" }],
      max_tokens: 16,
    }),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`POST /chat/completions respondeu ${r.status}: ${texto.slice(0, 200)}`);
  const dados = JSON.parse(texto);
  return dados?.choices?.[0]?.message?.content ?? "(sem conteúdo)";
}

try {
  console.log(`· consultando ${base}/models`);
  const modelos = await pegarModelos();
  if (!modelos.length) {
    console.log("  ! o gateway respondeu, mas sem modelos na lista");
  } else {
    console.log(`  ✓ ${modelos.length} modelos, primeiros 10:`);
    for (const m of modelos.slice(0, 10)) console.log(`    - ${m}`);
  }

  console.log("\n· segredo para o Supabase (Settings → Edge Functions → Secrets)");
  console.log("  SKYNET_PROVIDERS:");
  console.log(
    JSON.stringify([
      {
        id: "omniroute",
        baseUrl: base,
        keyEnv: "OMNIROUTE_API_KEY",
        // os modelos entram no catálogo do SKYNET (selector do app) sem outro segredo
        models: modelos.slice(0, 12),
        tier: "equilibrado",
      },
    ])
  );
  console.log("  OMNIROUTE_API_KEY: (a chave que você passou)");

  if (modelos.length) {
    const alvo = modelos.find((m) => /gpt|claude|gemini|llama|qwen|deepseek/i.test(m)) || modelos[0];
    console.log(`\n· chamada real em ${alvo}`);
    const resposta = await conversar(alvo);
    console.log(`  ✓ respondeu: ${String(resposta).trim().slice(0, 80)}`);
  }
  console.log("\npronto. Depois de gravar os segredos: npx supabase functions deploy chat --project-ref SEU_REF");
} catch (erro) {
  console.error(`\n✗ ${erro.message}`);
  console.error("  confira se o gateway aceita chamadas do servidor (host público) e se a chave está certa.");
  process.exit(1);
}
