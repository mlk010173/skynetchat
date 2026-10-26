# SKYNETchat — Frontend Mapeado

Espelho estático e documentação completa do frontend de **https://skynetchat.net/** (versão 4.5).

Site oficial: https://skynetchat.net/
GitHub Pages (espelho): https://mlk010173.github.io/skynetchat-frontend/

## O que está neste repositório

1. `index.html` + `_app/` — espelho estático do frontend (SvelteKit), com todos os bundles JS, CSS, fontes e imagens.
2. Pastas de rotas — snapshot SSR de cada página: `about/`, `login/`, `sign-up/`, `monetize/`, `checkout/`, `termos/`, `chat/`, `404.html`.
3. `docs/` — documentação do mapeamento completo:
   - [docs/ROUTES.md](docs/ROUTES.md) — todas as rotas (páginas, painéis, APIs)
   - [docs/COMPONENTS.md](docs/COMPONENTS.md) — inventário de componentes do frontend
   - [docs/DESIGN.md](docs/DESIGN.md) — design system: cores, tipografia, temas, animações, skeleton
   - [docs/VERSION.md](docs/VERSION.md) — versões 4.5 / 4.5 MAX e changelog
4. `screenshots/` — capturas de tela das páginas (home, login, sign-up, about, monetize, termos, checkout, 404).

## Stack identificada

- **Framework:** SvelteKit (Svelte 5, SSR + SPA), assets em `_app/immutable/`
- **Estilo:** Tailwind CSS v4 + CSS custom (componentes Svelte scoped)
- **Fontes:** Google Sans Flex e Inter (Google Fonts, arquivos locais em `fonts/`), KaTeX para fórmulas matemáticas (60+ arquivos de fonte)
- **Matemática:** KaTeX
- **Segurança:** Cloudflare Turnstile (componente `Turnstile` dedicado)
- **Pagamentos:** Stripe (portal de faturamento via `/api/stripe/portal`)
- **PWA:** manifest v2, exibição standalone, ícones 192/512
- **Analytics:** Facebook Pixel (cookie `_fbp`), endpoint `/api/analytics`

## Limitações do espelho

O espelho serve para visualizar o design, layout, animações e estrutura do frontend. As funções que dependem do backend (`/api/*`, login, chat) não funcionam no GitHub Pages porque são servidas pelo servidor de skynetchat.net.

## Como foi capturado

Navegação real no Chromium (passando pelo desafio Cloudflare), extração do DOM de cada rota, download dos bundles JS/CSS/fontes/imagens via fetch autenticado na sessão e análise estática do código dos chunks.

## Aviso de segurança

O bundle original do site expõe um token público da Mapbox (`pk.eyJ...`) no chunk do OSINT (nó 16). Por segurança, o GitHub bloqueia pushes com esse padrão, então ele foi redigido neste espelho (`REDACTED_MAPBOX_PUBLIC_TOKEN`). O mapa do painel OSINT não funciona no espelho estático de qualquer forma. No site oficial, tokens públicos no frontend são visíveis para qualquer visitante — se esse token for sensível, considere rotacioná-lo no painel da Mapbox.
