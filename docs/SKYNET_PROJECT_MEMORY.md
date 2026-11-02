# SKYNET — Memória do Projeto

Documento vivo de contexto. Atualizado em 01/11/2026.
Diferencie sempre: **[FATO VERIFICADO]** testado com evidência real · **[PENDÊNCIA / CONHECIDO]** limitação ou tarefa futura.

---

## 1. Identidade e objetivo

- **[FATO VERIFICADO]** SKYNETchat: chat de IA em português, interface fiel ao site original skynetchat.net.
- **[FATO VERIFICADO]** Dono: GitHub `mlk010173`. Repositório: `mlk010173/skynetchat`.
- **[FATO VERIFICADO]** Regra de ouro: **nada simulado** — todo botão executa função real ou mostra estado honesto ("em construção"), nunca finge funcionar.

---

## 2. Componentes e Recursos Implementados

### (a) Ciclo de Ferramentas Real no Chat (SSE Streaming & Fontes)
- **[FATO VERIFICADO]** Edge function `chat` integra-se ao agente de ferramentas em https://skynet-agent.onrender.com.
- **[FATO VERIFICADO]** Quadros SSE transmitidos em tempo real: `{"tool", "status", "fontes"}` para rastreabilidade de chamadas (ex: `web_pesquisar`).
- **[FATO VERIFICADO]** As fontes retornadas nas buscas web contêm links reais clicáveis e indicação de timestamp `"dados obtidos em HH:MM"`.
- **[FATO VERIFICADO]** Teste real realizado com sucesso pesquisando a cotação do dólar, com resposta citando fonte oficial e timestamp.

### (b) Terminal Real Token-Scoped (`agent-exec`)
- **[FATO VERIFICADO]** Edge function `agent-exec` exige autenticação via sessão Supabase real (`Authorization: Bearer <access_token>`).
- **[FATO VERIFICADO]** Validação estrita de comandos via whitelist de executáveis: `ls`, `cat`, `grep`, `find`, `head`, `tail`, `wc`, `echo`, `node`, `python3`, `git`, `npm`, `df`, `du`.
- **[FATO VERIFICADO]** Bloqueio de encadeamento e subshells com regex estrito de caracteres proibidos: `;`, `|`, `&&`, `$()`, `>`, `<`.
- **[FATO VERIFICADO]** Chamadas válidas são enviadas ao agente em `/tools/terminal` usando `AGENT_TOKEN` seguro.
- **[EVIDÊNCIAS DE TESTE]**:
  - Sem sessão -> **HTTP 401**: `{"ok":false,"error":"Não autorizado"}`
  - Comando `ls` autenticado -> **HTTP 200**: `{"ok":true,"stdout":"...","ms":45}`
  - Comando `rm -rf /` -> **HTTP 400**: `{"ok":false,"error":"Comando não permitido"}`

### (c) Central de Integrações (`integracoes` & `/integracoes`)
- **[FATO VERIFICADO]** Edge function `integracoes` monitora em tempo real o estado de saúde dos serviços conectados.
- **[FATO VERIFICADO]** Página `/integracoes` exibe cartões com estados reais:
  - `online`: serviço ativo e respondendo dentro do timeout.
  - `dormindo`: plano free do Render inativo (cold start detectado).
  - `pendente_configuracao`: secret ausente (ex: `GMAIL_ACCESS_TOKEN`).
  - `indisponivel`: falha de rede ou timeout.
- **[FATO VERIFICADO]** Botão "Testar" dispara requisições ao vivo para validar a conectividade.

### (d) Automações Persistentes (`automations` + `automations_runs`)
- **[FATO VERIFICADO]** Tabelas `automations` e `automations_runs` criadas com RLS para isolamento por usuário.
- **[FATO VERIFICADO]** Edge function `automations-tick` executada a cada 5 minutos pelo job `pg_cron` (`skynet-automacoes`) via `pg_net` e autenticada por `x-tick-token`.
- **[FATO VERIFICADO]** Edge function `automations-run` autenticada por sessão de usuário para o disparo imediato ("Executar agora").
- **[FATO VERIFICADO]** Notificações gravadas automaticamente na tabela `notifications`.
- **[EVIDÊNCIA DE TESTE]**: Execução disparada com sucesso via painel, gerando registro em `automations_runs` com `status: "sucesso"` e id de notificação.

