# Mapa de Rotas — SKYNETchat

Todas as rotas mapeadas por navegação real e análise dos bundles (26/out/2026).

## Páginas públicas (rotas reais, HTTP 200)

| Rota | Título | Descrição |
|---|---|---|
| `/` | SKYNETchat — Chat de IA em português | Home: chat principal + sidebar + hero |
| `/about` | SKYNETchat — Chat de IA em português | "Conheça o SKYNETchat" — como funciona o projeto |
| `/login` | SKYNETchat — Chat de IA em português | Página de login (com Cloudflare Turnstile) |
| `/sign-up` | SKYNETchat — Chat de IA em português | Cadastro de nova conta |
| `/monetize` | Monetize com o SKYNETchat | Programa de monetização/influenciadores |
| `/termos` | Termos de Uso e Política de Privacidade — SkynetChat | Termos de uso e privacidade |
| `/recovery` | SKYNETchat — Chat de IA em português | Recuperação de conta (linkada da tela de login, com `/api/recovery/request` e `/api/recovery/email`) |
| `/checkout` | SKYNETchat — Chat de IA em português | Checkout de assinatura PRO (Stripe) |
| `/chat/:id` | SKYNETchat — Chat de IA em português | Conversa específica por ID (rota dinâmica; `/chat` sem ID retorna 404) |
| `/*` (404) | — | Página de erro 404 personalizada |

## Rotas protegidas / redirecionamentos

| Rota | Comportamento |
|---|---|
| `/dev-panel` | Redireciona para `/login` (painel administrativo protegido) |
| `/affiliate-panel` | Redireciona para `/` (exigindo sessão; painel de afiliados) |
| `/indique-ganhe` | Redireciona para `/` (painel "Indique e Ganhe" aberto na home) |
| `/voz` | Redireciona para `/` (funcionalidade de voz dentro do chat) |

## Painéis / modais da home (componentes na interface)

Estes itens da sidebar não navegam para rotas, abrem painéis/modais dentro da própria home:

1. **Novo chat** — inicia conversa do zero
2. **Indique e Ganhe** — convide amigos e ganhe assinatura PRO
3. **Monetize com SKYNETchat** (NOVO) → também com rota própria `/monetize`
4. **Atualizações** — novidades e melhorias recentes (dados via `/api/updates`)
5. **Imagens** (BETA) — geração e exploração de imagens com IA
6. **Conversas em grupo** (NOVO) — colaboração com múltiplos agentes
7. **Codex** (EM BREVE) — código, scripts e automação
8. **Projetos** (NOVO) — organização de tarefas e entregas (componente ProjectDetailPanel)
9. **Histórico de conversas** — revisão de chats anteriores
10. **Prompts** — prompts úteis para usar com a IA
11. **Suporte** — dúvidas e contato com suporte
12. **Fazer login** → rota `/login`
13. **Tema de fundo** — seletor de tema (atual: BLACK)
14. **Termos de Serviço** → rota `/termos`

## Endpoints de API (46 mapeados no frontend)

Chat e mensagens:
- `/api/chat`, `/api/chat-V2-fast`, `/api/chat-V2-thinking`, `/api/chat-V3`, `/api/chat-V3-thinking`, `/api/chat-V4`
- `/api/chat-search`, `/api/title`, `/api/speak` (TTS), `/api/vision`, `/api/classify-intent`

Imagens e arquivos:
- `/api/image-gen`, `/api/image-followups`, `/api/files/upload`, `/api/files/`, `/api/file-extract`, `/cached-images/`

Contas e sessão:
- `/api/session`, `/api/recovery/email`, `/api/recovery/request`, `/api/security/new-code`

Produtos e recursos:
- `/api/projects`, `/api/groups`, `/api/prompts`, `/api/memory`, `/api/memory/toggle`, `/api/preferences`, `/api/integrations`, `/api/integrations/gmail/permissions`

Suporte e feedback:
- `/api/support`, `/api/support/session`, `/api/feedback`, `/api/initial-feedback`, `/api/updates`, `/api/log`, `/api/log/message`

Ferramentas:
- `/api/osint`, `/api/export-pdf`, `/api/pdf-generate`, `/api/code-repair`, `/api/currency-verify`, `/api/analytics`

Comercial:
- `/api/stripe/portal`, `/api/admin/accounts`, `/api/admin/influencer`, `/api/conversations/config`, `/api/conversations/migrate`

## Componentes de rota lazy (nodes do SvelteKit)

Os bundles mapeiam 22 nós de rota (0-21), carregados sob demanda. Identificação pelo conteúdo:

| Node | Página identificada |
|---|---|
| 4 | About: "O que é a SKYNETchat" (voltar para `/?drawer=open`) |
| 5 | Painel de saques de afiliado (saldo, chave Pix, histórico de saques) |
| 6 | Painel exclusivo para influenciadores |
| 9 | Pagamento via PIX (Gerando PIX, Tentar novamente) |
| 10 | OSINT: localização (País, Estado, Cidade) |
| 11 | Métricas de afiliado/influenciador |
| 12 | Página promocional GTA 6 (usa `gta-vi.png`) |
| 13 | Recuperação de conta (Código de acesso, "continue com uma conta individual") |
| 14 | Countdown promocional (horas, minutos, segundos) |
| 16 | OSINT: buscas populares, cruzando dados, Brasil |
| 17 | Confirmação de cadastro (email enviado) |
| 18 | Login com código de acesso |
| 19 | Política de Privacidade / Domínio oficial |
| 20 | Atualizações / Conversas em grupo (entrar em uma sala) |
| 21 | Componente com gráfico/análise numérica |

## Observações técnicas

- A home abre painéis via query `?drawer=open` (drawer lateral com gesto)
- Login/cadastro usam Cloudflare Turnstile e "código de acesso" (email com código, não senha)
- Pagamentos: PIX (BR) e Stripe (portal internacional)
- Proteção Cloudflare ativa no site oficial (o espelho não precisa dela)

## Dicionário definitivo de rotas (SvelteKit, extraído do bundle)

```
/            → home
/about       → sobre
/affiliate-panel → painel do afiliado (login)
/afiliado    → programa de afiliados (página pública)
/api/session → endpoint de sessão (401 sem login)
/chat/[conversationId] → conversa (login)
/checkout    → checkout (login)
/dev-panel   → painel dev (403 sem login)
/dev/security → login oculto SECURE (código de 12 dígitos, E2E/AES-256/zero-trust)
/indique-ganhe → indique e ganhe (login)
/login       → login com código de acesso
/monetize    → monetização (login)
/novo        → novo (login)
/politicos   → Investigar Políticos (OSINT eleitoral, dados TSE, público)
/recovery    → recuperação de conta
/sign-up     → cadastro
/termos      → termos de uso
/v3          → landing v3 (login)
/voz         → voz (login)
```

Rotas públicas renderizáveis no espelho: `/`, `/about`, `/afiliado`, `/politicos`,
`/login`, `/sign-up`, `/recovery`, `/termos`, `/dev/security`.
As demais exigem sessão e retornam o shell do app no espelho.
