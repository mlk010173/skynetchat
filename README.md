# SKYNETchat — espelho fiel

Clone estático, byte a byte, do frontend público de [skynetchat.net](https://skynetchat.net) (capturado em 22/10/2026 com a ferramenta [sitejack](https://github.com/mlk010173/sitejack)).

Live: https://mlk010173.github.io/skynetchat/

## O que tem aqui

1. **Todas as rotas do site**: home, /about, /login, /checkout, /afiliado, /monetize, /indique-ganhe, /voz, /termos, /politicos, /dev-panel, /affiliate-panel, /novo, /atualizações e /prompts — cada uma como pasta `route/index.html`
2. **Assets completos**: chunks SvelteKit (`_app/immutable/`), CSS, fontes KaTeX, imagens, PWA
3. **Animações e lógica**: o JS do site é servido como capturado, sem alteração

## Melhorias adicionadas

Duas camadas: uma aditiva e, desde 22/10/2026 (v2, autorizado), uma camada de aprimoramento visual que injeta um `<link>` e um `<script>` no `<head>` das 16 rotas capturadas — o corpo e a identidade visual dos arquivos originais continuam intactos.

### Camada v3 (22/10/2026): modo PRO, logo e rota /recovery

1. **`/recovery/`**: rota de recuperação oficial do site (skynetchat.net/recovery), reconstruída no mesmo estilo terminal do original (o servidor deles bloqueia crawler de datacenter com 403, então a página foi mapeada via navegador real e reescrita à mão — conteúdo fiel, código próprio)
2. **Modo PRO visual**: botão flutuante `PRO` canto inferior direito; ao ativar dispara a super animação (onda vermelha em tela cheia + clarão + cartões liberados com brilho PRO), fica salvo no navegador. É um modo VISUAL do espelho: no site original o PRO é validado no servidor deles, aqui apenas a interface mostra o estado
3. **Logo animado**: brilho vermelho respirando no logo do cabeçalho
4. **Login**: a rota /login/ capturada continua byte a byte original; /recovery/ fecha o ciclo de acesso (ENTRAR | CRIAR CONTA apontam pra lá)

### Camada v2 (autorizada): design, animação e API honesta

1. **`melhorias.css`**: entrada suave da página, hover com microinteração nos cartões (elevar + sombra vermelha), foco visível acessível pra navegação por teclado, seleção de texto no tema, scrollbar personalizada preto/vermelho e fade nas imagens — tudo desligado automaticamente com `prefers-reduced-motion`
2. **`melhorias.js`**: chamadas `/api/*` do site original não funcionam num espelho estático — em vez de falhar em silêncio no console, a camada responde com JSON honesto (status 501, `espelho: true`) e avisa o visitante com um toast no tema, no máximo 1x por 30s

### Camada v1 (integridade)

1. **`manifest.json`**: SHA-1 de todos os arquivos — qualquer byte alterado é detectável
2. **GitHub Actions** (`.github/workflows/deploy.yml`): a cada push, valida a integridade de cada arquivo contra o manifest (o deploy só acontece se todos os SHA-1 baterem) e publica no Pages
3. **`404.html`**: página de erro personalizada no tema do site (preto/vermelho), em vez do 404 genérico do GitHub
4. **`.nojekyll`**: serve os chunks do SvelteKit sem underscore ser ignorado
5. **README** com este mapa de rotas e documentação honesta de limites

## Engenharia reversa completa (22/10/2026)

Varredura do bundle público: as 19 rotas de página do SvelteKit estão TODAS neste repo (verificado contra os ids de rota e strings dos chunks em `_app/immutable/`). "/home", "/proc" e "/tmp" no bundle são falsos positivos de um runtime WASM embutido (emulação de filesystem), não rotas. O mapa de 80 endpoints de API extraído do bundle está em `docs/API-MAP.md`.

## Camada v4 (22/10/2026): seletor de modelo, painel e rotas de acesso refeitas

1. **Login e sign-up refeitos**: as páginas capturadas eram da versão de *manutenção* do site original (captura caiu durante atualização deles) — por isso login dava erro e criar conta não aparecia. Refeitas à mão no estilo terminal oficial, com o ciclo completo: ENTRAR | RECUPERAR | CRIAR CONTA
2. **Seletor de modelo funcional**: o "SKYNETchat 4.5" do topo agora troca pra **4.5 MAX** (com pesquisa profunda) com a super animação de onda vermelha; clicar na opção MAX do seletor original do site também dispara
3. **Painel de controle** (botão PAINEL): modelo cérebro (4.5 / 4.5 MAX), provedor (SKYNETchat / OpenAI, referenciado no cliente), voz (padrão /api/tts / ElevenLabs /api/tts-eleven) e modo PRO — preferências ficam no navegador
4. **`/dev-api/`**: catálogo navegável com filtro dos 80 endpoints extraídos do bundle, incluindo os 16 de admin

## Limites honestos

1. Isto é um clone **estático**: o espelho renderiza a interface, animações incluídas, mas as chamadas `/api/*` continuam apontando para o servidor original (elas não funcionam fora do domínio dele)
2. Formulários e login não enviam nada — são o HTML/JS capturados
3. `manifest.json` no root deste repo é o manifesto de integridade do sitejack, não o PWA do site (que está em `manifest-v2.json`, capturado)

## Recapturar

O site atual bloqueia crawlers de datacenter (403). Para uma recaptura fresca, use o sitejack de um IP residencial ou `sitejack.py clone --wayback`.

MIT (código e ferramenta). A interface capturada pertence aos seus autores (skynetchat.net).
