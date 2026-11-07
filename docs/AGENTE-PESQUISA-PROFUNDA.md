# Agente SKYNET · pesquisa em segundo plano e dados de primeira mão

Atualização do app React (`frontend/src`), publicada em
https://mlk010173.github.io/skynetchat/app/.

## O que mudou

### 1. Planejador (`src/agente.js`)

O pedido é quebrado em 3 a 5 frentes independentes antes de qualquer busca, sem
depender de LLM:

- `nucleo`: o assunto limpo (sem "pesquise sobre", sem pontuação);
- uma frente por intenção detectada: definição, notícia recente, dados e números,
  comparação, crítica/risco, tutorial, vídeo, rede social;
- duas frentes universais de dossiê: contexto histórico e documento oficial.

O plano aparece no chat em tempo real, dentro do painel "Pesquisa em segundo plano".

### 2. Coleta paralela com orçamento

- fila com no máximo 2 leitores simultâneos e retry com espera crescente em 429/403/5xx;
- cada frente roda isolada: uma falha não derruba as outras;
- cache de 12 minutos por consulta, por leitura e por cidade.

### 3. Ranking com filtro de citação

Cada resultado recebe nota por:

| Critério | Peso |
| --- | --- |
| autoridade do domínio (`.gov`, `.edu`, órgão, jornal grande, docs) | até +30 |
| recência aparente no título | até +14 |
| aderência aos termos da consulta | +6 por termo |
| já lido na íntegra | +18 |
| rede social sem lastro (pinterest, facebook, tiktok) | −8 |

URLs passam por canonicalização (remove `utm_*`, `fbclid`, `igshid`, barra final),
o que evita contar a mesma página três vezes, e só fica o que tem URL http e título:
filtro de citação válida.

### 4. Dado de primeira mão

As duas melhores fontes de cada dossiê são lidas de verdade: o corpo da página é
extraído e a passagem com mais termos da consulta vira o "trecho da fonte" dentro do
cartão, com selo **lida na íntegra**. O texto do resumo também cita essas passagens.

### 5. Pesquisa e pensamento em segundo plano

O painel de progresso é montado no instante do envio e atualiza a cada etapa:
planejando → coletando → filtrando e ordenando → lendo as fontes primárias → dossiê
pronto. A resposta do modelo chega independente disso e os painéis entram quando
ficam prontos, sem travar o chat.

### 6. Renderização

- fontes com favicon, domínio, selos ("lida na íntegra", "N frentes") e trecho
  expansível;
- pesquisa com 6 passos animados e indicador de "buscando…";
- notícias com veículo e horário, vídeos com thumb 16:9, Instagram com prévia
  carregada sob demanda, clima com previsão de 6 dias e galeria com zoom.

## Referências open source usadas como base

- [assafelovic/gpt-researcher](https://github.com/assafelovic/gpt-researcher): planner
  gera perguntas de pesquisa, agentes de execução coletam em paralelo, publisher
  agrega com citações.
- [render-examples/parallel-research-agent](https://github.com/render-examples/parallel-research-agent):
  divide a pergunta em threads independentes com orçamento e retry por ramo e
  sintetiza em relatório citado.
- [efficient-deep-research/efficient-deep-research](https://github.com/efficient-deep-research/efficient-deep-research):
  reranker e filtro por formato de citação válido.
- [bytedance/deer-flow](https://github.com/bytedance/deer-flow): orçamento de
  contexto, compactação e preservação de raciocínio entre turnos.

## Limites que continuam existindo

Não há chave de API de busca paga: a coleta usa leitores públicos com CORS e por
isso depende do limite deles (por isso a fila e o cache). Se algum dia você plugar
Serper/Tavily/Brave, basta trocar a função `web()` em `src/pesquisa.js`.
