# SKYHUB

Chat de IA com estética de terminal (preto/vermelho), **100% código novo e próprio** — sem código,
assets ou interface capturados de qualquer outro site. Tudo é real: servidor, banco, contas, login,
recuperação de senha e chat.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend + API | Next.js 15 (App Router), deploy na Vercel (serverless) |
| Conta + histórico | Supabase (Postgres + Auth + Row Level Security) |
| Chat | qualquer provedor compatível com a API OpenAI (OpenAI, Groq, OpenRouter…) |
| Testes | `node --test` (built-in) + `tsc --noEmit` |
| CI | GitHub Actions — testes, tipos e build em cada push |

## Funcionalidades

- **Chat real** com o modelo escolhido (o seletor troca o modelo de verdade)
- **Modo anônimo**: funciona sem conta, limite de 20 mensagens/hora por IP, sem histórico
- **Contas reais**: cadastro, login, logout, esqueci a senha e redefinição por email
- **Histórico persistido** no Supabase, com RLS (cada usuário só acessa as próprias conversas)
- **Temas** BLACK/WHITE persistidos no navegador
- **Zero simulação**: itens ainda não implementados aparecem como "EM BREVE" e avisam honestamente

## Estrutura

```
app/
  page.tsx                    # chat + menu lateral + hero
  login/page.tsx              # entrar / criar conta / esqueci a senha
  reset/page.tsx              # redefinição de senha via link de email
  about/page.tsx              # Conheça o SKYHUB
  terms/page.tsx              # Termos de Serviço
  api/chat/route.ts           # chat real: valida, persiste e chama o provedor de IA
  api/models/route.ts         # lista de modelos do seletor
  api/conversations/route.ts  # lista de conversas do usuário
  api/conversations/[id]/…    # mensagens, renomear, apagar
lib/
  client-auth.ts              # cliente Supabase do browser (singleton)
  supabase-admin.ts           # cliente service role do servidor + validação de token
  ai.ts                       # chamada ao provedor de IA (OpenAI-compatível)
  models.ts                   # modelos configuráveis por env
  rate-limit.ts               # limite de uso anônimo por IP
supabase/schema.sql           # schema + índices + RLS
tests/                        # testes unitários (node --test)
```

## Variáveis de ambiente

Veja `.env.example`. Nunca comite `.env` com valores reais.

| Variável | Onde | O que é |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + local | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + local | chave anônima (pública) |
| `SUPABASE_SERVICE_ROLE_KEY` | **somente servidor** | chave service role — nunca no frontend |
| `OPENAI_API_KEY` | **somente servidor** | chave do provedor de IA |
| `OPENAI_BASE_URL` | servidor | opcional. Ex. Groq: `https://api.groq.com/openai/v1` |
| `SKYHUB_MODELS` | servidor | opcional. Ex. `llama-3.3-70b-versatile,gpt-4o-mini` |

## Desenvolvimento local

```bash
npm install
cp .env.example .env.local   # preencha as chaves
npm run dev
```

## Testes

```bash
node --test        # testes unitários
npx tsc --noEmit   # tipos
npm run build       # build de produção
```

O CI (`.github/workflows/ci.yml`) roda os três em cada push/PR.

## Deploy na Vercel

1. Crie um projeto na Vercel importando este repositório (framework Next.js detectado automaticamente)
2. Configure as variáveis de ambiente da tabela acima (as de `NEXT_PUBLIC_*` em Production e Preview)
3. Rode `supabase/schema.sql` no SQL Editor do projeto Supabase
4. No Supabase → Authentication → URL Configuration, adicione a URL de produção às **Redirect URLs**
5. Deploy. Testes pós-deploy: `/api/models` deve listar os modelos; criar conta e conversar deve gravar a conversa

## Segurança

- Chaves de servidor (`SERVICE_ROLE`, `OPENAI_API_KEY`) nunca chegam ao browser
- RLS no banco + validação de dono em cada rota de API (duas camadas)
- Limite de uso anônimo por IP; mensagens limitadas a 4000 caracteres; contexto a 30 mensagens
- Cabeçalhos de segurança (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`)
- Tokens de sessão e dados sensíveis não aparecem em logs

MIT
