// Sandbox isolado do SKYNET: um "terminal" com sistema de arquivos próprio por conta.
// Nada roda no host: cada comando é interpretado aqui e mexe apenas na pasta virtual
// da conta (tabela sandbox_arquivos). Nenhuma conta enxerga a pasta de outra.
// POST /sandbox?action=exec   { cmd, cwd }  -> { ok, saida, cwd }
// GET  /sandbox               -> { ok, arquivos, cwd, uso }
// POST /sandbox?action=limpar -> apaga tudo da conta
import { createClient } from "npm:@supabase/supabase-js@2";
import { contaDaSessao, svc } from "../_shared/sessao.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-api-key, x-session, x-conta-id, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (c: unknown, s = 200) =>
  new Response(JSON.stringify(c), { status: s, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });

const MAX_ARQ = 256 * 1024; // 256 KB por arquivo
const MAX_TOTAL = 2 * 1024 * 1024; // 2 MB por conta
const MAX_ARQUIVOS = 200;

const db = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

/** Identidade: sessão por código, JWT do Supabase ou chamada interna com service role. */
async function dono(req: Request): Promise<string | null> {
  const conta = await contaDaSessao(req);
  if (conta?.id) return conta.id;
  const auth = (req.headers.get("Authorization") ?? "").trim();
  if (!auth.startsWith("Bearer ") || auth.length < 30) return null;
  const token = auth.slice(7);

  // 1) usuário logado (JWT do Supabase Auth)
  const { data } = await svc().auth.getUser(token);
  if (data?.user?.id) return data.user.id;

  // 2) chamada interna (chat -> sandbox): o token precisa ser de service role de verdade.
  // Em vez de comparar string com o env (a chave do projeto pode ser rotacionada),
  // provamos o poder da chave chamando a Admin API: só service role consegue.
  const cliente = createClient(Deno.env.get("SUPABASE_URL")!, token, { auth: { persistSession: false } });
  const { error } = await cliente.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (!error) {
    const cabecalho = (req.headers.get("x-conta-id") ?? "").trim();
    if (cabecalho) return cabecalho;
  }
  return null;
}

/** Normaliza um caminho dentro da pasta virtual. Nunca sai da raiz. */
function resolver(cwd: string, alvo: string): { ok: boolean; caminho?: string; erro?: string } {
  const bruto = String(alvo ?? "").trim();
  const base = bruto.startsWith("/") ? [] : cwd.split("/").filter(Boolean);
  for (const parte of bruto.split("/")) {
    if (!parte || parte === ".") continue;
    if (parte === "..") base.pop();
    else if (parte.startsWith("-")) continue;
    else base.push(parte.replace(/[^\w.\- ]+/g, "").slice(0, 60));
  }
  const caminho = base.join("/");
  if (caminho.length > 200) return { ok: false, erro: "caminho longo demais" };
  return { ok: true, caminho };
}

const pai = (c: string) => (c.includes("/") ? c.slice(0, c.lastIndexOf("/")) : "");

async function arquivos(conta: string) {
  const { data } = await db()
    .from("sandbox_arquivos")
    .select("caminho, bytes, atualizado_em")
    .eq("conta", conta)
    .order("caminho", { ascending: true })
    .limit(MAX_ARQUIVOS * 2);
  return data ?? [];
}

async function ler(conta: string, caminho: string): Promise<string | null> {
  const { data } = await db()
    .from("sandbox_arquivos")
    .select("conteudo")
    .eq("conta", conta)
    .eq("caminho", caminho)
    .maybeSingle();
  return data?.conteudo ?? null;
}

