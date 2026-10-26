# Componentes do Frontend — SKYNETchat

Inventário extraído dos bundles JS/CSS e da navegação real.

## Componentes identificados nos chunks

### Chat e mensagens (núcleo)
- **Message / MessageId / MessageText / MessageVersion / MessageAt** — renderização de mensagens (66 referências a Message, o componente central)
- **MessageBackup / MessagesBackupStore** — backup de mensagens
- **MessageDocument / MessageDocumentOriginalText** — documentos anexados em mensagens
- **ComposerV2/V3** — compositor de mensagens (Input, InputFocus, InputBlur)
- **MessagesRequest / MessagesUnavailable** — estados de carregamento/erro do histórico
- **ChatVersion / MessageJob / MessageFinish / MessageChannel** — metadados de mensagens
- **Thinking dots** (`svelte-xwyeys-thinking-dots`) — indicador "pensando"
- **TTS** (`/api/speak`, animação `ttsBounce`) — leitura em voz alta
- **Voice** (`/voz`) — modo voz

### Painéis e telas
- **ProjectDetailPanel** (CSS próprio: `ProjectDetailPanel.CnvsYsZz.css`) — detalhes de projetos
- **Turnstile** (CSS próprio: `Turnstile.Dnhv9yFl.css`) — Cloudflare Turnstile (antibot no login/cadastro)
- **Dev panel** (`/dev-panel`, protegido) — painel administrativo
- **Affiliate panel** (`/affiliate-panel`) — painel de afiliados
- **OSINT panel** — busca/investigação com animações próprias (blink, dot-pulse, rotate-text)
- **Crypto/market panel** — cotações com sparklines (Mercado, Volume 24h, Min/Max 24h)
- **Updates feed** — feed de atualizações com reações (🔥🤯❤️ e mais: thumbsUp, sad, haha, thinking, clap, mindBlown, heartEyes, pray), comentários (46 no post 4.5) e tags de versão

### UI básica
- Button, Badge, Card, Modal, Toast, Tooltip, Tabs/Tab, Toggle, Slider, Avatar, Upload
- Sidebar de navegação (collapse com DrawerGesture — gesto de gaveta)
- Skeletons: `skeleton-bar`, `skeleton-card`, `skeleton-shimmer` com `shimmer-sweep`/`shimmer-text`
- Loading dots (`loading-dot`, `loading-state`)
- Code blocks com header próprio e temas claro/escuro

### Imagens e geração
- **Image generation** (`/api/image-gen`, `/api/image-followups`) — painel Imagens (BETA)
- Vision (`/api/vision`) — leitura de imagens sem quebrar contexto
- Presets de estilo: anime, cartoon, 3d, 2d, aquarela, pintura, sem fundo (regex de estilos no código)

### Grupos e projetos
- **Group chats** (`/api/groups`) — "Converse com múltiplos agentes"
- **Projects** (`/api/projects`) — organização de tarefas e entregas, com ProjectDetailPanel

### Integrações
- **Gmail** (`/api/integrations/gmail/permissions`)
- **Stripe** (`/api/stripe/portal`, checkout `/checkout`)
- **Exportação PDF** (`/api/export-pdf`, `/api/pdf-generate`)
- **Memória da IA** (`/api/memory`, `/api/memory/toggle`)
- **Pesquisa na web** e leitura de URLs (`/url/`, favicons `/s2/favicons`)

## Estrutura técnica

- SvelteKit com chunks de código dividos: 45+ chunks, nós de rota (`nodes/0,1,3`), entry chunks
- Estado global via stores Svelte (`$themeBackground`, etc.)
- Markdown renderizado no cliente (parser com heading, table, hr, code, blockquote)
- KaTeX para matemática
- PWA completo (manifest v2, ícones 192/512, standalone)
