# SKYNET MCP server

Servidor MCP (Model Context Protocol) do SKYNETchat. JSON-RPC 2.0, sem dependências externas.

## Rodar

```bash
node server/mcp-server.mjs                 # stdio (Claude Desktop, Codex, Cursor)
node server/mcp-server.mjs --http          # HTTP em PORT (padrão 8090)
MCP_HTTP=1 PORT=8090 node server/mcp-server.mjs
```

Conectar em cliente MCP (exemplo de configuração):

```json
{ "mcpServers": { "skynet": { "command": "node", "args": ["server/mcp-server.mjs"] } } }
```

## Ferramentas

| Ferramenta | O que faz |
|---|---|
| `skynet_status` | Verifica Render `/health`, Supabase `/functions/v1/models`, Vercel e Pages |
| `skynet_connectors` | Conectores com estado real de autorização, escopos e grau de permissão |
| `skynet_api` | Chama função edge da lista branca (`chat`, `models`, `conversations`, `imagem`) |
| `skynet_screens` | Lista telas e monta a URL de cada uma |
| `skynet_subagent` | Tarefa delimitada em até 3 passos usando a função chat |

## Regras de segurança

- Lista branca de funções edge: nada fora de `chat`, `models`, `conversations`, `imagem`.
- Subagente tem teto rígido de 3 passos.
- Conector só aparece como autorizado quando existe evidência registrada no código.
- Segredos apenas por variável de ambiente (`SUPABASE_ANON_KEY`); nada vai para o repositório.
- Corpo de resposta truncado em 4000 caracteres; limite de 1 MB de entrada HTTP.

## Variáveis

`RENDER_URL`, `SUPABASE_URL`, `VERCEL_URL`, `PAGES_URL`, `SUPABASE_ANON_KEY`, `PORT`, `MCP_HTTP`.
