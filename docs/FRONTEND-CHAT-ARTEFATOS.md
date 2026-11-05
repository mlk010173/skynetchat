# Frontend do chat + motor de artefatos

Este é o frontend que está publicado em https://mlk010173.github.io/skynetchat/.

Ele é a interface completa do chat extraída do repositório
[`mlk010173/skynetchat-clone`](https://github.com/mlk010173/skynetchat-clone) (`frontend/`),
com duas camadas novas: **artefatos** e **mídia/prints**. O app React anterior continua
disponível em [`site/app/`](https://mlk010173.github.io/skynetchat/app/) como reserva.

## O que veio do clone

| Origem | Destino | Conteúdo |
| --- | --- | --- |
| `index.html` | `site/index.html` | shell do app, sidebar, composer, welcome, painéis |
| `assets/css/skynet.css`, `skynet-extra.css`, `panel.css`, `turnstile.css`, `clone.css`, `pages.css` | `site/assets/css/` | design original + ajustes do clone |
| 59 fontes KaTeX | `site/assets/css/` | notação matemática nas respostas |
| `assets/js/app.js` | `site/assets/js/app.js` | chat, streaming, histórico, anexos, painéis |
| `assets/js/protocol.js` | `site/assets/js/protocol.js` | protocolo SSE, log de pensamento, fontes, downloads |
| `login.html`, `sobre.html`, `termos.html`, `monetizar.html`, `indicar.html` | `site/` | páginas institucionais do clone |
| `assets/img/*` | `site/assets/img/` | logo, ícones e manifest |

O que o usuário vê no chat: lista de conversas, streaming com log de pensamento,
modos Rápido / MAX / Pesquisa, gaveta de fontes com pílulas de citação,
chips de anexo, painéis (conta, assinatura, ferramentas, imagens) e o composer original.

## Camada nova 1 — artefatos (`assets/js/artifacts.js` + `assets/css/artifacts.css`)

Qualquer bloco de código com a linguagem `artefato` contendo **apenas JSON** vira um
widget nativo dentro da bolha, no tema preto/vermelho do app. Sem backend, sem iframe
para os tipos nativos.

Tipos suportados:

```jsonc
// notícias — lista com fonte, data e resumo
{"type":"noticias","titulo":"Notícias · Lula","subtitulo":"modo demonstração",
 "itens":[{"titulo":"...","fonte":"g1.globo.com","data":"5 nov","resumo":"...","url":"https://..."}]}

// clima — ao vivo (Open-Meteo, sem chave) quando só há cidade
{"type":"clima","titulo":"Clima · Tóquio","cidade":"Tóquio"}
// ou com dados prontos
{"type":"clima","titulo":"Clima · Recife","atual":{"temp":29,"sensacao":31,"umidade":74,"vento":12,"codigo":1},
 "previsao":[{"dia":"hoje","min":24,"max":31,"codigo":1}]}

// galeria de fotos/prints
{"type":"fotos","titulo":"Prints recebidos","imagens":[{"url":"https://...","legenda":"..."}]}

// tabela, gráfico e página
{"type":"tabela","titulo":"...","colunas":["a","b"],"linhas":[["1","2"]]}
{"type":"grafico","titulo":"...","series":[{"label":"jan","valor":12}]}
{"type":"html","titulo":"...","codigo":"<html>...</html>"}
```

Como funciona por dentro:

- `scan()` varre o chat atrás de `<pre>` com JSON válido e troca o bloco de código pelo widget.
- O gatilho é **throttle** (140 ms) via `MutationObserver` + laço de segurança de 600 ms.
  Debounce puro não funciona aqui: o shell do clone anima logo, contador de créditos e
  partículas o tempo todo, então o timer seria reiniciado eternamente.
- Clima ao vivo usa `geocoding-api.open-meteo.com` + `api.open-meteo.com` (CORS liberado),
  cache em memória por cidade e esqueleto de carregamento.
- Cada widget tem rodapé com **Copiar** (JSON), **Baixar** (`.json`, ou `.html` no tipo página)
  e **Abrir** (só no tipo página).
- No modo demonstração (sem chave de API), o gerador `demoText()` monta os artefatos de
  clima, notícias e galeria de prints, então o recurso aparece funcionando sem chave.
- No modo API, o `system` padrão já instrui o modelo a responder com um artefato por vez.

## Camada nova 2 — mídia e prints (`assets/js/midia.js`)

- Colar (`Ctrl+V`), arrastar e soltar ou anexar pelo botão do clipe.
- Print colado recebe nome legível: `print-HH-MM-SS.png`.
- Imagens redimensionadas para 360 px e comprimidas em JPEG antes de ir para o histórico.
- Clique em qualquer imagem do chat abre **lightbox** com navegação (`←`/`→`), contador,
  download e fechar por `Esc`.
- Modo API envia a imagem como parte `file` (base64) junto do texto, então o modelo lê o print.

## Como publicar

O site publicado é o conteúdo de `site/`, enviado pelo workflow
`.github/workflows/pages.yml` a cada push na `main`. Não há build: o que está em `site/`
é exatamente o que vai ao ar.

```bash
git add site docs/FRONTEND-CHAT-ARTEFATOS.md
git commit -m "feat(chat): frontend do clone + motor de artefatos e prints"
git push origin main
```

## Como testar localmente

```bash
cd site && python3 -m http.server 8099
# abra http://127.0.0.1:8099
```

Roteiro rápido: peça "clima em Tóquio", "notícias sobre inteligência artificial",
cole um print e peça "analise esse print".

## Limites conhecidos

- O motor demo é local: as "notícias" abrem a busca na fonte, não raspam manchetes.
  Com endpoint configurado em **Configurar IA**, o modelo devolve o JSON com manchetes reais.
- `site/app/` é o app React anterior, mantido apenas como reserva.
- O `frontend/` extraído do site original (bundles SvelteKit) segue documentado no repo
  `skynetchat-clone`; aqui fica só o necessário para o site rodar.
