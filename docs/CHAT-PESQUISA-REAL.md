# Chat com pesquisa real (publicado em /novo/)

Endereço: https://mlk010173.github.io/skynetchat/novo/

É o chat do clone (interface completa) rodando com um pipeline de pesquisa que
busca de verdade no navegador, sem chave, sem backend e sem limite de uso.
O app React anterior continua intacto na raiz e em `/app/`.

## O que o agente faz agora

| Pedido | O que acontece |
| --- | --- |
| "últimas notícias sobre X" | busca fresca (24h/7d), filtra veículos de imprensa e monta o widget de notícias |
| "vídeos sobre X no YouTube" | busca na API Piped, traz thumb, canal, duração, views e data |
| "perfis/posts de X no Instagram" | descobre perfis e publicações públicas e abre a prévia oficial no chat |
| "pesquise sobre X" / "o que é X" | resumo da Wikipédia + lista de fontes com domínio e trecho |
| "clima em X" | Open-Meteo ao vivo, previsão de 6 dias |
| print colado | galeria com zoom, nome `print-hora.png` |

Widgets disponíveis: notícias, vídeos, Instagram, fontes, clima, fotos, tabela,
gráfico e página HTML. Cada um tem copiar/baixar.

## Provedores usados (todos públicos, com CORS)

- **DuckDuckGo Lite** e **Bing** lidos via `r.jina.ai` (o leitor devolve markdown e
  libera CORS; os links vêm codificados e são decodificados no cliente).
- **Wikipédia API** (`origin=*`) para busca e resumo.
- **Piped API** para YouTube, com quatro instâncias em cascata.
- **Instagram**: busca pública + `instagram.com/…/embed/` (iframe oficial).
- **Open-Meteo** para clima.

Se um provedor falha, o próximo assume; se todos falham, o cartão traz o link
direto da busca. Nunca aparece mensagem de "recurso limitado".

## Limites de uso removidos

- cota de convidado (antes 3 mensagens e redireciono para o login)
- trava de créditos e painel "assinar PRO" antes de responder
- contador agora mostra `ilimitado`

## Estrutura

```
site/novo/
  index.html            shell do chat
  assets/js/pesquisa.js pipeline de busca (web, notícias, vídeos, instagram, resumo)
  assets/js/artifacts.js motor de widgets + build() que decide o que buscar
  assets/js/protocol.js  protocolo SSE, log de pensamento, fontes
  assets/js/app.js       chat, histórico, anexos, painéis (sem cotas)
  assets/js/midia.js     lightbox de prints
  assets/css/…           design original + artifacts.css
```

## Como testar

Abra `/novo/` e peça, em sequência: "quero vídeos sobre história do brasil",
"perfis de instagram do lula", "últimas notícias sobre inteligência artificial",
"pesquise sobre computação quântica". Verificado em viewport de celular: 8 vídeos,
6 perfis, 4 notícias e 8 fontes montados na mesma conversa, sem erro de console.

## Remover

`git rm -r site/novo` e push. A raiz e `/app/` não são afetadas.
