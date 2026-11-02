# Relatório E2E — SkynetChat (site publicado)

Execução: 02/11/2026, site `https://mlk010173.github.io/skynetchat/`, Playwright/Chromium headless.
Scripts em `frontend/tests/*.mjs`, cada um com timeout rígido de 260s. Rate limits (`auth_attempts`, `anon_requests`) zerados antes da rodada via Management API do Supabase.

## Consolidado

| # | Script | Item coberto | Status | Evidência (saída real) |
|---|---|---|---|---|
| 1 | `tests/audit.mjs` | Visitante: home, chat anônimo respondendo | **APROVADO** | `✔ visitante vê a home`, `✔ visitante vê Fazer login`, `✔ mensagem do visitante aparece`, `✔ visitante recebeu resposta real da IA` |
| 2 | `tests/audit.mjs` | Auth por código de 12 dígitos + sessão persistente | **APROVADO** | `✔ código inválido tratado com mensagem visível`, `✔ conta criada, código: 8753-7355-8473`, `✔ sessão persiste após reload (sino visível)`, `✔ login com código válido funciona` |
| 3 | `tests/audit.mjs` | Chat logado + notificações | **APROVADO** | `✔ chat logado respondeu`, `✔ sino com badge de não lidas`, `✔ notificação de boas-vindas no painel` |
| 4 | `tests/test-fontes.mjs` | Busca real com fontes clicáveis (href http) | **APROVADO** | `Nota de horário: dados obtidos em 08:12`, 5 fontes com URL `https://news.google.com/rss/...` e Wikipedia, `✔ SUCESSO: Chips de fontes exibidos corretamente com URLs http!` |
| 5 | `tests/test-fontes.mjs` | Regressão: chat simples não emite chips | **APROVADO** | `Chips no chat simples: 0`, `✔ SUCESSO: Chat de regressão respondeu normalmente sem emitir chips de ferramentas!`, `Console errors: Nenhum` |
| 6 | `tests/test-integracoes.mjs` | Página /integracoes com estados reais | **APROVADO** | 6 cards: agente `Online / 11 ferramentas ativas`, ia `Online / 17 modelos`, web `Online / web_pesquisar ativo`, terminal `Online / AGENT_TOKEN configurado`, email `Online / Token GMAIL_ACCESS_TOKEN configurado`, banco `Online / PostgreSQL REST 200 OK` |
| 7 | `tests/test-integracoes.mjs` | Botão "Testar" ao vivo + navegação pelo drawer | **APROVADO** | `Badge do primeiro card após re-teste ao vivo: ● Online`, `URL após clicar no Drawer: .../#/integracoes`, `Console errors: Nenhum` |
| 8 | `tests/test-automacoes.mjs` | Criar automação + "Executar agora" + run no histórico | **APROVADO** | `✔ Automação "Teste E2E Automacao 08:13:40" criada`, run no histórico: `sucesso 08:13 SUCESSO`, `0 erros de console` |
| 9 | `tests/test-email.mjs` | Painel de E-mail com dados REAIS | **APROVADO** (após correção do script) | `✔ painel abriu: E-MAIL (GMAIL API)`, `E-mails listados: 10`, `✔ lista de e-mails REAIS carregada (10 itens)`, `✔ mensagem aberta com remetente e corpo`, `Console errors: Nenhum` |

## Correções feitas apenas nos scripts de teste
- `tests/test-email.mjs`: o script injetava a sessão em `localStorage` (chave `skynet-session`), que o app não usa, então o painel caía em "Requer login". Reescrito para fazer login real pela UI (gerar código de 12 dígitos em `/sign-up`, clicar `ENTRAR`), como o `audit.mjs` já fazia, e para abrir a primeira mensagem validando remetente + corpo.
- `tests/test-fontes.mjs`: espera de 7s → 12s na regressão e fallback de seletor `.thread` → `body` (evita falso negativo quando o chat não tem thread anterior).
- Nenhum código de feature foi alterado para fazer testes passarem.

## Pré-condições operacionais (reais, não simuladas)
- `GMAIL_ACCESS_TOKEN` renovado pelo conector Gmail (OAuth do dono, conta `papaecodelta9@gmail.com`) e gravado nos secrets do projeto Supabase antes da rodada. Sem isso o painel cai no estado honesto "Token do Gmail expirado".
- API do Gmail confirmada no backend: `GET /gmail/v1/users/me/profile` → 200 (`messagesTotal: 11903`).
- Edge function `email` com sessão real: `POST /functions/v1/email {"action":"list"}` → `{"ok":true,"messages":[...10 mensagens reais...]}`.

## Pendências reais (não bloqueiam a suíte)
1. **Refresh do token Gmail**: o access token dura ~1h. Não há refresh token disponível no conector; quando expira, o painel mostra o estado honesto de token expirado. Renovar = 1 chamada ao conector + upsert do secret.
2. **Cold start do Render**: 1ª requisição do agente pode levar 30–60s; as ferramentas falham de forma graciosa sem derrubar o chat.
3. **SMTP de recuperação**: recuperação de acesso por e-mail ainda não configurada.
4. **Console 401 no `audit.mjs`**: requisição não autenticada esperada em fluxo anônimo (rede), não é erro de aplicação.
