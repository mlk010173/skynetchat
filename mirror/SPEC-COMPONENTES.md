# Captura de componentes — skynetchat.net (26/10/2026, sessão convidado + screenshots do proprietário)

Referência visual extraída com navegação real (convidado) e dos screenshots fornecidos.
Uso: replicar componentes no frontend próprio (frontend/). Nada aqui é código do site original — é a especificação observada.

## 1. Modal de conta / PRO (aberto pelo link "Assinar SKYNETchat PRO →" e pelo avatar)

| Elemento | Especificação |
|---|---|
| Fundo | overlay preto translúcido (rgba(0,0,0,.66)) + blur 6px |
| Modal | #121212, borda #242424, raio 22px, max 420px, padding 22px |
| Badge avatar | quadrado 64px raio 18px, gradiente magenta→laranja (#ff007a → #ff4b2b), letra/número branco bold |
| Título | "Conta FREE" (branco 20px) / "Plano gratuito" (vermelho suave #d06a6a) |
| Abas | Conta (👤) / Segurança (🛡) / Assinatura (✦) — fundo #1a1a1a raio 14px; ativa: #7b1e22 |
| CTA verde | gradiente #00b86f → #005f39, "Seja PRO / Desbloqueie todo o potencial" |
| Lista PRO | itens #1e1e1e raio 12px; check verde #00b86f círculo 20px; textos: "Mensagens ilimitadas", "Geração de imagens com IA", "4.5 MAX com pesquisa profunda", "Memória da IA" |
| Botão final | verde sólido, full-width, raio 14px, "ASSINAR PRO" |
| Fechar | ✕ cinza canto superior direito |

Variação promo (modal branco): fundo branco, logo S vermelho, "4.5 MAX já está disponível", checks vermelhos #d32f2f, botão preto "Conhecer o PRO".

## 2. Ações de mensagem no chat

- Botão do usuário: "Editar" e "Copiar" (bolhas flutuantes sob a mensagem)
- Resposta IA: "Trabalhou por 13s" (texto verde), copiar, refresh, contagem de fontes ("31 fontes" com logos), like/dislike
- Palavras-chave com pill de fundo (wget, HTTrack, SvelteKit)
- Botão pill "github" com logo

## 3. Composer

- Placeholder rotativo: "Pesquise sem censura..." / "Pergunte sem medo." / "Vá além" / "Sem filtros, sem limites."
- Pill de ferramenta acima do input ("Análise de Sites" / "Engenharia Reversa") com X — **depende do agente com ferramentas (pendente)**
- Botões: + anexo, mic, enviar vermelho circular #ff3e3e

## 4. Rodapé do chat

- Link vermelho #ff2e2e: "Assinar SKYNETchat PRO →" → abre modal acima (aba Assinatura)

## 5. Header

- ☰ | SKYNETchat 4.5 (▾) | lua (tema) | ✎ (novo chat) | contador 4/5 (limite de uso)

## Estado no nosso clone

- ✔ Modal de conta com abas (frontend/src/pages/Account.jsx)
- ✔ Ações Copiar/Editar + "Trabalhou por Xs" (tempo real)
- ✔ Placeholders rotativos + link PRO
- ⚠ Pill de ferramenta no composer → aguarda integração do agente (server/ no Render)
- ⚠ Like/dislike e contagem de fontes → aguarda tabela de feedback + integração de busca