async function gravar(conta: string, caminho: string, conteudo: string) {
  const bytes = new TextEncoder().encode(conteudo).length;
  if (bytes > MAX_ARQ) return { ok: false, erro: `arquivo maior que ${MAX_ARQ / 1024} KB` };
  const lista = await arquivos(conta);
  const novo = !lista.some((a) => a.caminho === caminho);
  if (novo && lista.length >= MAX_ARQUIVOS) return { ok: false, erro: `limite de ${MAX_ARQUIVOS} arquivos` };
  const total = lista.filter((a) => a.caminho !== caminho).reduce((s, a) => s + (a.bytes ?? 0), 0) + bytes;
  if (total > MAX_TOTAL) return { ok: false, erro: `limite de ${MAX_TOTAL / 1024 / 1024} MB na conta` };
  const { error } = await db()
    .from("sandbox_arquivos")
    .upsert({ conta, caminho, conteudo, bytes, atualizado_em: new Date().toISOString() }, { onConflict: "conta,caminho" });
  if (error) return { ok: false, erro: "falha ao gravar" };
  return { ok: true, bytes };
}

async function apagar(conta: string, caminho: string) {
  const { error } = await db()
    .from("sandbox_arquivos")
    .delete()
    .eq("conta", conta)
    .or(`caminho.eq.${caminho},caminho.like.${caminho}/%`);
  return error ? { ok: false, erro: "falha ao apagar" } : { ok: true };
}

const AJUDA = [
  "Comandos do sandbox isolado do SKYNET:",
  "  pwd · ls [pasta] · cd <pasta> · tree · du",
  "  cat <arq> · head -n N <arq> · tail -n N <arq> · wc <arq> · grep <texto> <arq>",
  "  echo <texto> > arq · echo <texto> >> arq · touch arq · mkdir pasta · rm arq",
  "  cp <a> <b> · mv <a> <b> · date · whoami · help · clear",
  "  curl <url>            (busca texto na web e mostra)",
  "Encadeie com && ou ; . Cada conta só vê a própria pasta.",
].join("\n");