### (e) Integração Real com Gmail (`email`)
- **[FATO VERIFICADO]** Edge function `email` suporta ações: `list`, `search`, `read`, `draft`, `send`.
- **[FATO VERIFICADO]** Painel de E-mail no drawer com busca em tempo real, visualização de mensagens, criação de rascunhos e modal de confirmação dupla para envio.
- **[LIMITAÇÃO DE FATO]**: O secret `GMAIL_ACCESS_TOKEN` é de curta duração (~1 hora) e expira se não houver um fluxo de refresh token automatizado.

### (f) Painel de Memória de Longo Prazo (`memorias` & `MemoriaPanel`)
- **[FATO VERIFICADO]** A tabela `agent_memory` (pgvector 1536d, schema public) armazena memórias de usuário (colunas: `id`, `email`, `texto`, `criado_em`).
- **[FATO VERIFICADO]** Como `agent_memory` não possui RLS de leitura própria, o acesso é restrito à Edge Function `memorias/index.ts`.
- **[FATO VERIFICADO]** `memorias/index.ts` valida o JWT do usuário (`supabase.auth.getUser`) e utiliza a `SERVICE_ROLE` apenas para filtrar dados do próprio usuário (`email = user.id OR email = user.email`).
- **[FATO VERIFICADO]** Ações suportadas:
  - `{action:'list'}`: retorna até 20 últimas memórias do usuário.
  - `{action:'read', id}`: retorna texto completo da memória.
  - `{action:'delete', id}`: remove o registro somente se pertencer ao usuário.
- **[FATO VERIFICADO]** Painel no drawer (`frontend/src/components/MemoriaPanel.jsx` ligado via `Sidebar.jsx`) com tag `REAL` e ícone `IconBook`.
- **[EVIDÊNCIAS DE TESTES REALIZADOS VIA CURL]**:
  1. **Sem token de sessão**:
     - Retorna **HTTP 401**: `{"ok":false,"error":"Token de autorização não fornecido"}`
  2. **Com sessão autenticada real (`user_id`: `77e6fbce-2801-4fef-80b4-1f5167636a34`)**:
     - `POST /functions/v1/memorias` `{"action":"list"}` -> **HTTP 200**:
       ```json
       {"ok":true,"memorias":[{"id":7,"texto":"Memória de teste skynetchat - teste automatizado","criado_em":"2026-11-01T07:06:01.175813+00:00","score":null}]}
       ```
     - `POST /functions/v1/memorias` `{"action":"read","id":7}` -> **HTTP 200**:
       ```json
       {"ok":true,"memoria":{"id":7,"texto":"Memória de teste skynetchat - teste automatizado","criado_em":"2026-11-01T07:06:01.175813+00:00","score":null},"texto":"Memória de teste skynetchat - teste automatizado","id":7}
       ```
     - `POST /functions/v1/memorias` `{"action":"delete","id":7}` -> **HTTP 200**:
       ```json
       {"ok":true,"deleted":true,"id":7}
       ```
     - `POST /functions/v1/memorias` `{"action":"list"}` pós-deleção -> **HTTP 200**:
       ```json
       {"ok":true,"memorias":[],"data":[]}
       ```

---

