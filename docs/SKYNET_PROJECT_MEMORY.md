# SKYNET — Memória do Projeto

Documento vivo de contexto. Atualizar a cada mudança relevante.
Diferencie sempre: **[FATO]** verificado com evidência · **[PARCIAL]** existe mas incompleto · **[PLANO]** desejado, não implementado.

## 1. Identidade e objetivo

- **[FATO]** SKYNETchat: chat de IA em português, interface fiel ao site original skynetchat.net.
- **[FATO]** Dono: GitHub `mlk010173`. Repositório: `mlk010173/skynetchat`.
- **[FATO]** Regra de ouro: **nada simulado** — todo botão executa função real ou mostra estado honesto ("em construção"), nunca finge funcionar.

## 2. Interface original (requisitos visuais)

- **[FATO]** Mobile-first: fundo `#070000`/preto, vermelho `#dc2626`/`#c4161c`, fonte Inter + JetBrains Mono, estética terminal (`>_`).
- **[FATO]** Drawer: Novo chat, Indique e Ganhe, Monetize (NOVO), Atualizações, Imagens (BETA), Conversas em grupo (NOVO), Codex (EM BREVE), Projetos (NOVO), Histórico, Conheça, Prompts, Suporte. Rodapé: Conta/Configurações, Sair/Fazer login, Tema (BLACK/WHITE), Instagram, Termos.
- **[FATO]** Home: header com ☰ + seletor "SKYNETchat <modelo> ▾" + tema + novo chat (+ sino quando logado); hero "Apresentamos o SKYNETchat" + grade (Pesquisar/Gerar Imagens/Persuasão/Programar); composer com +, "Pesquise sem censura...", mic (voz real pt-BR), enviar vermelho.
- **[FATO]** Auth: telas `>_ AUTENTICAÇÃO/CRIAR CONTA/RECUPERAÇÃO` estilo terminal. **Login exclusivo por código de 12 dígitos (0000-0000-0000)** — e-mail/senha foi removido por decisão do dono; e-mail só na recuperação.

## 3. Arquitetura

- **[FATO]** Frontend: React 18 + Vite em `frontend/` (app oficial). Deploy: GitHub Pages em https://mlk010173.github.io/skynetchat/ — CI (`.github/workflows/pages.yml`) publica a pasta `site/` (= build do frontend + `.nojekyll` + `404.html`). Router: HashRouter.
- **[FATO]** Backend: Supabase (projeto `rkgwhhtenfozdwzpvxjj`, região São Paulo) — Edge Functions: `chat` (SSE streaming), `conversations`, `models`, `auth-code` (signup/login/recover/newcode/set_recovery_email, minta sessão Supabase real via magic-link server-side; rate limit login 10/h por IP em `auth_attempts`; signup 12/h por IP em `anon_requests`).
- **[FATO]** Agente: `server/agent.mjs` no Render (skynet-agent.onrender.com), **plano free — dorme após 15 min; primeira chamada demora ~30-60s (cold start)**. 11 ferramentas (web_pesquisar, abrir, imagem, memoria, terminal com token, calcular…). Terminal exige `AGENT_TOKEN` (não configurado = recusa).
- **[FATO]** Vercel: existe projeto `skynetchat` (deploy antigo do app Next.js) **atrás de Deployment Protection (SSO) — inacessível publicamente**. Não é o app atual.
- **[FATO]** A antiga app Next.js foi removida do repo (commit a665139); suas páginas de conta/configurações/termos foram portadas ao app Vite em 26/10/2026.

## 4. Banco de dados (Supabase Postgres, RLS ativo)

- **[FATO]** `conversations` (dono ALL), `messages` (dono SELECT; insert via service role no chat), `memories` (pgvector 1536d, RPC match_memories), `notifications` (SELECT/UPDATE próprio; insert via trigger), `user_settings` (próprio), `auth_codes` (service-role only: user_id, email, code_hash bcrypt, code_lookup HMAC, code_enc, recovery_email), `auth_attempts` + `anon_requests` (rate limits), `agent_memory` (memória do agente via server/).
- **[FATO]** Trigger `trg_on_new_user` (search_path=public): cria user_settings + notificação "Bem-vindo ao SKYNET".

## 5. O que funciona (verificado 26/10/2026)

- **[FATO]** Visitante/anônimo: home, chat com resposta real de IA em streaming (17 modelos configurados), painéis do drawer.
- **[FATO]** Criar conta: gera código, auto-login, sessão persiste em reload.
- **[FATO]** Login por código: válido entra; inválido/429 mostra erro visível na tela.
- **[FATO]** Sino de notificações: badge, painel com boas-vindas, marcar como lida, realtime.
- **[FATO]** Histórico de conversas com busca; conta ativa no drawer; páginas /account (email de recuperação real), /settings (persiste no servidor), /terms.
- **[FATO]** Agente Render: ferramentas testadas (web_pesquisar devolve resultados reais; MCP tools/list = 11).

## 6. Pendências conhecidas (honestas)

- **[PARCIAL]** Recuperação: o email de recuperação é salvo/consultado, mas o **envio de email exige SMTP/API** ainda não configurada.
- **[PARCIAL]** Ferramentas do agente (Render) NÃO integradas ao chat: o chat não chama web_pesquisar/terminal — integração é o próximo passo grande.
- **[PLANO]** Itens do drawer não construídos (Imagens BETA, Grupos, Codex, Projetos, Indique, Monetize) — mostram estado honesto.
- **[PLANO]** Tema por conta no banco (user_settings.theme) gravado; falta reabrir sessão aplicando-o antes do localStorage.

## 7. Decisões técnicas (motivos)

- Auth por código: modelo do produto original; sessão é Supabase real (magic link mintado server-side) → RLS/realtime funcionam sem duplicar auth.
- Deploy por pasta `site/` via workflow: o token local não tem escopo `workflow`; o CI publica o que está em `site/`.
- `.nojekyll` obrigatório: sem ele o Jekyll apaga `_next`/assets.
- Espelho estático do site real foi testado e **falha por design** (JS chama backend do domínio original).

## 8. Incidentes e lições

- Jekyll do Pages apagava `_next` → `.nojekyll` + postbuild (26/10).
- Trigger de signup 500 → `search_path=public` (26/10).
- Outra sessão deployou espelho Svelte morto sobre o app → restaurado via `site/` (26/10).
- Rate limit "quebrava o login" nos testes → na real era proteção funcionando; agora a mensagem de 429 aparece na tela.

## 9. Como verificar (protocolo)

- Suíte: `cd frontend && node tests/audit.mjs` (fluxo visitante→signup→login→chat→notificações) e `node tests/final.mjs`.
- Backend: `curl .../functions/v1/models` (ok/ai_configured), signup/login via `/functions/v1/auth-code`.
- CI: Actions do repo `pages` deve terminar `success`; site deve responder 200.
