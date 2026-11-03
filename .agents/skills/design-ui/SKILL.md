---
name: design-ui
description: Catálogo e toolkit de UI de ponta (Magic UI, Aceternity UI, Motion Primitives, Cult UI, shadcn/ui, HextaUI, Tremor) com laboratório instalado, regras de design e correções de compatibilidade React 19 / Tailwind 4 / TypeScript 7. Use ao montar landing pages, dashboards, portfólios, componentes animados, ou ao instalar/portar componentes dessas bibliotecas.
---

# design-ui

Toolkit de design de interface. Serve para escolher a biblioteca certa, instalar componentes
por registry `shadcn`, copiar código já testado e evitar as armadilhas de versão.

## Quando usar

- "faz uma landing page / hero / pricing / dashboard bonito"
- "instala o componente X do Magic UI / Aceternity"
- "esse componente não compila" (React 19, Tailwind 4, TS 7)
- "quero um efeito de texto / fundo animado / card com brilho"

## Laboratório pronto

`/app/design-lab` é um projeto React 19 + Vite + Tailwind 4 + shadcn/ui com **100 componentes**
já instalados e o build passando. Use como referência de código real e como fonte de cópia.

```bash
cd /app/design-lab && npm run dev     # http://localhost:5173
cd /app/design-lab && npm run build   # typecheck + build
node verify.mjs                       # checa render + erros de console (precisa de preview na 4173)
```

`src/App.tsx` é a galeria: hero, tipografia, cards, movimento, dados, ações.

## Comandos da skill

```bash
run_skill design-ui "catalog"                       # lista bibliotecas e componentes
run_skill design-ui "catalog text"                  # filtra o catálogo
run_skill design-ui "list"                          # componentes instalados no lab
run_skill design-ui "copy magic-card /caminho/src"  # copia componente testado para um projeto
run_skill design-ui "install /projeto magicui marquee bento-grid"
run_skill design-ui "install /projeto aceternity spotlight card-spotlight"
run_skill design-ui "lab"                           # sobe o preview do laboratório
```

## Qual biblioteca usar

| Necessidade | Biblioteca | Por quê |
|---|---|---|
| Base sólida (botão, input, dialog, tabela) | **shadcn/ui** | acessível, Radix por baixo, você é dono do código |
| Efeito pronto e polido (marquee, beam, ticker, dock) | **Magic UI** | 79 componentes, mantidos, TS limpo |
| Hero e seção de marketing com impacto | **Aceternity UI** | 315 itens, efeitos e blocos de página inteiros |
| Micro-interação de texto e entrada | **Motion Primitives** | text-effect, in-view, tilt, border-trail |
| Card e botão com textura/identidade | **Cult UI** | texture-card, texture-button, dynamic-island |
| Gráfico | **shadcn chart** (recharts) ou **Tremor** | Tremor exige preset do Tailwind 3 |

Regra: **shadcn é a espinha, uma biblioteca de efeito é o tempero.** Nunca misture três
efeitos concorrentes no mesmo bloco.

## Regras de design (resumo)

1. **Um acento só.** Superfícies neutras (`card`/`muted`/`border`) + uma cor de marca. Cor por
   item de lista é ruído, não informação.
2. **Movimento com propósito.** Máximo 1 efeito dominante por seção. Anime entrada e foco,
   não tudo que é estável.
3. **Tipografia com hierarquia curta.** 3 tamanhos visíveis (display, corpo, legenda). Sem
   `text-7xl` brigando com `text-6xl`.
4. **Espaço é design.** Seções com `py-14`/`py-20`, grid de 4/8px, `max-w-6xl` para leitura.
5. **Contraste acima de estética.** Texto secundário no mínimo `white/50` em fundo escuro
   (`muted-foreground`); nada de cinza ilegível.
6. **Estados completos.** hover, focus-visible, active, disabled, loading, vazio e erro.
7. **Acessibilidade não é opcional.** `prefers-reduced-motion`, `aria-hidden` em ornamento,
   foco visível, alvo de toque ≥ 40px.

Detalhe em `references/taste.md`.

## Armadilhas conhecidas (já resolvidas no lab)

- **TS 7 removeu `baseUrl`.** Use só `paths` relativo ao tsconfig.
- **shadcn CLI resolve alias pelo `tsconfig.json` da raiz.** Se `paths` estiver só no
  `tsconfig.app.json`, os arquivos caem numa pasta literal `@/`.
- **React 19 exige valor inicial em `useRef`.** Componentes antigos chamam `useRef<T>()`.
- **`verbatimModuleSyntax` quebra registry antigo.** Tipos precisam de `import type`.
- **`next/image` em componente copiado** não existe fora do Next: troque por `<img>`.
- **`@tsparticles/react` v4 removeu `initParticlesEngine`.** Pine em `^3` ou migre.
- **shadcn 4.x importa `cn` do pacote `cn`** (não é engano, é a lib oficial nova).
- **Tremor 3 pede preset do Tailwind 3.** Em Tailwind 4 use `shadcn chart` ou Tremor Raw.

Detalhe e patches em `references/porting-notes.md`.

## Registries (para instalar qualquer coisa)

```
shadcn            npx shadcn@latest add <nome>
Magic UI          npx shadcn@latest add https://magicui.design/r/<nome>.json
Aceternity UI     npx shadcn@latest add https://ui.aceternity.com/registry/<nome>.json
Motion Primitives npx shadcn@latest add https://motion-primitives.com/c/<nome>.json
Cult UI           npx shadcn@latest add https://www.cult-ui.com/r/<nome>.json
HextaUI           npx shadcn@latest add https://hextaui.com/r/<nome>.json
```

Índices completos: `references/libraries.md`. Composições prontas (hero, pricing, dashboard,
settings, auth): `references/composition-recipes.md`.
