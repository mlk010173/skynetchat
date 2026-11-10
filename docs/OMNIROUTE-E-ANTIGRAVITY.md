# OmniRoute no SKYNETchat e Antigravity no celular

## 1. OmniRoute como provedor do SKYNETchat

O backend já aceita provedores extras compatíveis com OpenAI pelo segredo
`SKYNET_PROVIDERS` (`supabase/functions/_shared/router.ts`). Nenhuma mudança de código.

Segredos a criar no projeto Supabase (Settings → Edge Functions → Secrets):

| Nome | Valor |
| --- | --- |
| `SKYNET_PROVIDERS` | `[{"id":"omniroute","baseUrl":"https://SEU-HOST/v1","keyEnv":"OMNIROUTE_API_KEY","models":["gpt-4o-mini","claude-3-5-sonnet"],"tier":"equilibrado"}]` |
| `OMNIROUTE_API_KEY` | chave gerada no painel do OmniRoute |

A lista `models` de cada provedor entra no catálogo devolvido por `/functions/v1/models`,
então os modelos do gateway aparecem no seletor do app sem precisar de outro segredo.

Para descobrir o endereço, a lista real de modelos e conferir a chave antes de gravar
qualquer segredo:

```bash
node scripts/testar-gateway.mjs https://SEU-HOST/v1 SUA_CHAVE
```

Ele imprime o JSON pronto para colar em `SKYNET_PROVIDERS` e faz uma chamada real.

Depois do segredo, redeploy apenas da função `chat`:

```bash
npx supabase functions deploy chat --project-ref SEU_PROJECT_REF
```

O `baseUrl` precisa terminar em `/v1` e apontar para um host público: a função
roda na nuvem, então um endereço local da sua máquina não é alcançável.

## 2. Antigravity no celular (OmniAntigravityRemoteChat)

O espelho roda na máquina onde o Antigravity está aberto, porque conversa com o
editor pelo Chrome DevTools Protocol na porta 7800. Não dá para hospedar num
servidor: o endereço nasce da sua máquina.

Na máquina, com Node 22+:

```bash
# 1. abrir o Antigravity em modo debug (uma vez por sessão)
antigravity . --remote-debugging-port=7800

# 2. subir o servidor, em outro terminal
npx omni-antigravity-remote-chat
```

O terminal mostra a URL local (porta 4747) e um QR code. No mesmo Wi-Fi o
celular entra direto; a senha vai no `.env` como `APP_PASSWORD`.

Fora de casa, use o túnel embutido do pacote:

```bash
AUTO_TUNNEL_PROVIDER=cloudflare npx omni-antigravity-remote-chat
```

O endereço público HTTPS aparece no terminal. Túnel gratuito troca de endereço
a cada execução; endereço fixo exige domínio próprio configurado no provedor.

## 3. Scripts prontos no repositório

| Script | Para quê |
| --- | --- |
| `scripts/testar-gateway.mjs` | confere endereço e chave do gateway, lista modelos reais e imprime o JSON do segredo |
| `scripts/deploy-chat.sh` | publica a função `chat` com um token pessoal do Supabase |
| `scripts/antigravity-celular.sh` | abre o Antigravity em modo debug e sobe o espelho no celular |

```bash
node scripts/testar-gateway.mjs https://SEU-HOST/v1 SUA_CHAVE
export SUPABASE_ACCESS_TOKEN=sbp_...
./scripts/deploy-chat.sh SEU_PROJECT_REF
./scripts/antigravity-celular.sh          # ou: ./scripts/antigravity-celular.sh publico
```
