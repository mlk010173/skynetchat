// Consulta ao vivo das três plataformas que sustentam o SKYNET: Supabase, Vercel e Render.
// Usado pela ferramenta "infra" do chat e pela ferramenta MCP skynet_infra.
// Nenhuma chave é devolvida ao cliente: só nome de variável e presença (true/false).

const j = (t: number) => AbortSignal.timeout(t);

const env = (k: string) => (Deno.env.get(k) ?? "").trim();

export type Resultado = {
  ok: boolean;
  resumo: string;
  detalhe?: unknown;
  erro?: string;
  ms: number;
};

async function comTempo<T>(fn: () => Promise<T>, limite = 12000): Promise<{ valor?: T; erro?: string; ms: number }> {
  const t0 = Date.now();
  try {
    const valor = await Promise.race([
      fn(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), limite)),
    ]);
    return { valor, ms: Date.now() - t0 };
  } catch (e) {
    return { erro: String((e as Error)?.message ?? e).slice(0, 120), ms: Date.now() - t0 };
  }
}

/* ------------------------------- Supabase ------------------------------- */

export async function infraSupabase(): Promise<Resultado> {
  const ref = env("SKYNET_PROJECT_REF") || "rkgwhhtenfozdwzpvxjj";
  const pat = env("SKYNET_MGMT_TOKEN") || env("SUPABASE_MGMT_TOKEN") || env("SUPABASE_ACCESS_TOKEN");
  const base = env("SUPABASE_URL").replace(/\/+$/, "");
  const svcKey = env("SUPABASE_SERVICE_ROLE_KEY");

  const contagens = async () => {
    const headers = { apikey: svcKey, Authorization: `Bearer ${svcKey}` };
    const contar = async (tabela: string) => {
      const r = await fetch(`${base}/rest/v1/${tabela}?select=id&limit=1`, {
        headers: { ...headers, Prefer: "count=exact", Range: "0-0" },
        signal: j(8000),
      });
      const faixa = r.headers.get("content-range") ?? "";
      const total = Number(faixa.split("/")[1] ?? 0);
      return Number.isFinite(total) ? total : 0;
    };
    const [contas, conversas, mensagens, memorias] = await Promise.all([
      contar("accounts").catch(() => 0),
      contar("conversations").catch(() => 0),
      contar("messages").catch(() => 0),
      contar("acc_memory").catch(() => 0),
    ]);
    return { contas, conversas, mensagens, memorias };
  };

  if (!pat) {
    const c = await comTempo(contagens);
    return {
      ok: !!c.valor,
      resumo: c.valor
        ? `supabase: banco respondendo · ${c.valor.contas} contas, ${c.valor.conversas} conversas, ${c.valor.mensagens} mensagens`
        : `supabase: banco sem resposta (${c.erro})`,
      detalhe: { banco: c.valor ?? null, gerenciamento: "sem token" },
      erro: c.erro,
      ms: c.ms,
    };
  }

  const mgmt = async () => {
    const h = { Authorization: `Bearer ${pat}` };
    const [proj, fns] = await Promise.all([
      fetch(`https://api.supabase.com/v1/projects/${ref}`, { headers: h, signal: j(12000) })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`https://api.supabase.com/v1/projects/${ref}/functions`, { headers: h, signal: j(12000) })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    return {
      projeto: proj ? { nome: proj.name, status: proj.status, regiao: proj.region } : null,
      funcoes: Array.isArray(fns)
        ? { total: fns.length, ativas: fns.filter((f: { status?: string }) => f.status === "ACTIVE").length }
        : null,
    };
  };

  const [m, c] = await Promise.all([comTempo(mgmt, 14000), comTempo(contagens)]);
  const partes: string[] = [];
  if (m.valor?.projeto) partes.push(`projeto ${m.valor.projeto.status ?? "?"} (${m.valor.projeto.regiao ?? "?"})`);
  if (m.valor?.funcoes) partes.push(`${m.valor.funcoes.ativas}/${m.valor.funcoes.total} funções ativas`);
  if (c.valor) partes.push(`${c.valor.contas} contas, ${c.valor.conversas} conversas, ${c.valor.mensagens} mensagens`);
  if (!partes.length) partes.push(`sem resposta (${m.erro ?? c.erro ?? "?"})`);
  return {
    ok: partes.length > 0,
    resumo: `supabase: ${partes.join(" · ")}`,
    detalhe: { gerenciamento: m.valor ?? null, banco: c.valor ?? null },
    erro: m.erro ?? c.erro,
    ms: Math.max(m.ms, c.ms),
  };
}

/* -------------------------------- Vercel -------------------------------- */

export async function infraVercel(): Promise<Resultado> {
  const token = env("VERCEL_TOKEN");
  const projeto = env("VERCEL_PROJECT_ID") || "prj_xSftuMTlFSHIMtg5tnIbeRCeLsPd";
  const siteUrl = env("SITE_URL") || "https://skynetchat-xi.vercel.app";
  if (!token) {
    return { ok: false, resumo: "vercel: sem token configurado", ms: 0 };
  }
  const h = { Authorization: `Bearer ${token}` };
  const dados = async () => {
    const [proj, deploys, siteStatus] = await Promise.all([
      fetch(`https://api.vercel.com/v9/projects/${projeto}`, { headers: h, signal: j(12000) })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`https://api.vercel.com/v6/deployments?projectId=${projeto}&limit=3`, { headers: h, signal: j(12000) })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(siteUrl, { method: "HEAD", signal: j(9000) }).then((r) => r.status).catch(() => 0),
    ]);
    return {
      projeto: proj ? { nome: proj.name, framework: proj.framework, atualizado: proj.updatedAt } : null,
      deploys: Array.isArray(deploys?.deployments)
        ? deploys.deployments.map((d: { url?: string; state?: string; createdAt?: number }) => ({
          url: d.url, estado: d.state,
          quando: d.createdAt ? new Date(d.createdAt).toISOString() : null,
        }))
        : null,
      site_http: siteStatus,
    };
  };
  const r = await comTempo(dados);
  if (!r.valor) return { ok: false, resumo: `vercel: falhou (${r.erro})`, ms: r.ms };
  const ultimo = r.valor.deploys?.[0];
  const partes = [
    r.valor.projeto ? `projeto ${r.valor.projeto.nome}` : "",
    ultimo ? `último deploy ${ultimo.estado ?? "?"}${ultimo.quando ? " em " + ultimo.quando.slice(0, 16).replace("T", " ") : ""}` : "",
    r.valor.site_http ? `site HTTP ${r.valor.site_http}` : "site sem resposta",
  ].filter(Boolean);
  return { ok: true, resumo: `vercel: ${partes.join(" · ")}`, detalhe: r.valor, ms: r.ms };
}

