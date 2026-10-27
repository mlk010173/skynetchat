# Catálogo e estratégia de conectores

`frontend/src/data/connectors.json` contém 568 entradas em categorias; `integrations/registry.json` é a cópia canônica para backend/catalogação. Todas as entradas estão marcadas `status: "catalog_only"`. Isso evita a falsa promessa de que um serviço está conectado quando só aparece em uma lista.

## Como transformar uma entrada em integração real

1. Criar um adaptador backend em `server/connectors/<id>.mjs` (ou Edge Function dedicada quando fizer sentido).
2. Definir contrato de entrada/saída tipado, limites de tamanho e timeout, validação de URL, retries limitados e tratamento de erros sem vazar dados.
3. Configurar credenciais no secret manager do Render/Supabase/Vercel, nunca em `VITE_*`, `NEXT_PUBLIC_*` ou no JSON do catálogo.
4. Para OAuth, usar state/PKCE, callbacks HTTPS, scopes mínimos, armazenamento cifrado, revogação/desconexão e proteção contra CSRF.
5. Para ações com efeito (enviar e-mail, apagar arquivo, criar cobrança, enviar mensagem), mostrar ao usuário o resumo/escopo e pedir confirmação explícita.
6. Criar testes: sucesso, credencial ausente, token expirado, rate-limit, payload inválido, timeout, SSRF, autorização cruzada entre usuários e revogação.
7. Somente depois dos testes, mudar o status para `available` e mostrar botão de conectar. O front-end não deve exibir “conectado” só porque a entrada existe no JSON.

## Sugestão de implementação por ondas

- **Onda 1 — APIs internas/de infraestrutura:** GitHub, Vercel, Render, Supabase, Hugging Face. São os serviços que já fazem parte do fluxo de desenvolvimento do SKYNETchat.
- **Onda 2 — IA e pesquisa:** OpenAI-compatible providers, NVIDIA NIM, Groq, OpenRouter, Tavily/Exa/Brave Search, Pinecone/Qdrant/Weaviate.
- **Onda 3 — automação:** webhooks genéricos, n8n, Make, Pipedream e MCP servers, começando em modo read-only.
- **Onda 4 — produtividade/comunicação:** Notion, Google Drive/Calendar, Slack, Discord e provedores de e-mail.
- **Onda 5 — ações financeiras ou destrutivas:** pagamentos, CRM de escrita, envio em redes sociais e exclusão de dados — só após revisão de segurança e consentimento em cada ação.

O catálogo é uma fundação de interface e metadados; ele não autoriza automaticamente serviços externos nem cria credenciais.
