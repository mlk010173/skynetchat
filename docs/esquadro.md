# Esquadro · camada de refino visual do chat

Passe de design aplicado sobre `frontend/src/design-ui.css` (bloco final `ESQUADRO`, 4 partes)
e em dois pontos de JSX/JS.

## Regras

- Raios: 8px (chips, botões de ação), 10px (compositor, cartões de traço), 12 a 14px (bolhas, cartões).
- Alturas: 26px (ações), 36px (botão +), 40px (enviar), 54px (topbar), 56px (compositor).
- Borda em vez de sombra: o halo `box-shadow` do compositor foi removido.
- Grade de 4px nos gaps; texto do agente alinhado a um fio lateral de 2px que só fica vermelho enquanto transmite.
- `prefers-reduced-motion` continua respeitado (bloco existente em `styles.css`).

## Mudanças de estrutura

- `components/AcoesMensagem.jsx`: mantém copiar, ouvir, regenerar, .md e votos.
  O botão "Ouvir" duplicado em `pages/Home.jsx` foi removido (havia dois controles de voz).
- `pages/Home.jsx`: o bloco "Raciocínio" (`trilha`) só aparece quando a mensagem não tem `traco`,
  eliminando a duplicidade "Concluído + Raciocínio" na mesma resposta.
- `traco.js`: `resumoTraco` passou a descrever estado e número de etapas
  (`concluído · 3 etapas`), sem repetir o tempo, que o componente já mostra à parte.

## Publicação

`cd frontend && npm test && VITE_BASE="./" npm run build -- --outDir ../site/app --emptyOutDir`,
depois commit de `site/app` em `main`. O workflow `pages` roda os testes e publica `site`.