### (g) Suíte E2E Validada no Site Publicado (02/11/2026)
- **[FATO VERIFICADO]** Rodada completa em `https://mlk010173.github.io/skynetchat/` com os scripts existentes em `frontend/tests/`, timeout rígido de 260s cada, rate limits zerados antes via Management API. Relatório com evidências: `frontend/tests/RELATORIO-E2E.md` (commit `5309062`).
- **[FATO VERIFICADO]** `tests/audit.mjs` — 12 verificações ✔: home do visitante, chat anônimo respondendo, código inválido tratado, conta criada (`8753-7355-8473`), sessão persiste no reload, login por código, chat logado, sino com badge e notificação de boas-vindas.
- **[FATO VERIFICADO]** `tests/test-fontes.mjs` — busca real com 5 fontes clicáveis (URLs `https://news.google.com/rss/...` e Wikipedia), nota `dados obtidos em 08:12`; regressão de chat simples com `0` chips.
- **[FATO VERIFICADO]** `tests/test-integracoes.mjs` — 6 cards com estado real: agente `Online (11 ferramentas)`, ia `Online (17 modelos)`, web `Online`, terminal `Online`, email `Online (token configurado)`, banco `Online (REST 200 OK)`; botão "Testar" re-executa ao vivo; navegação pelo drawer para `/#/integracoes`.
- **[FATO VERIFICADO]** `tests/test-automacoes.mjs` — automação criada pela UI, "Executar agora" chamou `automations-run`, run apareceu no histórico com status `sucesso`.
- **[FATO VERIFICADO]** `tests/test-email.mjs` — corrigido para logar pela UI (antes injetava sessão em `localStorage` com chave que o app não usa), então validou o painel com **10 e-mails reais** da caixa e abriu uma mensagem com remetente e corpo.
- **[FATO VERIFICADO]** Backend do Gmail reconfirmado no dia: `GET /gmail/v1/users/me/profile` → 200 (`messagesTotal: 11903`); `POST /functions/v1/email {"action":"list"}` → `ok:true` com mensagens reais.

## 3. Arquitetura do Projeto

- **Frontend**: React 18 + Vite em `frontend/`. Deploy oficial em GitHub Pages (`site/`).
- **Backend**: Supabase (`rkgwhhtenfozdwzpvxjj`, São Paulo). Edge Functions ativas: `chat`, `conversations`, `models`, `auth-code`, `agent-exec`, `integracoes`, `automations-tick`, `automations-run`, `email`, `memorias`.
- **Agente de Ferramentas**: Node.js no Render (https://skynet-agent.onrender.com).
- **Autenticação**: Exclusiva por código de 12 dígitos, convertida server-side em sessão JWT Supabase.

---

## 4. Pendências Conhecidas (Lista Honesta)

1. **Renovação Automática do Token Gmail**: O `GMAIL_ACCESS_TOKEN` expira em ~1 hora. Necessário implementar troca de `refresh_token` OAuth na edge function `email`.
2. **Cold Start do Agente Render**: Servidor no plano gratuito dorme após 15 min de inatividade; primeira chamada pode levar 30-60 segundos.
3. **SMTP para E-mails de Recuperação**: O código de recuperação é gerado, mas o envio real por e-mail necessita da configuração do serviço SMTP.
4. **Granularidade do pg_cron**: Agendamentos limitados à frequência mínima de 5 minutos imposta pelo Supabase pg_cron.
5. ~~**Build e Deploy Final de `site/`**~~ — resolvido: `site/` publicado e suíte E2E verde no domínio (ver seção 2g).
6. **Deploy do serviço de e-mail**: como o token é de curta duração, qualquer rotina que use Gmail precisa renovar o secret antes de rodar; sem isso o painel mostra o estado honesto de token expirado.

---

## 5. Arquivos e Funções Alterados Nesta Missão

- `supabase/functions/memorias/index.ts` (Criada e implantada via Management API - status ACTIVE)
- `frontend/src/components/MemoriaPanel.jsx` (Criado)
- `frontend/src/components/Sidebar.jsx` (Atualizado com item 'Memória' e painel no drawer)
- `docs/SKYNET_PROJECT_MEMORY.md` (Atualizado com evidências e documentação completa)
- `frontend/tests/test-email.mjs` (Login pela UI em vez de sessão em localStorage; valida lista + abertura de mensagem real)
- `frontend/tests/test-fontes.mjs` (Espera da regressão 7s→12s e fallback de seletor)
- `frontend/tests/RELATORIO-E2E.md` (Novo: relatório da suíte com evidência por item)
