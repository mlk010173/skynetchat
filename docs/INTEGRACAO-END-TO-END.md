# SKYNETchat — integração entre GitHub, Render, Supabase e Vercel

Auditoria: 26/10/2026. Repositório `mlk010173/skynetchat`.

## Estado verificado

- GitHub `main` é a origem ligada ao Render e ao projeto Vercel.
- Render `skynet-agent` está configurado para deploy automático por commit na branch `main`.
- Vercel tem deployment de produção `READY` e metadados apontando para `mlk010173/skynetchat`.
- GitHub Pages tem workflow próprio em `.github/workflows/pages.yml`.
- Supabase mantém Edge Functions com deploy separado; não há nesta sessão ação de conector para gerir secrets dessas funções.
- A Edge Function `chat` não envia `Authorization` ao Render e o detector não cria chamadas `terminal`.
- `/tools/terminal` exige `AGENT_TOKEN`. Não ativar sem segredo compartilhado configurado.
- O projeto Vercel pode ser uma versão antiga/protegida; confirmar que serve o frontend atual antes de alterar domínio/proteção.
- `.env.production` contém URL do Supabase e chave pública `anon`/publishable; não foi identificada ali uma chave `service_role`. Nunca colocar `service_role`, tokens de provedor ou senhas no repositório.

## Arquitetura pretendida

```text
GitHub main (fonte de verdade, testes e CI/CD)
 ├─ GitHub Actions → GitHub Pages (frontend estático)
 ├─ push main → Render (agente Node, ferramentas)
 ├─ push main → Vercel (frontend; validar que é o projeto certo)
 └─ deploy controlado → Supabase Edge Functions + Postgres + Auth

Frontend → Supabase chat (SSE) → ferramentas públicas do Render, quando necessárias
Render → Supabase para memória/imagens, com service role só no backend
```

## Workflow de smoke checks

Criar `.github/workflows/platform-smoke.yml` com o YAML abaixo. Ele só lê endpoints públicos, sem segredos ou alteração de dados:

```yaml
name: Platform smoke checks

on:
  push:
    branches: [main]
  schedule:
    - cron: "23 */6 * * *"
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: platform-smoke-${{ github.ref }}
  cancel-in-progress: true

jobs:
  health:
    runs-on: ubuntu-latest
    timeout-minutes: 8
    steps:
      - name: Check Render agent health
        shell: bash
        run: |
          set -euo pipefail
          body="$(mktemp)"
          code="$(curl --silent --show-error --location --retry 10 --retry-delay 6 --retry-all-errors --max-time 30 -o "$body" -w '%{http_code}' https://skynet-agent.onrender.com/health)"
          echo "Render /health HTTP $code"
          test "$code" = "200"
          node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(d.ok!==true || d.servico!=="skynet-agent") process.exit(1); console.log(JSON.stringify({ok:d.ok,servico:d.servico,versao:d.versao,ferramentas:d.ferramentas}));' "$body"

      - name: Check Supabase models endpoint
        shell: bash
        run: |
          set -euo pipefail
          body="$(mktemp)"
          code="$(curl --silent --show-error --location --retry 3 --retry-delay 3 --retry-all-errors --max-time 25 -o "$body" -w '%{http_code}' https://rkgwhhtenfozdwzpvxjj.supabase.co/functions/v1/models)"
          echo "Supabase /models HTTP $code"
          test "$code" = "200"
          node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(!d || typeof d!=="object" || d.ok===false) process.exit(1); console.log("Supabase models endpoint returned valid JSON");' "$body"

      - name: Check Vercel frontend
        shell: bash
        run: |
          set -euo pipefail
          code="$(curl --silent --show-error --location --retry 3 --retry-delay 3 --retry-all-errors --max-time 25 -o /dev/null -w '%{http_code}' https://skynetchat-xi.vercel.app/)"
          echo "Vercel homepage HTTP $code"
          test "$code" = "200"

      - name: Check GitHub Pages frontend
        shell: bash
        run: |
          set -euo pipefail
          code="$(curl --silent --show-error --location --retry 3 --retry-delay 3 --retry-all-errors --max-time 25 -o /dev/null -w '%{http_code}' https://mlk010173.github.io/skynetchat/)"
          echo "GitHub Pages homepage HTTP $code"
          test "$code" = "200"
```

