# Catálogo de bibliotecas

Verificado em 03/11/2026. Todos os comandos abaixo funcionam com `npx shadcn@latest add`.

## shadcn/ui — a base

- Fonte: `https://ui.shadcn.com/r/index.json` (65 componentes)
- Instalar: `npx shadcn@latest add button card dialog table tabs select`
- Depende de: `cn` (pacote oficial, substitui clsx + tailwind-merge), `radix-ui`,
  `lucide-react`, `class-variance-authority`.
- Componentes de base instalados no lab: accordion, avatar, badge, button, card, dialog,
  dropdown-menu, input, label, progress, scroll-area, select, separator, sheet, skeleton,
  sonner, switch, table, tabs, tooltip.
- Extras úteis: `chart` (recharts), `command` (cmdk), `drawer` (vaul), `calendar`, `form`,
  `data-table`, `carousel` (embla), `code-block`, `empty`, `field`, `input-group`, `kbd`.

## Magic UI — 79 componentes

- Fonte: `https://magicui.design/r/registry.json`
- Registry: `https://magicui.design/r/<nome>.json`
- Depende de `motion` e, em alguns, `next-themes` (`--legacy-peer-deps` se o React 19 reclamar
  de peer do next-themes).
- Config: exigem as CSS vars do shadcn (`cards`/`theme` inline). O CLI já injeta em
  `src/index.css`.

Instalados no lab (44): magic-card, shine-border, border-beam, animated-beam, meteors,
grid-pattern, dot-pattern, marquee, bento-grid, number-ticker, animated-gradient-text,
aurora-text, text-animate, word-rotate, typing-animation, sparkles-text, particles,
orbiting-circles, dock, blur-fade, animated-list, icon-cloud, terminal, shimmer-button,
rainbow-button, shiny-button, animated-circular-progress-bar, light-rays, kinetic-text,
file-tree, animated-shiny-text, neon-gradient-card, glare-hover, warp-background,
line-shadow-text, highlighter, comic-text, spinning-text, hero-video-dialog, scroll-progress.

Favoritos: `marquee` (carrossel infinito), `number-ticker` (contadores), `magic-card`
(brilho no cursor), `bento-grid` (grade de destaques), `light-rays` (hero), `dock` (ação fixa).

## Aceternity UI — 315 itens

- Fonte: `https://ui.aceternity.com/registry/index.json`
- Registry: `https://ui.aceternity.com/registry/<nome>.json`
- Mistura componentes (`registry:ui`) e blocos de página completa (hero, pricing, footer,
  testimonials, dashboard, auth) — dá para começar um site inteiro daqui.
- Alguns puxam `three` + `@react-three/fiber` (shaders) e `@tsparticles/*`.

Instalados no lab (21): spotlight, sparkles, background-beams, text-generate-effect,
card-spotlight, moving-border, infinite-moving-cards, 3d-card, flip-words,
hover-border-gradient, aurora-background, wavy-background, tracing-beam, animated-tooltip,
glowing-stars, vortex, lamp, comet-card, card-stack, liquid-glass, canvas-reveal-effect.

Blocos de página para clonar a estrutura: `hero-with-centered-image`,
`modern-hero-with-gradients`, `simple-pricing-with-three-tiers`, `pricing-with-switch`,
`testimonials-grid-with-centered-carousel`, `simple-footer-with-four-grids`,
`premium-auth-split`, `stats-with-number-ticker`, `three-column-bento-grid`,
`saas-landing-page`, `product-landing-page`.

## Motion Primitives — micro-interações

- Registry: `https://motion-primitives.com/c/<nome>.json`
- Instalados: text-effect, text-loop, text-morph, text-scramble, text-shimmer, text-roll,
  animated-group, animated-number, in-view, transition-panel, tilt, border-trail.
- Também existem: progressive-blur, spotlight, dialog, popover, disclosure, image-comparison,
  scroll-progress, accordion, dynamic-island.
- Diferencial: `in-view` e `transition-panel` são composáveis e leves; `tilt` tem física de
  mola.

## Cult UI — identidade visual

- Registry: `https://www.cult-ui.com/r/<nome>.json`
- Instalados: texture-card, texture-button, direction-aware-tabs, dynamic-island,
  minimal-card, popover-form, bg-animate-button, gradient-heading.
- Atenção: vários arquivos são escritos para Next (`next/image`, `next/link`). Fora do Next,
  troque por `<img>`/`<a>`.

## HextaUI

- Registry: `https://hextaui.com/r/<nome>.json` (button, card, e variantes de UI base).
- Útil quando quer um visual mais "soft UI" que o shadcn padrão.

## 21st.dev

- Sem registry estável por nome; tem MCP próprio (`@21st-dev/magic`, exige API key) e
  componentes copiáveis pelo site. Use como referência de padrão, não como dependência.

## Bibliotecas de comportamento e dados (instaladas no lab)

`vaul` (drawer), `cmdk` (command palette), `embla-carousel-react` (carrossel),
`zustand` (estado global), `@tanstack/react-query` (dados assíncronos),
`@tanstack/react-table` (tabelas), `react-hook-form` + `zod` (formulários),
`date-fns`, `recharts` (gráficos), `sonner` (toasts), `motion` (animação),
`lucide-react` (ícones), `@tremor/react` (gráficos e KPI, ver ressalva de Tailwind).

## Tremor

- `npm i @tremor/react --legacy-peer-deps` (peer do React 19).
- **Ressalva:** Tremor 3 gera classes via preset do Tailwind 3. Em Tailwind 4, prefira
  `npx shadcn@latest add chart` (recharts) ou copie blocos do Tremor Raw.
- Quando usar mesmo assim: dashboard com KPI card, `AreaChart`, `BarChart`, `DonutChart`.