/** Executa UM comando simples (sem pipe/redirect já tratados). */
async function simples(conta: string, cwd: string, linha: string): Promise<{ ok: boolean; saida: string; cwd: string }> {
  const partes = linha.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const cmd = (partes[0] ?? "").toLowerCase();
  const args = partes.slice(1).map((p) => p.replace(/^["']|["']$/g, ""));
  if (!cmd) return { ok: true, saida: "", cwd };

  const alvo = (i = 0) => resolver(cwd, args[i] ?? "");

  switch (cmd) {
    case "echo":
      return { ok: true, saida: args.join(" ").replace(/^["']|["']$/g, ""), cwd };
    case "help":
      return { ok: true, saida: AJUDA, cwd };
    case "clear":
      return { ok: true, saida: "__limpar__", cwd };
    case "pwd":
      return { ok: true, saida: "/" + cwd, cwd };
    case "whoami":
      return { ok: true, saida: `conta ${conta.slice(0, 8)} · sandbox skynet`, cwd };
    case "date":
      return { ok: true, saida: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), cwd };
    case "cd": {
      const r = alvo();
      if (!r.ok) return { ok: false, saida: r.erro!, cwd };
      if (!r.caminho) return { ok: true, saida: "", cwd: "" };
      const existe = (await arquivos(conta)).some((a) => a.caminho === r.caminho || a.caminho.startsWith(r.caminho + "/"));
      if (!existe) return { ok: false, saida: `cd: pasta não encontrada: ${r.caminho}`, cwd };
      return { ok: true, saida: "", cwd: r.caminho };
    }
    case "ls": {
      const r = alvo();
      const prefixo = r.caminho ?? cwd;
      const lista = (await arquivos(conta)).filter((a) => (prefixo ? a.caminho.startsWith(prefixo + "/") : true));
      const nomes = new Set<string>();
      for (const a of lista) {
        if (a.caminho.endsWith("/.keep")) continue;
        const resto = prefixo ? a.caminho.slice(prefixo.length + 1) : a.caminho;
        if (!resto || resto === ".keep") continue;
        nomes.add(resto.split("/")[0] + (resto.includes("/") ? "/" : ""));
      }
      return { ok: true, saida: nomes.size ? [...nomes].sort().join("\n") : "(pasta vazia)", cwd };
    }
    case "tree": {
      const lista = (await arquivos(conta)).filter((a) => !a.caminho.endsWith("/.keep"));
      if (!lista.length) return { ok: true, saida: "(pasta vazia)", cwd };
      const linhas = lista.map((a) => "  " + a.caminho + (a.bytes ? `  (${a.bytes} B)` : ""));
      return { ok: true, saida: "/" + cwd + "\n" + linhas.join("\n"), cwd };
    }
    case "du": {
      const lista = await arquivos(conta);
      const total = lista.reduce((s, a) => s + (a.bytes ?? 0), 0);
      return { ok: true, saida: `${lista.length} arquivo(s) · ${(total / 1024).toFixed(1)} KB de ${MAX_TOTAL / 1024} KB`, cwd };
    }
    case "cat":
    case "head":
    case "tail":
    case "wc": {
      const comN = ["head", "tail"].includes(cmd);
      const n = comN && args[0] === "-n" ? Number(args.shift() && args.shift()) || 10 : comN ? 10 : 0;
      const r = alvo();
      if (!r.caminho) return { ok: false, saida: `${cmd}: informe o arquivo`, cwd };
      const texto = await ler(conta, r.caminho);
      if (texto === null) return { ok: false, saida: `${cmd}: não encontrado: ${r.caminho}`, cwd };
      if (cmd === "wc") {
        const linhas = texto.split("\n").length;
        return { ok: true, saida: `${linhas} linha(s) · ${texto.length} caractere(s)`, cwd };
      }
      const fatias = texto.split("\n");
      const saida = cmd === "head" ? fatias.slice(0, n).join("\n") : cmd === "tail" ? fatias.slice(-n).join("\n") : texto;
      return { ok: true, saida: saida.slice(0, 20000), cwd };
    }
    case "grep": {
      const termo = args[0] ?? "";
      const r = alvo(1);
      if (!termo) return { ok: false, saida: "grep: informe o texto", cwd };
      const alvos = r.caminho
        ? [{ caminho: r.caminho, conteudo: await ler(conta, r.caminho) }]
        : (await db().from("sandbox_arquivos").select("caminho, conteudo").eq("conta", conta)).data ?? [];
      const achados: string[] = [];
      for (const a of alvos) {
        if (a.conteudo == null) continue;
        a.conteudo.split("\n").forEach((l, i) => {
          if (l.toLowerCase().includes(termo.toLowerCase())) achados.push(`${a.caminho}:${i + 1}: ${l.slice(0, 200)}`);
        });
      }
      return { ok: true, saida: achados.length ? achados.slice(0, 200).join("\n") : "nenhum resultado", cwd };
    }
    case "mkdir": {
      const r = alvo();
      if (!r.caminho) return { ok: false, saida: "mkdir: informe o nome", cwd };
      const g = await gravar(conta, `${r.caminho}/.keep`, "");
      return { ok: g.ok, saida: g.ok ? `pasta criada: ${r.caminho}` : g.erro!, cwd };
    }
    case "touch": {
      const r = alvo();
      if (!r.caminho) return { ok: false, saida: "touch: informe o nome", cwd };
      const g = await gravar(conta, r.caminho, "");
      return { ok: g.ok, saida: g.ok ? `criado: ${r.caminho}` : g.erro!, cwd };
    }
    case "rm": {
      const r = alvo();
      if (!r.caminho) return { ok: false, saida: "rm: informe o alvo", cwd };
      const a = await apagar(conta, r.caminho);
      return { ok: a.ok, saida: a.ok ? `apagado: ${r.caminho}` : a.erro!, cwd };
    }
    case "cp":
    case "mv": {
      const de = alvo(0);
      const para = resolver(cwd, args[1] ?? "");
      const texto = de.caminho ? await ler(conta, de.caminho) : null;
      if (texto === null || !para.caminho) return { ok: false, saida: `${cmd}: origem não encontrada`, cwd };
      const g = await gravar(conta, para.caminho, texto);
      if (g.ok && cmd === "mv" && de.caminho) await apagar(conta, de.caminho);
      return { ok: g.ok, saida: g.ok ? `${cmd}: ${de.caminho} -> ${para.caminho}` : g.erro!, cwd };
    }
    case "curl": {
      const url = args[0] ?? "";
      if (!/^https?:\/\//i.test(url)) return { ok: false, saida: "curl: informe uma url https", cwd };
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { "user-agent": "skynet-sandbox/1.0" } });
        const tipo = r.headers.get("content-type") ?? "";
        const texto = (await r.text()).slice(0, 4000);
        return { ok: r.ok, saida: `HTTP ${r.status} · ${tipo}\n${texto}`, cwd };
      } catch (e) {
        return { ok: false, saida: `curl: ${String((e as Error)?.message ?? e).slice(0, 120)}`, cwd };
      }
    }
    default:
      return { ok: false, saida: `comando desconhecido: ${cmd} — digite help`, cwd };
  }
}

/** Executa a linha inteira: redirecionamentos > e >>, depois && e ; */
async function executar(conta: string, cwdInicial: string, linhaBruta: string) {
  const linha = String(linhaBruta ?? "").trim().slice(0, 400000);
  if (!linha) return { ok: true, saida: "", cwd: cwdInicial };
  let cwd = cwdInicial;
  const saidas: string[] = [];
  let okTotal = true;

  for (const trecho of linha.split(/&&|;/).map((t) => t.trim()).filter(Boolean)) {
    const redir = trecho.match(/^(.*?)(>>|>)\s*(\S+)$/);
    if (redir) {
      const [, corpo, op, destino] = redir;
      const r = await simples(conta, cwd, corpo.trim());
      cwd = r.cwd;
      const alvo = resolver(cwd, destino);
      if (!alvo.ok || !alvo.caminho) {
        saidas.push(`redirecionamento inválido: ${destino}`);
        okTotal = false;
        continue;
      }
      const anterior = op === ">>" ? (await ler(conta, alvo.caminho)) ?? "" : "";
      const novo = (anterior ? anterior + "\n" : "") + r.saida;
      const g = await gravar(conta, alvo.caminho, novo);
      saidas.push(g.ok ? `${op === ">>" ? "anexado" : "gravado"} em ${alvo.caminho} (${novo.length} B)` : g.erro!);
      okTotal = okTotal && g.ok;
      continue;
    }
    const r = await simples(conta, cwd, trecho);
    cwd = r.cwd;
    okTotal = okTotal && r.ok;
    if (r.saida) saidas.push(r.saida);
    if (!r.ok) break;
  }
  return { ok: okTotal, saida: saidas.join("\n").slice(0, 20000), cwd };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const conta = await dono(req);
  if (!conta) return json({ ok: false, error: "Entre na sua conta para usar o sandbox." }, 401);

  const url = new URL(req.url);
  const acao = url.searchParams.get("action") ?? (req.method === "GET" ? "listar" : "exec");

  if (acao === "listar") {
    const lista = await arquivos(conta);
    const uso = lista.reduce((s, a) => s + (a.bytes ?? 0), 0);
    const { data: hist } = await db()
      .from("sandbox_historico")
      .select("comando, saida, ok, criado_em")
      .eq("conta", conta)
      .order("criado_em", { ascending: false })
      .limit(20);
    return json({ ok: true, arquivos: lista, uso, limite: MAX_TOTAL, historico: hist ?? [] });
  }

  if (acao === "limpar") {
    await db().from("sandbox_arquivos").delete().eq("conta", conta);
    return json({ ok: true, limpo: true });
  }

  let corpo: { cmd?: string; cwd?: string } = {};
  try {
    corpo = await req.json();
  } catch {
    /* corpo vazio */
  }
  const cwd = String(corpo.cwd ?? "");
  const r = await executar(conta, cwd, corpo.cmd ?? "");
  try {
    await db().from("sandbox_historico").insert({ conta, comando: String(corpo.cmd ?? "").slice(0, 400), saida: r.saida.slice(0, 2000), ok: r.ok });
  } catch {
    /* histórico é opcional */
  }
  return json({ ok: r.ok, saida: r.saida, cwd: r.cwd });
});