Antes de manter o check Vercel, confirmar que esse domínio serve o app atual. Um deployment `READY` não garante acesso público nem versão correta; se estiver atrás de SSO ou for legado, substituir pela URL correta ou remover o check temporariamente.

## Bridge seguro do terminal

A mudança em `supabase/functions/chat/index.ts` deve:

1. Reconhecer terminal apenas com comando explícito, por exemplo `terminal: pwd`.
2. Permitir inicialmente só diagnóstico de leitura: `pwd`, `ls`, `df`, `uptime`, `free`.
3. Não converter texto arbitrário em shell.
4. Recusar `node`, `python3`, `git`, leitura arbitrária de arquivos e comandos destrutivos a partir do chat.
5. Exigir `Deno.env.get("AGENT_TOKEN")`; se ausente, falhar fechado sem quebrar o chat normal.
6. Enviar `Authorization: Bearer <AGENT_TOKEN>` só para a rota privilegiada.
7. No Render, token ausente/incorreto deve retornar HTTP 401; limitar tempo, tamanho do pedido e saída.
8. Não implantar a mudança até o mesmo segredo aleatório e forte estar configurado nos secrets do Render e da Edge Function `chat`.

Configuração manual sem expor o valor: Render Dashboard → `skynet-agent` → Environment → `AGENT_TOKEN`; Supabase Dashboard → projeto `rkgwhhtenfozdwzpvxjj` → Edge Functions → secrets → `AGENT_TOKEN`. Gerar no gerenciador de senhas; nunca colar no chat, commitar ou colocar em SQL público. Não reutilizar `SUPABASE_SERVICE_ROLE_KEY` como `AGENT_TOKEN`.

## Testes de aceitação

- [ ] Token ausente no chat: ferramenta privilegiada recusada e chat normal continua funcionando.
- [ ] Token ausente/incorreto no Render: HTTP 401.
- [ ] Token correto: só comandos explicitamente permitidos funcionam.
- [ ] `rm`, pipes, redirecionamentos, `;`, `$()`, `node`, `python3`, `git`, leitura de `.env` e acesso a diretórios secretos são recusados.
- [ ] Terminal não aparece em `/tools` público.
- [ ] Chat continua respondendo quando Render está dormindo/indisponível.
- [ ] `node --test tests/agent.test.mjs` passa.
- [ ] Testes frontend existentes passam.
- [ ] Smoke checks Render/Supabase/Vercel/Pages passam depois do deploy.

## Pendências do produto identificadas

- Recuperação por e-mail precisa de SMTP/API real e teste de entrega; não declarar envio concluído sem provider.
- Ferramentas do agente devem ser ligadas no chat com tratamento de falha; terminal privilegiado ainda precisa de token e detector explícito.
- Itens Imagens, Grupos, Codex, Projetos, Indique e Monetize devem ter função real ou estado honesto “em construção”.
- Aplicar `user_settings.theme` ao iniciar sessão e sincronizar com preferência local.
- Catálogo de conectores deve separar `disponível`, `requer_chave` e `planejado`; listar centenas não significa que estejam integrados.
- Vercel precisa ser confirmado como frontend atual antes de mudar domínio, proteção ou promoção para produção.
- Não criar políticas RLS públicas genéricas só para silenciar avisos do Advisor.

## Bloqueios desta sessão

- GitHub permite leitura, mas `create_branch` e `create_file` retornaram `403 Resource not accessible by integration`; não foi possível gravar este workflow no repo mesmo com metadata `push`.
- Browser Use reportou falta de créditos; não foi possível verificar os secrets nos painéis.
- Não existe ferramenta Supabase nesta sessão para criar/atualizar secrets de Edge Functions.
- Por isso, nenhum deploy incompleto foi feito e a integração não deve ser marcada como concluída ainda.

## Critério de conclusão real

1. Workflow salvo no GitHub e passando.
2. Vercel servindo a versão correta do frontend.
3. Token compartilhado configurado nos dois serviços sem exposição.
4. Chat chamando o agente com autenticação válida e tratamento de falhas.
5. Testes automatizados e E2E aprovados.
