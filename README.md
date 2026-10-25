# SKYHUB — frontend + backend próprios

Chat de IA com estética de terminal (preto/vermelho), **100% código novo** — sem código, assets
ou interface capturados de qualquer outro site. Tudo é real: servidor, banco, login e chat.

- **Frontend + API**: Next.js (App Router), deploy na Vercel
- **Conta/login + histórico**: Supabase (Postgres + Auth + RLS)
- **Chat**: qualquer provedor compatível com a API OpenAI (OpenAI, Groq, OpenRouter…)

## Modos de uso

- **Anônimo**: chat funciona sem conta (limite de 20 mensagens/hora por IP, sem histórico salvo)
- **Logado**: email/senha no Supabase, conversas salvas e sincronizadas no banco

## Configuração

Copie `.env.example` para `.env.local` (dev) ou configure na Vercel (produção):

| Variável | O que é |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave anônima do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | chave service role (SOMENTE no servidor, nunca no frontend) |
| `OPENAI_API_KEY` | chave do provedor de IA |
| `OPENAI_BASE_URL` | opcional — ex. `https://api.groq.com/openai/v1` para Groq |
| `SKYHUB_MODELS` | opcional — lista separada por vírgula, ex. `llama-3.3-70b-versatile,gpt-4o-mini` |

### Banco (Supabase)

Rode `supabase/schema.sql` no SQL Editor do Supabase. Cria as tabelas
`conversations` e `messages` com Row Level Security por usuário.

### Desenvolvimento

```bash
npm install
npm run dev
```

### Deploy (Vercel)

1. Suba o repo para o GitHub
2. Na Vercel: New Project → importe o repo → configure as variáveis de ambiente acima
3. Deploy. As rotas de API viram serverless functions automaticamente.

## Estrutura

```
app/                    # páginas e rotas de API (App Router)
  page.tsx              # chat
  login/page.tsx        # entrar / criar conta
  api/chat/route.ts     # chat real: valida, salva, chama o provedor de IA
  api/models/route.ts   # lista de modelos do seletor
  api/conversations/…  # CRUD de conversas do usuário logado
lib/                    # clientes supabase, IA, rate limit, modelos
supabase/schema.sql     # schema + RLS
```

## Segurança

- Chaves de servidor nunca chegam ao browser
- RLS no banco + validação de dono em cada rota
- Limite de uso anônimo por IP
- Capacidade máx. de mensagem: 4000 caracteres, contexto: 30 mensagens

MIT
