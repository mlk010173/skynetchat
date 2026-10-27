# SKYNET — patch de terminal no chat com autenticação e comandos restritos

**Status:** patch preparado; ainda não aplicado ao repositório nem implantado em produção.

## 1. `server/agent.mjs`: restringir a execução do terminal

Substitua o bloco `COMANDOS` por:

```js
// Terminal do chat: somente diagnósticos de leitura, sem intérpretes ou leitura de arquivos.
const COMANDOS = {
  ls: "ls", pwd: "pwd", df: "df", free: "free", uptime: "uptime",
};
const ARGUMENTOS_PERMITIDOS = {
  ls: new Set(["-a", "-l", "-h", "-la", "-al"]),
  pwd: new Set(),
  df: new Set(["-h", "-k", "-m"]),
  free: new Set(["-h", "-k", "-m"]),
  uptime: new Set(),
};
```

Substitua o retorno final de `validarComando()` pela validação de argumentos abaixo:

```js
  const args = partes.slice(1);
  if (args.length > 4) return { ok: false, erro: "argumentos demais" };
  if (!args.every((arg) => ARGUMENTOS_PERMITIDOS[bin].has(arg))) {
    return { ok: false, erro: "argumento fora da whitelist" };
  }
  return { ok: true, bin, args };
```

Atualize também a versão para `1.4.0` e a descrição de `terminal` em `FERRAMENTAS` para informar que ele só faz diagnósticos de leitura. A lista deixa de aceitar `node`, `python3`, `git`, `cat`, `head`, `tail`, `grep` e `wc`, porque essas entradas permitem execução de código, alteração do repositório ou leitura de arquivos sensíveis.

## 2. `tests/agent.test.mjs`: cobrir a nova whitelist

No teste `validarComando: whitelist e metacaracteres`, mantenha os testes atuais e acrescente:

```js
  assert.equal(A.validarComando("pwd").ok, true);
  assert.equal(A.validarComando("df -h").ok, true);
  assert.equal(A.validarComando("free -h").ok, true);
  assert.equal(A.validarComando("uptime").ok, true);
  assert.equal(A.validarComando("node -p process.env").ok, false);
  assert.equal(A.validarComando("python3 -c print(1)").ok, false);
  assert.equal(A.validarComando("cat .env").ok, false);
  assert.equal(A.validarComando("git push").ok, false);
  assert.equal(A.validarComando("ls /etc").ok, false);
```

## 3. `supabase/functions/chat/index.ts`: detectar só pedidos explícitos

Logo depois de `const tools: DetectedTool[] = [];` dentro de `detectTools()`, acrescente:

```ts
  // Terminal apenas por solicitação explícita; não converte texto livre em comando.
  const terminalMatch = text.match(/^(?:\/terminal\s+|terminal\s*:\s*|(?:execute|executar|rode|rodar)\s+no\s+terminal\s*:\s*)([\s\S]+)$/i);
  if (terminalMatch) {
    return [{ name: "terminal", payload: { cmd: terminalMatch[1].trim() } }];
  }
```

Antes de `callTool()`, acrescente a lista de ferramentas privilegiadas:

```ts
const PRIVILEGED_TOOLS = new Set(["terminal", "memoria_salvar", "memoria_buscar", "perguntar"]);
```

Dentro do `try` de `callTool()`, antes do `fetch`, substitua os cabeçalhos fixos por:

```ts
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (PRIVILEGED_TOOLS.has(tool.name)) {
      const agentToken = Deno.env.get("AGENT_TOKEN");
      if (!agentToken) {
        clearTimeout(timer);
        return { ok: false, error: "ferramenta protegida não configurada" };
      }
      headers.Authorization = `Bearer ${agentToken}`;
    }
    const res = await fetch(`https://skynet-agent.onrender.com/tools/${tool.name}`, {
      method: "POST",
      headers,
      body: JSON.stringify(tool.payload),
      signal: ctrl.signal,
    });
```

No `switch` de `processToolResult()`, antes do `default`, acrescente:

```ts
    case "terminal": {
      const saida = typeof data.saida === "string" ? data.saida.slice(0, 4000) : "(sem saída)";
      const erro = typeof data.erro_saida === "string" ? data.erro_saida.slice(0, 1000) : "";
      contextText = `Resultado do comando de diagnóstico ${String(payload.cmd ?? "").slice(0, 120)}:\nSaída:\n${saida}${erro ? `\nAvisos:\n${erro}` : ""}`;
      break;
    }
```

No array `systemParts`, inclua uma instrução dizendo que o comando só pode ser chamado por `terminal: COMANDO`, `/terminal COMANDO` ou `executar no terminal: COMANDO`, e que o backend só permite `pwd`, `ls`, `df`, `free` e `uptime` com argumentos aprovados.

## 4. Segredos e implantação

1. Conferir no Render se `AGENT_TOKEN` já existe; **não rotacionar um valor existente sem verificar seus outros consumidores**.
2. Se já existir, configurar esse mesmo valor nos Secrets da Edge Function Supabase `chat`; se não existir, gerar um segredo aleatório forte e definir o mesmo novo valor nos dois painéis.
3. Não colocar o valor do segredo em arquivo, código-fonte, SQL, commit, issue ou mensagem de chat.
4. Aplicar os testes com `node --test tests/agent.test.mjs`.
5. Só depois implantar e confirmar: `terminal: pwd` funciona; `terminal: node -p process.env` falha; chamada sem token recebe `401`.

O terminal proposto é deliberadamente de diagnóstico e somente leitura. Para execução de código arbitrário, use um sandbox isolado, não o processo principal do serviço Render.
