# Auditoria de 08/11/2026 — o que foi corrigido e o que ficou pendente

Revisao aplicada sobre os achados da auditoria completa (frontend, backend, banco, servicos, seguranca).

## Corrigido neste ciclo

| Item | Antes | Depois |
|---|---|---|
| Chave de assinatura Android | `android/skynet.keystore` versionado no repo publico | removido do indice e coberto por `*.keystore` no `.gitignore` |
| `.env.production` da raiz (heranca do app Next.js) | versionado | removido do repositorio |
| Terminal do agente Render | whitelist com `node`, `python3`, `git` e leitura livre de arquivos | somente leitura de diagnostico; `node`/`python3`/`git` fora; argumentos com `.env`, `/proc`, `/etc`, `/root`, `.ssh`, `.git`, `.temp`, chaves e tokens bloqueados (teste de 12 casos, 12 passam) |
| Limite de e-mail | 5 por dia no projeto inteiro (travava a verificacao de todos) | 5 por dia **por conta**, com teto global de 200/dia (testado: conta A bloqueia no 6o, conta B envia) |
| Fila de e-mail | 2 mensagens antigas presas em `queued` | encerradas como `expired` |
| Memoria legada | 31 registros com `user_id` nulo | 23 atribuidos ao dono certo via `auth.users`; 8 sem dono removidos |
| Migracoes | 22 aplicadas, 3 versionadas | baseline completo em `supabase/migrations/20261108210000_baseline_schema.sql` (29 tabelas, 45 indices, 11 politicas, RLS), validado rodando em schema isolado antes do rollback |
| Privilegios padrao | `postgres` criava tabelas liberando `anon`/`authenticated` | `alter default privileges ... revoke all on tables from anon, authenticated` aplicado |
| Documentacao | README descrevia Next.js; AGENTS.md dizia outra coisa | README descreve React+Vite em `frontend/`, `site/` publicado, Render, origem oficial |
| Origem oficial | Android apontava para o espelho no Pages | aponta para https://skynetchat-xi.vercel.app |
| CSP | `script-src` com `'unsafe-eval'` | removido; validado com a CSP real em 5 rotas (0 violacao) e em producao |
| PRs #2 e #3 | abertos e nao mergeaveis | fechados com explicacao (MCP ja existe como Edge Function; Firebase absorvido) |

## Pendente (depende de acesso ou decisao que nao esta no repositorio)

1. **Resend / dominio**: enviar para qualquer destinatario exige verificar `skynetchat.net` no Resend
   (registros TXT/CNAME/MX no DNS). Sem isso o envio so funciona para o e-mail do dono. O painel do
   Cloudflare bloqueia automacao com Turnstile, entao precisa de token de API ou passagem manual.
2. **Turnstile**: continua desligado; o codigo libera a validacao quando o segredo nao existe.
   Precisa das chaves do Cloudflare.
3. **`RENDER_API_KEY`**: a chave guardada nos secrets do Supabase responde 401 na API do Render, e o
   `AGENT_TOKEN` do Supabase nao e o mesmo do servico no Render. Enquanto isso o `/tools/terminal` do
   agente nao aceita chamadas com o token que o backend usa. Precisa regerar a chave do Render e
   sincronizar os dois segredos.
4. **Privilegios padrao do `supabase_admin`**: o Supabase reserva esse role ("role memberships are
   reserved, only superusers can grant them"), entao os defaults dele nao podem ser alterados por SQL.
   Mitigacao: tudo que criamos usa o role `postgres`, que ja esta restrito.
5. **Android / Play Store**: `targetSdk = 34` precisa ir para 36 (ver `android/README.md`); exige subir
   AGP e Gradle juntos e validar com build local.
6. **Gmail**: a Edge Function responde 410 por design; usar Gmail exige OAuth por usuario.
