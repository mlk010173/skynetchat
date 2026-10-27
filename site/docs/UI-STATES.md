# Estados de interface do espelho (modo demo)

O espelho é estático, mas as telas protegidas continuam renderizando porque o
layout recebe um **usuário demo** embutido e o `fetch` das APIs é interceptado.

## Como funciona

1. `demo/mock.js` (carregado antes do app em todas as páginas) substitui `window.fetch`:
   - `GET /api/session` → `{ user: <demo> }`
   - `/api/preferences`, `/api/conversations/config`, `/api/affiliate*`, `/api/admin/*` → payloads plausíveis
   - `/api/chat*` → stream NDJSON de demonstração
   - `/api/tts` → resposta vazia
   - qualquer outra `/api/*` → `200 {}`
2. O `data` do layout no HTML (`user:null`) foi trocado pelo usuário demo
   (Pro + Admin, `messageQuota: 9999`). Rotas com `data:[..., null]` recebem `{}`.
3. `base` do SvelteKit foi fixado em `/skynetchat-frontend` e todos os assets
   usam caminho absoluto com esse prefixo (necessário em GitHub Pages de projeto).

## Usuário demo

Campos usados pela UI: `id, numberId, email, nickname, isPro, isAdmin, isBetaTester,
isInfluencer, hasStripeSubscription, hasStripeCustomer, subscriptionExpired,
proExpiresAt, proPurchasedAt, currentPlan, messageQuota, messagesUsed,
memoryEnabled, canPublish, shouldShowRecoveryPrompt, shouldShowInitialFeedback`.

## Rotas mapeadas (17)

| Rota | Estado |
|---|---|
| `/` | chat, sidebar, composer, ações rápidas |
| `/quota/` | variante com cota esgotada |
| `/about/` | institucional |
| `/politicos/` | OSINT eleitoral (TSE) |
| `/afiliado/` | programa de afiliados |
| `/affiliate-panel/` | painel do afiliado (redireciona ao chat logado) |
| `/checkout/` | planos PRO, preços, PIX/cartão |
| `/monetize/` | monetização |
| `/indique-ganhe/` | indique e ganhe |
| `/novo/`, `/v3/`, `/voz/` | variações de chat |
| `/login/`, `/sign-up/`, `/recovery/` | autenticação |
| `/dev/security/` | login SECURE de 12 dígitos |
| `/termos/` | termos e privacidade |

Galeria navegável: `/demo/`.


## Comportamento do chat (reproduzido)

O chat do espelho envia pelo mesmo caminho do app: `POST /api/chat-V3` com
`{messages:[{id,role,parts:[{type:"text",text}]}], isVoice, projectId}` e lê a
resposta como **SSE** (`data: {json}` por linha, terminando em `data: [DONE]`).

Eventos que a interface entende:

| Evento | Efeito na UI |
|---|---|
| `thinking-meta` `{summaryTitle}` | cria o bloco de pensamento ("Pensando") |
| `step-start` `{stepId, stepType, searchQueries}` | abre uma etapa (thinking/search) |
| `step-delta` `{stepId, delta}` | escreve o texto da etapa |
| `step-end` `{stepId, title}` | fecha a etapa com título ("Pesquisar na web") |
| `text-start` / `text-delta` `{id, delta}` / `text-end` | resposta em streaming |
| `finish` / `[DONE]` | encerra |

### Barra de ações da mensagem (original, preservada)

`Copiar`, `Editar`, `Compartilhar`, `Ouvir`, `Reescrever`, `Útil`, `Não útil`,
`Mais ações` — aparecem no hover da mensagem.

## Correções aplicadas no espelho

1. Imagens ausentes baixadas: `politicos/{lula,nikolas,tarcisio,bolsonaro}.jpg`,
   `pwa-icon-any-192/512-v2.png`.
2. `/skynet-logo-vermelha.png` reescrito para o prefixo do Pages dentro do bundle.
3. Manifest PWA com ícones no caminho correto.
4. Scripts do Cloudflare (`cdn-cgi/challenge-platform`, `email-decode`) neutralizados.
5. Página `/quota` removida (renderizava fora do base do SvelteKit).

## Login, visões e linha de pensamento

- **Login/criar conta**: qualquer entrada autentica. Na tela `/login/` o botão
  ENTRAR fica sempre habilitado e leva ao chat já como conta PRO.
- **Visões de teste**: seletor no canto inferior direito (`?as=pro|admin|dev|free|guest|novo|anon`).
  Guest e novo mostram o upsell "Assinar SKYNETchat PRO"; admin acessa `/api/admin`.
- **Linha de pensamento**: durante a resposta aparece "Pensando"/"Pesquisa concluída" e,
  ao terminar, fica um painel fixo "Pensou por 4s · 5 etapas" com cada etapa, a ferramenta
  usada, o que foi pensado, o que concluiu e o que falhou (marcado em vermelho).
- **Menu**: itens Investigar Políticos, Planos PRO e Termos de uso foram adicionados ao
  menu lateral, navegando para as rotas correspondentes.
