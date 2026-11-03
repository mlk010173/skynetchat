# Composições prontas

Blocos de layout montados com o que está instalado no lab. Copie a estrutura, troque o texto.

## Landing page (ordem que converte)

1. **Hero** `min-h-[78vh]`, fundo `GridPattern` + `Spotlight`, título com `AuroraText`,
   subtítulo `max-w-xl text-white/50`, dois CTAs (`ShimmerButton` primário,
   `RainbowButton`/ghost secundário), prova social em `Marquee`.
2. **Problema → solução** duas colunas, ícone `lucide` 20px, corpo `text-sm`.
3. **Features** `BentoGrid` com 3 a 5 células, uma célula ocupando 2 colunas. Cada célula:
   ícone, título `text-sm font-medium`, uma linha de `text-xs`.
4. **Números** três `NumberTicker` em `Tile`, nunca mais que três.
5. **Prova** `Marquee` de logos ou `AnimatedList` de depoimentos curtos.
6. **Pricing** três tiers, o do meio com `BorderBeam` ou `ShineBorder`, um CTA por tier.
7. **FAQ** `accordion` do shadcn, 5 a 7 itens.
8. **CTA final** fundo `DotPattern` + `GradientHeading` + botão.
9. **Footer** quatro colunas, `text-xs text-white/40`.

Limite: um efeito de fundo animado por página inteira (grid **ou** raios **ou** partículas).

## Dashboard

```
sidebar 240px (fixa) | main
                      ├─ header: título + filtros + avatar
                      ├─ 4 KPI cards (grid md:grid-cols-4)
                      ├─ chart grande (2/3) + lista de atividade (1/3)
                      └─ tabela com paginação
```

- KPI: label `text-xs uppercase text-muted-foreground`, valor `text-2xl font-semibold`,
  delta com seta.
- Chart: uma série = uma cor. Grid em `--border`, eixo em `--muted-foreground`.
- Tabela: `@tanstack/react-table`, coluna numérica `text-right tabular-nums`.
- Densidade: linha 48px, `px-4`, sem borda vertical.
- Estado vazio com ação, skeleton no loading, erro com "tentar de novo".

## Página de configurações

- `direction-aware-tabs` (Cult UI) ou `tabs` do shadcn para as seções.
- Cada seção: título, descrição de uma linha, controles à direita (`switch`, `select`).
- Salvar fixo no rodapé com `sonner` para o toast de confirmação.
- Destrutivo separado, com `dialog` de confirmação digitando o nome.

## Auth

- Split 50/50: formulário à esquerda, prova visual à direita (`hero-video-dialog` ou imagem).
- Campos com label acima, erro embaixo, `autoComplete` correto.
- OAuth antes do e-mail se for o caminho principal.
- Um link de recuperação, um de cadastro, nada mais.

## Card com destaque (sem virar circo)

```tsx
<MagicCard gradientColor="#262626" className="rounded-xl border border-white/10">
  <div className="p-5">
    <Icon className="mb-4 size-5 text-white/70" />
    <p className="font-medium">Título</p>
    <p className="mt-1 text-sm text-white/45">Uma linha de apoio.</p>
  </div>
</MagicCard>
```

Um card com efeito por grade. Os vizinhos ficam neutros.

## Texto animado sem exagero

| Situação | Componente |
|---|---|
| Título de hero | `AuroraText` ou `TextAnimate animation="blurInUp" by="word"` |
| Subtítulo que troca de palavra | `WordRotate` (2 a 4 palavras) |
| Terminal / log | `Terminal` + `AnimatedSpan` |
| Número que conta | `NumberTicker` (máx. 3 por tela) |
| Ênfase em frase | `Highlighter` (uma por bloco) |

Nunca `TypingAnimation` em parágrafo longo: cansa e quebra leitura em leitor de tela.
