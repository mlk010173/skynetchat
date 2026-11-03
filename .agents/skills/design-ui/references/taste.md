# Regras de gosto (design que não parece template)

## 1. Cor
- Uma cor de marca. Todo o resto é neutro: `--card`, `--muted`, `--border`, `--foreground`.
- Cor por item de lista é ruído. Só use segunda cor para **categoria** real, e no máximo duas.
- Verde/vermelho só com significado (delta, status). Nunca decorativo.
- Em fundo escuro: corpo em `foreground`, secundário no mínimo `white/50`. Nunca `white/30`
  em texto que precisa ser lido.
- Acento saturado em área pequena (botão, badge, ícone). Fundo grande com cor saturada
  envelhece rápido.

## 2. Tipografia
- Três degraus visíveis: display (`text-4xl` a `text-6xl`), corpo (`text-sm`/`text-base`),
  legenda (`text-xs`).
- `tracking-tight` em títulos grandes, `leading-relaxed` em parágrafos.
- Largura de leitura: `max-w-xl` a `max-w-2xl` para texto, `max-w-6xl` para a página.
- `text-balance` em título, `text-pretty` em parágrafo.
- Nunca mais de duas famílias. Se usar uma display, o corpo continua na sans do sistema.

## 3. Espaço e grade
- Ritmo de 4px. Seção `py-14` a `py-24`, gap de card `gap-4`/`gap-6`.
- Alinhamento: tudo numa coluna de grade. Hero centralizado ou alinhado à esquerda, não os dois.
- Densidade: dashboard é denso (linhas de 40 a 56px), landing é arejada.
- Borda + fundo sutil > sombra pesada. No máximo uma sombra por tela.

## 4. Movimento
- Um efeito dominante por seção. O resto entra com `blur-fade`/`fade` curto.
- Duração: 150 a 300ms para UI, 400 a 800ms para entrada de seção, loop infinito só em
  ornamento.
- Nada de animação em elemento que o usuário está lendo.
- Respeite `prefers-reduced-motion`: registries da Magic UI já usam `useReducedMotion`;
  em código próprio, condicione a animação.
- Hover muda no máximo duas propriedades (cor + elevação). Evite `scale` e `translate`
  juntos.

## 5. Componentes
- Botão primário: um por tela/seção. O resto é secundário ou ghost.
- Ícone dentro de botão: 16px, `gap-2`, alinhado ao texto.
- Card: raio consistente (`rounded-xl`), borda 1px, fundo levemente elevado. Efeito de brilho
  só no card em destaque.
- Formulário: label acima, erro abaixo em `text-destructive`, `aria-invalid`, foco visível.
- Tabela: cabeçalho em `text-xs uppercase tracking-wide muted`, linha com hover, números
  alinhados à direita e fonte tabular.

## 6. Estados obrigatórios
hover, focus-visible, active, disabled, loading (skeleton, não spinner em lista), vazio
(com ação), erro (com saída), sucesso (toast curto).

## 7. Acessibilidade
- Contraste AA: 4.5:1 em texto, 3:1 em ícone grande.
- Ornamento animado: `aria-hidden="true"` e `pointer-events-none`.
- Alvo de toque ≥ 40px; `focus-visible:ring-2`.
- Hierarquia de heading sem pular nível (h1 → h2 → h3).
- Nunca comunicar estado só por cor.

## 8. Anti-padrões (o que faz parecer amador)
- Gradiente arco-íris em cada card.
- Emoji como ícone de linha.
- `bg-black` cravado dentro de componente que precisa funcionar nos dois temas.
- Três efeitos de fundo na mesma tela (grid + partículas + raios).
- Texto centralizado em parágrafo longo.
- Sombra pesada em tudo para "dar profundidade".
- Contador animado em mais de dois números por tela.
