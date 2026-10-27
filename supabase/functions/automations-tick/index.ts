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

async function executePrompt(chatUrl: string, anonKey: string, prompt: string): Promise<string> {
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

  if (!res.body) {
    throw new Error("Chat response body is null");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data:")) {
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.delta) {
            fullText += parsed.delta;
          }
        } catch (_) {
          // ignore non-JSON stream lines
        }
      }
    }
  }

  if (buffer.trim().startsWith("data:")) {
    const jsonStr = buffer.trim().slice(5).trim();
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.delta) fullText += parsed.delta;
      } catch (_) {}
    }
  }

  return fullText.trim() || "Sem resposta do chat";
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
    // 1. Fetch active automations
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
      // 2. Check latest run
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
        // If error fetching runs, run by default
        shouldRun = true;
      }

      if (!shouldRun) {
        continue;
      }

      // 3. Execute prompt
      const startTime = new Date().toISOString();
      let status = "sucesso";
      let resultado = "";

      try {
        resultado = await executePrompt(`${SUPABASE_URL}/functions/v1/chat`, SUPABASE_ANON_KEY, auto.prompt);
      } catch (err: any) {
        status = "erro";
        resultado = `Erro na execução: ${err.message || String(err)}`;
      }

      // 4. Save run in automations_runs
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

      // 5. Create notification for the user
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
        resultado_preview: notifBody,
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
