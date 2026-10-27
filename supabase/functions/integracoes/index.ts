const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://rkgwhhtenfozdwzpvxjj.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const AGENT_TOKEN = Deno.env.get("AGENT_TOKEN") || "";
const GMAIL_ACCESS_TOKEN = Deno.env.get("GMAIL_ACCESS_TOKEN") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface IntegracaoStatus {
  id: string;
  nome: string;
  estado: "online" | "dormindo" | "pendente_configuracao" | "indisponivel";
  detalhe: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  // Execute explicit lookups in parallel
  const [agenteRes, iaRes, webRes, bancoRes] = await Promise.allSettled([
    // 1. Agente Render
    (async (): Promise<IntegracaoStatus> => {
      try {
        const res = await fetch("https://skynet-agent.onrender.com/health", {
          method: "GET",
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = await res.json();
          const ferramentas = data.ferramentas ?? 0;
          return {
            id: "agente",
            nome: "Agente Skynet (Render)",
            estado: "online",
            detalhe: `${ferramentas} ferramentas ativas`,
          };
        }
        return {
          id: "agente",
          nome: "Agente Skynet (Render)",
          estado: "dormindo",
          detalhe: "Agente em standby / cold start (Render)",
        };
      } catch {
        return {
          id: "agente",
          nome: "Agente Skynet (Render)",
          estado: "dormindo",
          detalhe: "Agente em standby / timeout (8s)",
        };
      }
    })(),

    // 2. IA / Provedores LLM
    (async (): Promise<IntegracaoStatus> => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/models`, {
          method: "GET",
          headers: { apikey: SUPABASE_ANON_KEY },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ai_configured) {
            const count = Array.isArray(data.models) ? data.models.length : 0;
            return {
              id: "ia",
              nome: "Inteligência Artificial (OpenAI / Nemotron)",
              estado: "online",
              detalhe: `${count} modelos de IA disponíveis`,
            };
          }
        }
        return {
          id: "ia",
          nome: "Inteligência Artificial (OpenAI / Nemotron)",
          estado: "indisponivel",
          detalhe: "Nenhum provedor configurado",
        };
      } catch {
        return {
          id: "ia",
          nome: "Inteligência Artificial (OpenAI / Nemotron)",
          estado: "indisponivel",
          detalhe: "Falha ao consultar serviço de modelos",
        };
      }
    })(),

    // 3. Busca Web
    (async (): Promise<IntegracaoStatus> => {
      try {
        const res = await fetch("https://skynet-agent.onrender.com/tools", {
          method: "GET",
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = await res.json();
          const ferramentas = Array.isArray(data.ferramentas) ? data.ferramentas : [];
          const temWeb = ferramentas.some((f: any) => f.nome === "web_pesquisar");
          if (temWeb) {
            return {
              id: "web",
              nome: "Busca Web (Serp/Google/Bing)",
              estado: "online",
              detalhe: "Buscador web_pesquisar ativo (Google, Bing, Wikipedia)",
            };
          }
          return {
            id: "web",
            nome: "Busca Web (Serp/Google/Bing)",
            estado: "indisponivel",
            detalhe: "Ferramenta web_pesquisar não encontrada",
          };
        }
        return {
          id: "web",
          nome: "Busca Web (Serp/Google/Bing)",
          estado: "dormindo",
          detalhe: "Agente em standby / cold start",
        };
      } catch {
        return {
          id: "web",
          nome: "Busca Web (Serp/Google/Bing)",
          estado: "dormindo",
          detalhe: "Agente em standby / timeout (8s)",
        };
      }
    })(),

    // 6. Banco de dados (Supabase PostgreSQL REST)
    (async (): Promise<IntegracaoStatus> => {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          signal: AbortSignal.timeout(5000),
        });
        // Se a chamada HTTP respondeu (mesmo 200, 204, 401 ou 404 do PostgREST), o servidor de banco REST está ativo
        if (res.status < 500) {
          return {
            id: "banco",
            nome: "Banco de Dados (Supabase PostgreSQL)",
            estado: "online",
            detalhe: "PostgreSQL REST API responsivo (200 OK / RLS ativo)",
          };
        }
        return {
          id: "banco",
          nome: "Banco de Dados (Supabase PostgreSQL)",
          estado: "indisponivel",
          detalhe: `Banco retornou status ${res.status}`,
        };
      } catch {
        return {
          id: "banco",
          nome: "Banco de Dados (Supabase PostgreSQL)",
          estado: "indisponivel",
          detalhe: "Falha de conexão com banco de dados",
        };
      }
    })(),
  ]);

  // 4. Terminal (AGENT_TOKEN Deno.env)
  const terminalStatus: IntegracaoStatus = AGENT_TOKEN.trim()
    ? {
        id: "terminal",
        nome: "Terminal Agent Exec",
        estado: "online",
        detalhe: "Secret AGENT_TOKEN configurado (whitelist ativa)",
      }
    : {
        id: "terminal",
        nome: "Terminal Agent Exec",
        estado: "pendente_configuracao",
        detalhe: "aguarda secret AGENT_TOKEN",
      };

  // 5. E-mail (GMAIL_ACCESS_TOKEN Deno.env)
  const emailStatus: IntegracaoStatus = GMAIL_ACCESS_TOKEN.trim()
    ? {
        id: "email",
        nome: "E-mail (Gmail API)",
        estado: "online",
        detalhe: "Token GMAIL_ACCESS_TOKEN configurado",
      }
    : {
        id: "email",
        nome: "E-mail (Gmail API)",
        estado: "pendente_configuracao",
        detalhe: "aguarda token GMAIL_ACCESS_TOKEN",
      };

  const integracoes: IntegracaoStatus[] = [
    agenteRes.status === "fulfilled" ? agenteRes.value : { id: "agente", nome: "Agente Skynet (Render)", estado: "indisponivel", detalhe: "Erro interno" },
    iaRes.status === "fulfilled" ? iaRes.value : { id: "ia", nome: "Inteligência Artificial (OpenAI / Nemotron)", estado: "indisponivel", detalhe: "Erro interno" },
    webRes.status === "fulfilled" ? webRes.value : { id: "web", nome: "Busca Web (Serp/Google/Bing)", estado: "indisponivel", detalhe: "Erro interno" },
    terminalStatus,
    emailStatus,
    bancoRes.status === "fulfilled" ? bancoRes.value : { id: "banco", nome: "Banco de Dados (Supabase PostgreSQL)", estado: "indisponivel", detalhe: "Erro interno" },
  ];

  return new Response(JSON.stringify({ ok: true, integracoes }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