/* -------------------------------- Render -------------------------------- */

type ServicoRender = {
  id: string;
  nome: string;
  tipo?: string;
  suspenso?: string;
  regiao?: string;
  url?: string;
  ultimo_deploy?: { estado?: string; quando?: string; commit?: string };
  variaveis?: string[];
};

export async function infraRender(): Promise<Resultado> {
  const agente = (env("AGENT_URL") || "https://skynet-agent.onrender.com").replace(/\/+$/, "");
  const token = env("RENDER_API_KEY");

  const saude = async () => {
    const t0 = Date.now();
    const r = await fetch(`${agente}/health`, { signal: j(12000) });
    const corpo = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, ms: Date.now() - t0, corpo };
  };

  const lerServicos = async (): Promise<ServicoRender[]> => {
    const r = await fetch("https://api.render.com/v1/services?limit=20", {
      headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
      signal: j(12000),
    });
    if (!r.ok) throw new Error(`render API ${r.status}`);
    const lista = await r.json();
    const base: ServicoRender[] = (Array.isArray(lista) ? lista : []).map((x: any) => {
      const sv = x.service ?? x;
      return {
        id: sv.id,
        nome: sv.name,
        tipo: sv.type,
        suspenso: sv.suspended,
        regiao: sv.serviceDetails?.region,
        url: sv.serviceDetails?.url,
      };
    });
    // último deploy dos 3 primeiros, em paralelo, sem derrubar o resto se falhar
    await Promise.all(base.slice(0, 3).map(async (sv) => {
      try {
        const d = await fetch(`https://api.render.com/v1/services/${sv.id}/deploys?limit=1`, {
          headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
          signal: j(10000),
        });
        if (!d.ok) return;
        const arr = await d.json();
        const dep = (Array.isArray(arr) ? arr[0] : null)?.deploy ?? null;
        if (dep) {
          sv.ultimo_deploy = {
            estado: dep.status,
            quando: dep.finishedAt ?? dep.createdAt ?? null,
            commit: dep.commit?.message ? String(dep.commit.message).slice(0, 70) : undefined,
          };
        }
      } catch { /* segue sem deploy */ }
    }));
    // nomes das variáveis do agente (nunca os valores)
    const alvo = base.find((s) => /skynet-agent|agent/i.test(s.nome ?? ""));
    if (alvo) {
      try {
        const e = await fetch(`https://api.render.com/v1/services/${alvo.id}/env-vars?limit=50`, {
          headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
          signal: j(10000),
        });
        if (e.ok) {
          const arr = await e.json();
          alvo.variaveis = (Array.isArray(arr) ? arr : [])
            .map((v: any) => (v.envVar ?? v)?.key)
            .filter(Boolean);
        }
      } catch { /* segue sem variáveis */ }
    }
    return base;
  };

  const [h, lista] = await Promise.all([
    comTempo(saude),
    token ? comTempo(lerServicos, 18000) : Promise.resolve({ erro: "sem RENDER_API_KEY", ms: 0 } as { erro: string; ms: number; valor?: ServicoRender[] }),
  ]);

  const servicos = (lista as { valor?: ServicoRender[] }).valor ?? null;
  const partes: string[] = [];
  if (h.valor) {
    partes.push(`agente ${h.valor.ok ? "no ar" : "fora"} (HTTP ${h.valor.status}, ${h.valor.ms}ms)`);
    const n = (h.valor.corpo as { tools?: unknown[] })?.tools?.length;
    if (typeof n === "number") partes.push(`${n} ferramentas`);
  } else {
    partes.push(`agente sem resposta (${h.erro})`);
  }
  if (servicos) {
    const principais = servicos.filter((s) => !/static|static_site/i.test(String(s.tipo)));
    partes.push(`${principais.length} serviço(s): ${principais.map((s) => s.nome).slice(0, 3).join(", ")}`);
    const comDeploy = principais.find((s) => s.ultimo_deploy?.estado);
    if (comDeploy?.ultimo_deploy) {
      partes.push(`último deploy ${comDeploy.ultimo_deploy.estado}`);
    }
  } else {
    partes.push("API de serviços sem chave (RENDER_API_KEY)");
  }
  return {
    ok: !!h.valor?.ok || !!servicos,
    resumo: `render: ${partes.join(" · ")}`,
    detalhe: { saude: h.valor ?? null, servicos },
    erro: h.valor ? undefined : h.erro,
    ms: Math.max(h.ms, (lista as { ms?: number }).ms ?? 0),
  };
}

/* ------------------------------ as três ------------------------------ */

export async function infraTudo(): Promise<{
  ok: boolean;
  supabase: Resultado;
  vercel: Resultado;
  render: Resultado;
  resumo: string;
  ms: number;
}> {
  const t0 = Date.now();
  const [supabase, vercel, render] = await Promise.all([infraSupabase(), infraVercel(), infraRender()]);
  return {
    ok: supabase.ok || vercel.ok || render.ok,
    supabase, vercel, render,
    resumo: [supabase.resumo, vercel.resumo, render.resumo].join("\n"),
    ms: Date.now() - t0,
  };
}
