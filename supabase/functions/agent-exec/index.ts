import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const AGENT_TOKEN = Deno.env.get("AGENT_TOKEN") || "";

const WHITELIST = new Set([
  "ls",
  "cat",
  "grep",
  "find",
  "head",
  "tail",
  "wc",
  "echo",
  "node",
  "python3",
  "git",
  "npm",
  "df",
  "du",
]);

const jsonRes = (status: number, data: any) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return jsonRes(401, { ok: false, error: "sem sessao" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: uData, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !uData?.user) {
    return jsonRes(401, { ok: false, error: "sessao invalida" });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return jsonRes(400, { ok: false, error: "bad json" });
  }

  const command = String(body.command || body.cmd || "").trim();
  if (!command) {
    return jsonRes(400, { ok: false, error: "comando vazio" });
  }

  // Valida caracteres proibidos: ; | && $( ) e backticks
  if (/;|\||&&|\$\(|`/.test(command)) {
    return jsonRes(400, {
      ok: false,
      error: "comando bloqueado por conter caracteres de shell encadeado ou interpolacao",
    });
  }

  const binary = command.split(/\s+/)[0];
  if (!WHITELIST.has(binary)) {
    return jsonRes(400, {
      ok: false,
      error: `binario '${binary}' nao permitido pela whitelist`,
    });
  }

  const startTime = Date.now();
  try {
    const agentRes = await fetch("https://skynet-agent.onrender.com/tools/terminal", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AGENT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cmd: command }),
      signal: AbortSignal.timeout(15000),
    });

    const ms = Date.now() - startTime;
    const resData = await agentRes.json();

    const stdout =
      typeof resData.saida === "string" ? resData.saida : resData.stdout || "";
    const stderr =
      typeof resData.erro_saida === "string"
        ? resData.erro_saida
        : resData.erro || resData.stderr || "";
    const exit =
      resData.exit ?? resData.code ?? (resData.ok === false ? 1 : 0);
    const ok = typeof resData.ok === "boolean" ? resData.ok : exit === 0;

    return jsonRes(200, { ok, stdout, stderr, exit, ms });
  } catch (err: any) {
    const ms = Date.now() - startTime;
    return jsonRes(500, {
      ok: false,
      stdout: "",
      stderr: String(err?.message || err),
      exit: 1,
      ms,
    });
  }
});
