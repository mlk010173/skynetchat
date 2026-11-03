# DESIGN-UI — camada visual do SKYNETchat

Aplicada em 03/11/2026. Sem dependência nova: **CSS puro**, importado depois de `styles.css`.

## O que está no app

`frontend/src/design-ui.css`

| Área | Efeito |
|---|---|
| `.stage::before` | grade sutil de 56px com máscara radial (fundo estilo "grid pattern") |
| `.stage::after` | halo vermelho que respira devagar atrás do hero |
| `.hero h1 .red` | texto com gradiente aurora animado (única cor de destaque da tela) |
| `.chip` | vidro sutil, elevação no hover, varredura de brilho (`::after`) |
| `.dock` | borda e sombra mudam no `focus-within` |
| `.dock-send` | brilho deslizante no botão de enviar |
| `.bubble` | entrada com fade + blur curto; bolha do usuário com gradiente e hairline |
| `.sky-glass`, `.sky-ring` | utilitários de superfície e anel de foco |
| `::-webkit-scrollbar` | trilha discreta, polegar vermelho no hover |

Acessibilidade: `prefers-reduced-motion` desliga todas as animações; `:focus-visible` com anel
de 2px em chips, dock, botões de ação e ícones.

## Regras aplicadas (não quebrar)

1. **Um acento.** O vermelho (`--sky-accent: #dc2626`) é a única cor de marca. Superfícies
   são neutras (`--sky-surface`, `--sky-hairline`).
2. **Um efeito dominante por tela.** Grade + halo no fundo; nada de partículas por cima.
3. **Movimento com propósito.** Título, halo e brilho do botão são ornamento; conteúdo
   entra em 260ms.
4. **Tema claro e escuro.** Tokens `--sky-*` têm versão para `[data-theme="white"]`.
5. **Contraste AA.** Texto secundário nunca abaixo de `#8e8e8e` no escuro.

## Catálogo que originou a camada

Laboratório local com 100 componentes reais (React 19 + Vite + Tailwind 4 + shadcn/ui):

| Biblioteca | Componentes | Registry |
|---|---|---|
| Magic UI | 44 (marquee, number-ticker, magic-card, border-beam, light-rays, particles, dock, bento-grid) | `https://magicui.design/r/<nome>.json` |
| Aceternity UI | 21 (spotlight, card-spotlight, moving-border, aurora-background, card-stack, liquid-glass) | `https://ui.aceternity.com/registry/<nome>.json` |
| Motion Primitives | 12 (text-effect, tilt, in-view, transition-panel, border-trail) | `https://motion-primitives.com/c/<nome>.json` |
| Cult UI | 8 (texture-card, texture-button, direction-aware-tabs, dynamic-island) | `https://www.cult-ui.com/r/<nome>.json` |
| shadcn/ui | 20 base (button, dialog, table, select, sonner…) | `npx shadcn@latest add <nome>` |

Instalação em qualquer projeto com shadcn:

```bash
npx shadcn@latest add https://magicui.design/r/marquee.json
npx shadcn@latest add https://ui.aceternity.com/registry/spotlight.json
```

## Skill versionada

`.agents/skills/design-ui/`

- `SKILL.md` — quando usar, comandos, tabela de decisão por necessidade
- `references/libraries.md` — catálogo completo com comandos
- `references/taste.md` — regras de gosto (cor, tipografia, espaço, movimento, anti-padrões)
- `references/porting-notes.md` — armadilhas React 19 / TS 7 / Tailwind 4 já resolvidas
- `references/composition-recipes.md` — landing, dashboard, settings, auth, card de destaque
- `scripts/run.sh` — `catalog | list | copy | install | lab | verify`

O `run.sh` espera o laboratório em `${DESIGN_LAB:-/app/design-lab}`. Sem o laboratório,
`catalog`, `taste`, `notes` e `recipes` continuam funcionando (só leem Markdown).

## Compatibilidade registrada

- React 19 exige valor inicial em `useRef`.
- TypeScript 7 removeu `baseUrl` (só `paths`).
- shadcn 4.x importa `cn` do pacote `cn` (oficial).
- `@tsparticles/react` v4 removeu `initParticlesEngine` → pinar `^3`.
- Tremor 3 exige preset do Tailwind 3; em Tailwind 4 usar `shadcn chart`.
- Fora do Next, trocar `next/image` e `next/link` por `<img>` e `<a>`.

## Como estender

1. Novo efeito? Copie do laboratório (`run_skill design-ui "copy magic-card ./src/components"`)
   ou instale pelo registry.
2. O app não usa Tailwind: adapte o componente substituindo classes por variáveis `--sky-*`.
3. Meça antes de publicar: `node verify.mjs` no laboratório ou `preview` + inspeção de console.
