# Catálogo de endpoints de API — SKYNETchat

63 endpoints extraídos dos bundles JS do frontend (superfície pública):

## Chat e IA
- `/api/chat`, `/api/chat-V2-fast`, `/api/chat-V2-thinking`
- `/api/chat-V3`, `/api/chat-V3-interacao`, `/api/chat-V3-thinking`, `/api/chat-V4`
- `/api/chat-search`, `/api/classify-intent`, `/api/code-repair`
- `/api/image-gen`, `/api/image-followups`, `/api/vision`
- `/api/tts`, `/api/tts-eleven`, `/api/speak`, `/api/export-pdf`, `/api/pdf-generate`

## Conta e autenticação
- `/api/access-code`, `/api/session` (401 sem login), `/api/security/new-code`
- `/api/recovery/email`, `/api/recovery/request`
- `/api/memory`, `/api/memory/toggle`, `/api/preferences`

## Monetização e pagamentos
- `/api/pix`, `/api/checkout-recover`, `/api/currency-verify`
- `/api/stripe/checkout`, `/api/stripe/portal`, `/api/monetize-interest`
- `/api/affiliate`, `/api/affiliate/withdraw`

## Painel admin (protegido)
- `/api/admin/accounts`, `/api/admin/feedback`, `/api/admin/influencer`
- `/api/admin/metrics-refresh`, `/api/admin/pix-metrics-details`, `/api/admin/pix-summary`
- `/api/admin/product-analytics`, `/api/admin/subaccounts`, `/api/admin/support`

## Dados e ferramentas
- `/api/osint`, `/api/projects`, `/api/prompts`, `/api/groups`
- `/api/files/upload`, `/api/files/`, `/api/file-extract`
- `/api/integrations`, `/api/integrations/gmail/permissions`
- `/api/conversations/config`, `/api/conversations/migrate`
- `/api/feedback`, `/api/initial-feedback`, `/api/updates`, `/api/title`
- `/api/log`, `/api/log/message`, `/api/analytics`, `/api/support`, `/api/support/session`

Observação: nenhum endpoint é clonável num espelho estático (backend privado).
O catálogo documenta a superfície para fins de auditoria do próprio dono.
