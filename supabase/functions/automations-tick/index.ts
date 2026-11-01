const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://rkgwhhtenfozdwzpvxjj.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrZ3doaHRlbmZvemR3enB2eGpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NTY2OTQsImV4cCI6MjEwODUzMjY5NH0.FRwfO66wi1ADFmSboCCwH1NWuz-212dDrIcuuiZ-0HA";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const TICK_TOKEN = Deno.env.get("TICK_TOKEN") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tick-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface Automation {
  id: string;
  user_id: string;
  nome: string;
  prompt: string;
  cron_minutos: number;
  ativo: boolean;
  criado_em: string;
}

interface AutomationRun {
  id?: string;
  automation_id: string;
  iniciado_em: string;
  status: string;
  resultado: string;
}

async function executePrompt(prompt: string): Promise<string> {
  const chatUrl = "https://rkgwhhtenfozdwzpvxjj.supabase.co/functions/v1/chat";
  const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrZ3doaHRlbmZvemR3enB2eGpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NTY2OTQsImV4cCI6MjEwODUzMjY5NH0.FRwfO66wi1ADFmSboCCwH1NWuz-212dDrIcuuiZ-0HA";

  const res = await fetch(chatUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": anonKey,
      "Authorization": `Bearer ${anonKey}`,
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

  if (!fullText.trim()) {
    return `[RAW: status=${res.status}, len=${rawText.length}, sample=${JSON.stringify(rawText.slice(0, 300))}]`;
  }

  return fullText.trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const reqTickToken = req.headers.get("x-tick-token") || new URL(req.url).searchParams.get("x-tick-token");
  if (!TICK_TOKEN || reqTickToken !== TICK_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: "nao autorizado: token invalido ou ausente" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const dbAuthHeader = SUPABASE_SERVICE_ROLE_KEY
    ? `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    : `Bearer ${SUPABASE_ANON_KEY}`;
  const dbApiKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

  try {
    const autoRes = await fetch(`${SUPABASE_URL}/rest/v1/automations?ativo=eq.true&select=*`, {
      method: "GET",
      headers: {
        "apikey": dbApiKey,
        "Authorization": dbAuthHeader,
      },
    });

    if (!autoRes.ok) {
      const err = await autoRes.text();
      return new Response(JSON.stringify({ ok: false, error: `Erro ao buscar automacoes: ${err}` }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const automations: Automation[] = await autoRes.json();
    const now = new Date();
    const executedRuns: any[] = [];

    for (const auto of automations) {
      const runRes = await fetch(
        `${SUPABASE_URL}/rest/v1/automations_runs?automation_id=eq.${auto.id}&order=iniciado_em.desc&limit=1`,
        {
          method: "GET",
          headers: {
            "apikey": dbApiKey,
            "Authorization": dbAuthHeader,
          },
        }
      );

      let shouldRun = false;
      if (runRes.ok) {
        const runs: AutomationRun[] = await runRes.json();
        if (runs.length === 0) {
          shouldRun = true;
        } else {
          const lastRunDate = new Date(runs[0].iniciado_em);
          const diffMinutes = (now.getTime() - lastRunDate.getTime()) / (1000 * 60);
          if (diffMinutes >= auto.cron_minutos) {
            shouldRun = true;
          }
        }
      } else {
        shouldRun = true;
      }

      if (!shouldRun) {
        continue;
      }

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
      const saveNotifRes = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
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

      let notifRecord = null;
      if (saveNotifRes.ok) {
        const notifData = await saveNotifRes.json();
        notifRecord = Array.isArray(notifData) ? notifData[0] : notifData;
      }

      executedRuns.push({
        automation_id: auto.id,
        nome: auto.nome,
        status,
        run_id: runRecord?.id,
        notification_id: notifRecord?.id,
        resultado,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        total_ativas: automations.length,
        executadas: executedRuns.length,
        runs: executedRuns,
        service_role_available: Boolean(SUPABASE_SERVICE_ROLE_KEY),
      }),
      {
        headers: { ...CORS, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message || String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
