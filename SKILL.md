# SKILL.md — Catálogo de Habilidades e Ferramentas do Agente SKYNET

Cada habilidade abaixo está documentada com o comando exato e o critério de sucesso.
Antes de usar, leia `AGENT.md` (regras) e `CELEBRO.md` (como decidir).

---

## SKILL 1 — NAVEGADOR AUTOMÁTICO (E2E)

Ferramenta: **Playwright** (já em devDependencies do projeto).

```bash
npx playwright install chromium   # 1ª vez apenas, baixa o navegador
npm run e2e                       # roda tests/e2e-login.mjs contra a produção
```

Padrões que funcionam neste projeto:
- **Login via API, UI sem digitação**: criar sessão com `fetch` em
  `/auth/v1/token?grant_type=password` é mais estável que digitar senhas
  (overlays de gerenciador de senha interferem em `input[type=password]`).
- Esperar **hidratação**: após `goto()`, aguardar seletor React real
  (`page.waitForSelector(".auth-card")` não basta; espere um `data-*` de estado).
- Nunca clicar em submit antes do JS carregar (senão submit nativo GET recarrega a página).
- Screenshot final como evidência: `await page.screenshot({ path: "out.png" })`.

## SKILL 2 — PESQUISA AVANÇADA (documentação e web)

Ordem de confiabilidade das fontes:
1. Fonte oficial (docs do framework/provedor) — sempre primeiro.
2. Issue/PR do repositório oficial (GitHub search) para comportamentos estranhos.
3. Stack Overflow apenas como pista; confirmar na fonte oficial.

Operadores úteis: `site:docs.exemplo.com`, `"mensagem de erro exata"`,
`site:github.com repo:org/projeto`, `in:title`.

Regra: **nenhuma afirmação de comportamento entra no código sem confirmação** na
fonte oficial ou num teste executado (ver AGENT.md §6).

## SKILL 3 — CMD / TERMINAL (padrões prontos)

```bash
# Estado do site publicado (o teste de chunks é obrigatório pós-deploy)
curl -s -o /dev/null -w "%{http_code}" https://mlk010173.github.io/skynetchat/
curl -s -o /dev/null -w "%{http_code}" "https://mlk010173.github.io/skynetchat/_next/static/chunks/app/<chunk>.js"

# GitHub API (deploy + status)
curl -X POST -H "Authorization: Bearer $GITHUB_ACCESS_TOKEN" \
  https://api.github.com/repos/mlk010173/skynetchat/pages/builds

# Supabase Management API — SQL direto no banco de produção
curl -X POST -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"select ..."}' \
  https://api.supabase.com/v1/projects/rkgwhhtenfozdwzpvxjj/database/query

# Edge Function em produção (com JWT real de usuário)
curl -N "https://rkgwhhtenfozdwzpvxjj.supabase.co/functions/v1/chat" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"conversationId":null,"content":"oi","model":"gpt-4o-mini"}'
```

## SKILL 4 — MCP (PLUGINS DE FERRAMENTAS)

Config em `mcp.json` (raiz). Servidores úteis:

| Servidor | Uso |
|---|---|
| `@modelcontextprotocol/server-filesystem` | ler/gravar arquivos do repo |
| `@modelcontextprotocol/server-fetch` | buscar páginas/docs como texto |
| `@modelcontextprotocol/server-github` | issues, PRs, deploys via API |
| `@playwright/mcp` | navegador controlado por MCP |
| `@modelcontextprotocol/server-postgres` | consultas SQL no Supabase |

Apontar o client MCP (Cursor, Claude Desktop, etc.) para o `mcp.json` do repo.
**Segredo de servidor nunca no mcp.json versionado** — usar variável de ambiente.

## SKILL 5 — DEVTOOLS DO NAVEGADOR

- **Network tab**: chunk vermelho/404 → problema de Jekyll/hidratação (Caso 1 do CELEBRO).
- **Console**: erro de hidratação do React aparece como warning + página "morta".
- **Application → Local Storage**: sessão Supabase vive em `sb-<ref>-auth-token`.
- **curl -N** para inspeção de SSE streaming sem intermediários.
- `curl -s <url> | grep -o '<padrão>'` = teste rápido de conteúdo publicado.

## SKILL 6 — BANCO E SUPABASE

- Migrações versionadas na pasta `supabase/` (nunca `ALTER` solto sem registro).
- RLS: policy por tabela; testar acesso cruzado (usuário A não lê dados de B).
- pg_cron ativo: limpeza de dados anônimos (verificar com query de contagem).
- Realtime: canal `postgres_changes` com `filter: user_id=eq.<id>` para notificações.
- Full-text: busca em português via tsvector no histórico (`to_tsvector('portuguese', ...)`).
- pgvector: memória de longo prazo, embeddings 1536d, RPC `match_memories`.

## SKILL 7 — VERIFICAÇÃO DE PONTA A PONTA (checklist de entrega)

```
[ ] npx tsc --noEmit                    → 0 erros
[ ] npm run build                       → ./out gerado com .nojekyll (postbuild)
[ ] push gh-pages + rebuild Pages       → 200 na home E em 1 chunk JS
[ ] fluxo afetado testado (auth/chat)   → dado persistiu após recarregar
[ ] RLS ok (usuário não vê dados alheios)
[ ] nenhum segredo no diff / log
[ ] relatório honesto: feito vs. pendente
```

## SKILL 8 — INSTALAÇÃO DE NOVA DEPENDÊNCIA

1. `npm i -D <pkg>` (runtime: `npm i <pkg>`), commitar `package.json` + lock.
2. Justificar peso (KB no bundle) — site estático é sensível a tamanho.
3. `npx tsc --noEmit && npm run build` antes de usar.
4. Documentar aqui se virar ferramenta permanente.
