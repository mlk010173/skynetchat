import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://rkgwhhtenfozdwzpvxjj.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrZ3doaHRlbmZvemR3enB2eGpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NTY2OTQsImV4cCI6MjEwODUzMjY5NH0.FRwfO66wi1ADFmSboCCwH1NWuz-212dDrIcuuiZ-0HA";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function executePrompt(prompt: string): Promise<string> {
  const chatUrl = `${SUPABASE_URL}/functions/v1/chat`;
  const res = await fetch(chatUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ conversationId: null, content: prompt }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Chat API HTTP ${res.status}: ${errText}`);
  }

  const rawText = await res.text();
  let fullText = "";

  const lines = rawText.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("0:")) {
      try {
        const str = JSON.parse(trimmed.slice(2));
        if (typeof str === "string") fullText += str;
      } catch (_) {}
      continue;
    }

    if (trimmed.startsWith("data:")) {
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr || jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        if (typeof parsed === "string") {
          fullText += parsed;
        } else if (parsed && typeof parsed.delta === "string") {
          fullText += parsed.delta;
        }
      } catch (_) {}
    }
  }

  return fullText.trim() || rawText.trim() || "Sem resposta do chat";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ ok: false, error: "Não autorizado: token ausente" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ ok: false, error: "Sessão inválida ou expirada" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }

  const urlObj = new URL(req.url);
  const automation_id = body.automation_id || body.automationId || urlObj.searchParams.get("automation_id") || urlObj.searchParams.get("automationId");
  if (!automation_id) {
    return new Response(JSON.stringify({ ok: false, error: "automation_id é obrigatório" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const dbAuthHeader = SUPABASE_SERVICE_ROLE_KEY
    ? `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    : `Bearer ${token}`;
  const dbApiKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

  const autoRes = await fetch(`${SUPABASE_URL}/rest/v1/automations?id=eq.${automation_id}&user_id=eq.${user.id}`, {
    headers: {
      "apikey": dbApiKey,
      "Authorization": dbAuthHeader,
    },
  });

  if (!autoRes.ok) {
    const errText = await autoRes.text();
    return new Response(JSON.stringify({ ok: false, error: `Erro ao buscar automação: ${errText}` }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const automations = await autoRes.json();
  if (!Array.isArray(automations) || automations.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: "Automação não encontrada" }), {
      status: 404,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const auto = automations[0];
  const startTime = new Date().toISOString();
  let status = "sucesso";
  let resultado = "";

  try {
    resultado = await executePrompt(auto.prompt);
  } catch (err: any) {
    status = "erro";
    resultado = `Erro na execução: ${err.message || String(err)}`;
  }

  const saveRunRes = await fetch(`${SUPABASE_URL}/rest/v1/automations_runs`, {
    method: "POST",
    headers: {
      "apikey": dbApiKey,
      "Authorization": dbAuthHeader,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify({
      automation_id: auto.id,
      iniciado_em: startTime,
      status,
      resultado,
    }),
  });

  let runRecord = null;
  if (saveRunRes.ok) {
    const savedData = await saveRunRes.json();
    runRecord = Array.isArray(savedData) ? savedData[0] : savedData;
  }

  const notifBody = resultado.length > 250 ? resultado.slice(0, 250) + "..." : resultado;
  await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
    method: "POST",
    headers: {
      "apikey": dbApiKey,
      "Authorization": dbAuthHeader,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify({
      user_id: auto.user_id,
      kind: "automation",
      title: `Automação executada: ${auto.nome}`,
      body: notifBody,
      read: false,
      created_at: new Date().toISOString(),
    }),
  });

  return new Response(
    JSON.stringify({
      ok: true,
      status,
      resultado,
      run_id: runRecord?.id,
      automation_id: auto.id,
      nome: auto.nome,
    }),
    {
      headers: { ...CORS, "Content-Type": "application/json" },
    }
  );
});
