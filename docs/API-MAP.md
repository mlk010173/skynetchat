# Mapa de API — engenharia reversa do bundle público

Extraído dos chunks JS públicos (`_app/immutable/`) servidos a todo visitante de skynetchat.net. Estes são **caminhos de endpoints** encontrados no código do cliente: no espelho estático nenhum responde, e no site original exigem autenticação/sessão. Documentado como superfície de engenharia reversa, não como funcionalidade.

## Autenticação e conta
/api/session · /api/access-code · /api/recovery/email · /api/recovery/request · /api/security/new-code

## Admin (16 endpoints — superfície administrativa revelada pelo bundle)
/api/admin/accounts · /api/admin/analytics-snapshot · /api/admin/conversion-hourly · /api/admin/feedback · /api/admin/influencer · /api/admin/initial-feedback · /api/admin/lookup · /api/admin/metrics-refresh · /api/admin/pix-metrics-details · /api/admin/pix-summary · /api/admin/product-analytics · /api/admin/referral-stats · /api/admin/stats · /api/admin/subaccounts · /api/admin/support

## Chat e IA
/api/chat · /api/chat-search · /api/chat-sync/events · /api/chat-sync/reconcile · /api/conversations · /api/conversations/config · /api/conversations/migrate · /api/classify-intent · /api/code-repair · /api/memory · /api/memory/toggle · /api/title · /api/vision · /api/image-gen · /api/image-followups · /api/osint

## Voz e mídia
/api/speak · /api/tts · /api/tts-eleven · /api/export-pdf · /api/pdf-generate · /api/file-extract · /api/files/upload · /api/groups

## Pagamentos (três provedores!)
/api/pix · /api/checkout-status · /api/checkout-recover · /api/stripe/checkout · /api/stripe/portal · /api/paypal/orders

## Afiliados e monetização
/api/affiliate · /api/affiliate/dashboard · /api/affiliate/withdraw · /api/affiliate/withdraw/status · /api/monetize-interest

## Integrações e dados
/api/integrations · /api/integrations/gmail/permissions · /api/analytics · /api/geolocation · /api/crypto-price · /api/currency-rate · /api/currency-verify · /api/soccer · /api/politicos/search · /api/prompts · /api/projects · /api/preferences · /api/feedback · /api/initial-feedback · /api/log · /api/log/message · /api/support · /api/support/session · /api/updates

## Rotas falsamente suspeitas (verificadas)

"/home", "/proc" e "/tmp" apareceram no bundle e pareceriam rotas escondidas, mas são chamadas `mkdir` de um **runtime WASM embutido** no site (emulação de sistema de arquivos, provavelmente para o futuro recurso Codex de execução de código). NÃO são rotas navegáveis. Verificado por contexto: `createDefaultDirectories(){EA.mkdir("/tmp"),EA.mkdir("/home")...}`.

## Conclusão da varredura

As rotas de página reais do SvelteKit são exatamente as 19 presentes neste repo (16 capturadas byte a byte + recovery reconstruída + a raiz). **Não há rota de página escondida fora do espelho.** O que existe "escondido" é o painel admin, que no site original vive atrás de login — e sua superfície está mapeada acima.
