# SKYNET

Chat de IA com estética de terminal (preto/vermelho), **100% código novo e próprio** — sem código,
assets ou interface capturados de qualquer outro site. Tudo é real: servidor, banco, contas, login,
recuperação de senha e chat.

**No ar:** https://mlk010173.github.io/skynetchat/

## Arquitetura

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 15 exportado como site estático → GitHub Pages (branch `gh-pages`) |
| Backend | Edge Functions do Supabase (`chat`, `models`, `conversations`) |
| Conta + histórico | Supabase Auth + Postgres com Row Level Security |
| Chat | qualquer provedor compatível com a API OpenAI (OpenAI, Groq, OpenRouter…) |
| Testes | `node --test` (built-in) + `tsc --noEmit` |

```
Browser ──> Edge Functions (Supabase) ──> Provedor de IA
   │              │
   └── Supabase Auth (login/logout/recuperação)
                  └── Postgres (conversas, mensagens, rate limit) com RLS
```

## Funcionalidades

- **Chat real** com o modelo escolhido (o seletor troca o modelo de verdade)
- **Modo anônimo**: sem conta, limite de 20 mensagens/hora por IP (persistido no banco)
- **Contas reais**: cadastro, login, logout, esqueci a senha e redefinição por email
- **Histórico persistido** com RLS (cada usuário só acessa as próprias conversas)
- **Temas** BLACK/WHITE persistidos no navegador
- **Zero simulação**: itens ainda não implementados aparecem como "EM BREVE" e avisam honestamente

## Estrutura

```
app/
  page.tsx                       # chat + menu lateral + hero
  login/page.tsx                 # entrar / criar conta / esqueci a senha
  reset/page.tsx                 # redefinição de senha via link de email
  about/page.tsx                 # Conheça o SKYNET
  terms/page.tsx                 # Termos de Serviço
lib/
  api.ts                         # chamadas às edge functions
  client-auth.ts                 # cliente Supabase do browser (singleton)
  models.ts                      # lógica de modelos (usada pelos testes como especificação)
supabase/
  schema.sql                     # schema + índices + RLS (versionado e reproduzível)
  functions/
    chat/index.ts                # chat real: auth opcional, rate limit, persistência, IA
    models/index.ts              # lista de modelos + estado honesto da IA
    conversations/index.ts       # listar/abrir/renomear/apagar conversas
tests/                           # testes unitários (node --test)
```

## Variáveis de ambiente

Veja `.env.example`.

**Frontend** (públicas, definidas no build do export):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_BASE_PATH`

**Edge Functions** (secrets no dashboard do Supabase → Edge Functions → Secrets):
`OPENAI_API_KEY` (obrigatória para o chat responder), `OPENAI_BASE_URL`, `SKYNET_MODELS`

## Desenvolvimento local

```bash
npm install
cp .env.example .env.local   # preencha as variáveis públicas
npm run dev
```

As edge functions ficam em `supabase/functions/` — aponte as chamadas de dev para o
projeto Supabase configurando `NEXT_PUBLIC_SUPABASE_URL`.

## Publicar (deploy)

1. Banco: rode `supabase/schema.sql` no SQL Editor do projeto Supabase
2. Secrets: configure `OPENAI_API_KEY` (e opcionais) nos secrets das funções
3. Build do site estático:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon> \
   npm run build     # gera out/
   ```
4. Publique o conteúdo de `out/` na branch `gh-pages` (GitHub Pages)

Alternativa: o projeto também pode ser hospedado na Vercel (basta remover
`output: "export"` do `next.config.mjs` e portar as edge functions de volta para rotas de API).

## Segurança

- `SUPABASE_SERVICE_ROLE_KEY` e `OPENAI_API_KEY` vivem apenas nas edge functions — nunca no frontend
- RLS no banco + verificação de dono em cada função (duas camadas)
- Rate limit anônimo por IP persistido no banco (20 msgs/hora)
- Mensagens limitadas a 4000 caracteres; contexto a 30 mensagens
- CORS restrito nos métodos; JWT validado em toda operação autenticada

MIT
