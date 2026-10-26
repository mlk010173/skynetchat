# Operação segura e validação

## Secrets necessários

- Render: `AGENT_TOKEN` forte e aleatório; `SUPABASE_URL`; `SUPABASE_ANON_KEY`; `SUPABASE_SERVICE_ROLE_KEY` somente no servidor se de fato necessário.
- Supabase Edge Functions: `OPENAI_API_KEY` (nome usado pelo código atual da geração), `SUPABASE_SERVICE_ROLE_KEY` para a função de imagem usar a tabela privada. Confirme os secrets pelo Dashboard, sem imprimir seus valores em logs.
- Frontend: apenas `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_AGENT_URL`. Nunca incluir `AGENT_TOKEN`, service role, token GitHub, OAuth client secret ou chave de provedor em `VITE_*`.

A `SUPABASE_ANON_KEY` é uma chave pública de cliente e deve estar protegida por RLS e autorização correta. O `SUPABASE_SERVICE_ROLE_KEY` bypassa RLS e deve ficar somente no backend.

## Checks locais

Depois de aplicar scripts e migration:

```bash
node --check server/agent.mjs
node --test tests/agent-security.test.mjs
```

Verifique também com os scripts/testes existentes do projeto (por exemplo `npm run anon` se aplicável ao seu ambiente), typecheck/build do frontend e deploy de preview. O pacote não declara sucesso nesses testes porque ainda não foi aplicado ao clone do usuário.

## Testes de integração manuais em staging

- `POST /mcp` sem `Authorization` deve responder 401; com token válido deve aceitar `ping`/`tools/list`.
- `POST /tools/terminal`, `/tools/perguntar`, `/tools/memoria_salvar` e `/tools/memoria_buscar` sem token do agente devem responder 401.
- `https://127.0.0.1`, `https://10.0.0.1`, `https://169.254.169.254` e hosts DNS que retornem IP privado devem ser rejeitados pelo extrator de URL.
- Redirect público → IP privado deve ser bloqueado antes da segunda requisição.
- `auth-code` `action=newcode` deve responder 410 e não modificar a linha nem retornar código/sessão; `recover` não deve indicar se o e-mail existe.
- A sexta geração de imagem por IP dentro de uma hora deve retornar 429; a função `consume_image_quota` usa lock transacional para serializar o limite por IP. A primeira a quinta devem seguir apenas se o provedor estiver configurado.
- Sessões de usuário A nunca devem permitir ler/editar conversas ou memória do usuário B.
- Confirme CORS no domínio de produção real. Lembre-se: CORS não bloqueia cURL/scripts nem substitui autorização.

## Plano de rollout

1. Branch de hardening e diff revisado.
2. Aplicar migration no projeto correto e executar query de verificação de RLS/grants.
3. Deploy da função de imagem para ambiente de teste.
4. Deploy de preview do agente e do frontend.
5. Testes automáticos + testes manuais listados acima.
6. Pull Request revisado, aprovação e só então deploy de produção com rollback disponível.
