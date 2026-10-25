# AGENT.md — Manual de Operações do Agente SKYNET

Você é o agente de desenvolvimento do **SKYNET** (chat de IA em português, 100% funcional).
Este é o seu manual oficial. Leia o `CELEBRO.md` (protocolo de raciocínio) e o `SKILL.md`
(catálogo de ferramentas) antes de executar qualquer tarefa complexa.

---

## 1. IDENTIDADE DO PROJETO

| Item | Valor |
|---|---|
| Produto | SKYNET — chat de IA em português |
| Repo | `mlk010173/skynetchat` (branch `main` = código-fonte, branch `gh-pages` = build publicado) |
| URL de produção | https://mlk010173.github.io/skynetchat/ |
| Frontend | Next.js 14 (App Router) em **export estático** (`output: "export"`, `basePath: "/skynetchat"`) |
| Hosting | GitHub Pages (publicação via push da pasta `out/` para a branch `gh-pages`) |
| Backend | Supabase — projeto `rkgwhhtenfozdwzpvxjj` (região São Paulo) |
| Identidade visual | Paleta `#0a0a0a` / `#111` / `#C41E3A`, fonte Inter, estilo terminal SECURE |

## 2. ARQUITETURA

```
Navegador (GitHub Pages, estático)
   │  fetch + SSE
   ▼
Edge Functions do Supabase (/functions/v1/chat, /models)
   │  verificação JWT + service role
   ▼
Supabase Postgres (conversations, messages, memories[pgvector],
                    user_settings, notifications)
   ▲
Realtime (postgres_changes) ← sincroniza conversas e notificações entre abas/dispositivos
pg_cron     ← limpeza horária de requisições anônimas
Full-text   ← busca em português no histórico (tsvector)
```

- **Auth**: Supabase Auth e-mail/senha. Trigger `trg_on_new_user` cria `user_settings`
  + notificação de boas-vindas. Rotas: `/login`, `/sign-up`, `/recover`, `/reset`,
  `/account`, `/settings`.
- **Chat**: streaming SSE com efeito de digitação; memória de longo prazo via pgvector
  (embeddings 1536d, RPC `match_memories`); modo anônimo com expiração automática.
- **RLS ativa em todas as tabelas** — cada usuário só acessa os próprios dados.

## 3. COMANDOS ESSENCIAIS

```bash
npm run build          # gera ./out (sempre com NEXT_PUBLIC_* definidos, ver §4)
npx tsc --noEmit       # verificação de tipos (rodar antes de todo commit)
npm run lint           # lint
npm run test           # testes unitários/integração (pasta tests/)
```

Deploy (o `postbuild` já grava `out/.nojekyll` — NUNCA publicar sem ele):

```bash
cd out
git init -q -b gh-pages && git add -A && git commit -m "deploy: ..."
git push --force origin gh-pages
curl -X POST -H "Authorization: Bearer $GITHUB_ACCESS_TOKEN" \
  https://api.github.com/repos/mlk010173/skynetchat/pages/builds   # força rebuild
```

## 4. VARIÁVEIS DE AMBIENTE (build)

```
NEXT_PUBLIC_SUPABASE_URL       = https://rkgwhhtenfozdwzpvxjj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  = (anon key do projeto — pública por design)
NEXT_PUBLIC_BASE_PATH          = /skynetchat
```

Segredos (service role key, OPENAI_API_KEY/GROQ_API_KEY) ficam **apenas nos secrets das
Edge Functions** no dashboard do Supabase. Nunca no frontend, nunca no Git, nunca em log.

## 5. REGRAS DE OURO

1. **Zero simulações.** Todo botão faz o que promete; todo dado vem do Supabase real.
   Estado honesto: se a IA não está configurada, mostrar "IA não configurada".
2. **Nunca use `<form>` nativo com submit GET** em páginas estáticas: pre-hidratação o
   navegador recarrega a página e perde os dados. Use `type="button"` + handler.
3. **Nunca use `next/link` com prefixo manual**: o Next já aplica o `basePath`, e
   duplicar dá `/skynetchat/skynetchat/`. Use `<a href={BASE + "/x/"}>` ou `location.*`.
4. **`.nojekyll` sempre no gh-pages** (senão o Jekyll apaga `_next`).
5. **RLS sempre no_PLACE** em tabela nova: policy `user_id = auth.uid()` antes de expor.
6. **Trigger de Auth com `security definer set search_path = public`** e tabelas
   qualificadas (`public.tabela`) — a sessão do GoTrue tem search_path restrito.
7. **Verificar no ar, não localmente**: `curl` na URL de produção após o deploy.
8. Commits pequenos e descritivos; `main` sempre buildável.

## 6. PROTOCOLO DE VERIFICAÇÃO (antes de dizer "pronto")

1. `npx tsc --noEmit` → zero erros.
2. `npm run build` → sucesso em `./out`.
3. Publicado no gh-pages → `curl` na página e em 1 chunk JS (`.../_next/static/chunks/...`)
   deve dar **200** (o 404 em chunk = Jekyll/hidratação quebrada).
4. Fluxo afetado testado de ponta a ponta (auth, persistência, UI).
5. Sem segredo em diff, sem referência a marcas antigas.

## 7. SOLUÇÕES DE PROBLEMAS CONHECIDOS (já resolvidos — não repetir)

- **JS 404 no ar** → falta `out/.nojekyll` (Jekyll apaga `_next`).
- **Erro 500 "Database error saving new user"** → trigger sem `search_path = public`.
- **URL `/skynetchat/skynetchat/`** → `next/link` duplicou o basePath.
- **Assets 404 intermitentes** → sempre conferir o chunk com `curl` pós-deploy.
- **Hidratação**: o export estático depende dos chunks carregarem; teste com JS desligado
  deve mostrar o conteúdo estático, nunca uma página em branco.
