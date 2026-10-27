# Design System — SKYNETchat

Extraído do CSS e dos bundles JS do site.

## Identidade visual

- **Tema principal:** escuro (dark-first)
- **Cor de marca:** vermelho SKYNET
  - `#A11111` (theme_color do PWA)
  - `#c41e3a` (vermelho mais usado, 24 ocorrências)
  - `#b90f0f`, `#b3261e`, `#3b0c0c` (tons de apoio)
- **Logo:** `skynet-logo-vermelha.png` / `skynet-logo-clean.png` / `logoweb.png`; variantes red / black / white do logo no código

## Paleta de cores (mais usadas no CSS)

| Cor | Uso |
|---|---|
| `#0a0a0a` | Fundo principal (também no manifest PWA) |
| `#141414` / `#171717` / `#1a1a1a` | Superfícies escuras (cards, painéis) |
| `#181d25` | Superfície azul-escura (sidebar/painéis) |
| `#c41e3a` | Vermelho de marca (acentos, botões, logo) |
| `#737b8c` / `#676f7e` / `#737373` / `#8c8c8c` | Texto secundário / ícones |
| `#22c55e` | Verde (sucesso, confirmações) |
| `#ef4444` | Vermelho de erro |
| `#fdfcfb` | Fundo do modo claro |
| `#e2e4e9` / `#e8eaee` / `#f6f7f9` / `#f5f6f8` | Bordas e fundos claros (modo claro) |
| `#6f42c1` | Roxo (acentos secundários) |
| `#64748b` / `#e2e8f0` | Slate (Tailwind) |

Variáveis de componentes:
- `--soft-bg: rgba(255,255,255,.055)` — fundo suave translúcido
- `--button-bg: rgba(255,255,255,.075)` / `--button-hover: rgba(255,255,255,.13)` — botões glassmorphism
- `--code-header-bg: #171717` (dark) / `#fdfcfb` (light) — blocos de código com tema claro/escuro próprio

## Tipografia

- **Google Sans Flex** (wdth 95, weight 400) — fonte de identidade
- **Inter** (400, 500, 600, 700) — fonte de texto
- **KaTeX** — 20 famílias para fórmulas matemáticas (AMS, Caligraphic, Fraktur, Main, Math, SansSerif, Script, Size1-4, Typewriter) em woff2/woff/ttf
- Tamanhos utilitários frequentes: 10px (badges uppercase), 13px (labels), tracking `wide`/`wider`
- Arquivos locais em `fonts/` e `google-fonts.css`

## Temas

- **Tema de fundo** com seletor na sidebar (atual: **BLACK**)
- Logo com variantes: `red` / `black` / `white` / `classic` / `dark` (fallback red)
- Blocos de código com tema próprio claro/escuro (variáveis `--code-*`)

## Animações (keyframes encontradas no CSS)

| Animação | Uso |
|---|---|
| `skeleton-slide` + `shimmer` + `.shimmer-sweep` + `.shimmer-text` | Efeito skeleton/shimmer de carregamento |
| `.skeleton-bar` / `.skeleton-card` / `.skeleton-shimmer` | Componentes skeleton (barras e cards) |
| `glitch-cyan` / `glitch-red` / `glitch-reveal` | Efeito glitch (identidade SKYNET) |
| `citation-pulse` | Pulso em citações/fontes |
| `svelte-wmyduh-osint-blink` / `osint-dot-pulse` / `osint-pulse` / `osint-rotate-text` | Animações do painel OSINT |
| `svelte-xwyeys-thinking-dots` | Pontinhos de "pensando" da IA |
| `welcomeFadeIn` | Entrada suave da tela de boas-vindas |
| `ttsBounce` | Bounce do indicador de TTS (voz) |
| `svelte-dndhtm-geo-spin` | Spin de geolocalização |
| `pulse`, `spin` | Utilitárias |

## Gráficos

- **Sparklines** (16 referências) — mini-gráficos de linha
- `chartGrad` — gradiente de gráfico
- **Painel de cripto/mercado** na home: cards com "Mercado", "Volume 24h", "Min/Max 24h" (dados ao vivo) + preset de prompt "Análise de Mercado: Ações, fundos e tendências"

## Efeitos de interface

- Glassmorphism (botões e superfícies translúcidas `rgba(255,255,255,.055-.13)`)
- Gradiente Instagram (purple-500 → pink-500) no botão de Instagram
- Tailwind CSS v4 (variáveis `--tw-*`), transições `--tw-duration: .15s`
- Escala hover 90%–110% (`--tw-scale-x/y/z`)
- Rings de foco Tailwind
