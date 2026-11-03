# Notas de porte: React 19 + TypeScript 7 + Tailwind 4

Erros reais encontrados ao instalar 100 componentes de registry e como cada um foi resolvido.

## 1. `TS5102: Option 'baseUrl' has been removed` (TypeScript 7)

`baseUrl` saiu. Deixe apenas `paths`, relativo ao tsconfig:

```json
{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }
```

## 2. Componentes indo para `./@/components/ui/`

O CLI do shadcn resolve o alias `@/*` lendo o `tsconfig.json` **da raiz**. Em projeto Vite
com `tsconfig.app.json` referenciado, os arquivos são gravados numa pasta literal `@/`.

Correção: declare `paths` também no `tsconfig.json` da raiz.

```json
{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } }, "files": [], "references": [] }
```

Se já aconteceu: mova o conteúdo de `@/components/ui` para `src/components/ui` e apague a
pasta `@` (com `rmdir` ou pelo gerenciador de arquivos).

## 3. `TS1484: 'ReactNode' is a type and must be imported using a type-only import`

Registry antigo + `verbatimModuleSyntax: true`. Duas saídas:

- rápida: `"verbatimModuleSyntax": false` no tsconfig;
- correta: `import type { ReactNode } from "react"`.

O lab usa a primeira (código de terceiros não é nosso para reescrever em massa).

## 4. `TS2503: Cannot find namespace 'JSX'` (React 19)

`@types/react` 19 removeu o namespace global `JSX`. Componentes da Motion Primitives usam
`JSX.Element`. Solução no lab: `src/global.d.ts` reexportando `React.JSX` para o global.

```ts
import type { JSX as ReactJSX } from "react"
declare global {
  namespace JSX {
    type Element = ReactJSX.Element
    type IntrinsicElements = ReactJSX.IntrinsicElements
  }
}
```

## 5. `TS2554: Expected 1 arguments, but got 0` em `useRef<T>()`

React 19 exige valor inicial: `useRef<THREE.Mesh>(null)`, `useRef<number | null>(null)`.
Afetou `canvas-reveal-effect`, `moving-border`, `vortex`.

## 6. `Cannot find module 'next/image'` / `'next/link'`

Cult UI e parte do Aceternity são escritos para Next. Fora do Next: remova o import e use
`<img>` com `width`/`height`, ou troque `next/link` por `<a>`.

## 7. `@tsparticles/react` v4 removeu `initParticlesEngine`

O componente `sparkles` (Aceternity) usa a API v3. Duas saídas:

- pinar a v3 (feito no lab): `npm i @tsparticles/react@^3 @tsparticles/slim@^3 @tsparticles/engine@^3`
- ou migrar para `ParticlesProvider` + `ParticlesPluginRegistrar` (API v4).

Se sobrar erro de propriedade excessiva (`fill`, `attract`), converta o objeto `options`
para `any` no ponto de uso: a config é maior que o tipo publicado.

## 8. `Module '"cn"'` não é biblioteca falsa

shadcn CLI 4.x gera `import { cn } from "cn"`. O pacote `cn` é oficial
(`github.com/shadcn-ui/cn`), substituto de `clsx` + `tailwind-merge`. Instale com
`--legacy-peer-deps` se houver conflito de peer.

## 9. Tremor + Tailwind 4

`@tremor/react@3` espera preset do Tailwind 3 (`tailwind.config.js` + safelist). Em Tailwind 4
não há arquivo de config. Instala, mas as classes utilitárias do preset não existem.
Alternativas: `npx shadcn@latest add chart` (recharts) ou Tremor Raw copiado.

## 10. Peer deps do React 19

`next-themes`, `@tremor/react` e alguns pacotes do registry declaram peer `react@^18`.
Use `npm i <pkg> --legacy-peer-deps`. Em último caso, `--force`.

## 11. Build passa, página em branco

`tsc` valida tipos, não runtime. Verifique de verdade:

```bash
npx vite preview --port 4173 &
node verify.mjs   # conta h1/h2, canvas, botões e imprime erros de console
```

O lab tem `verify.mjs` na raiz para isso (usa `playwright` como devDependency).

## 12. Tailwind 4 sem `tailwind.config.js`

- Tokens: `@theme inline { --color-*: var(--*) }` no `index.css`.
- Dark mode por classe: `@custom-variant dark (&:is(.dark *))`.
- Plugin legado: `@plugin "tailwindcss-animate"` ou use `tw-animate-css` (já no lab).
