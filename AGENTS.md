# AGENTS.md — quem pode escrever neste repositório

## Permissões
| Agente | Leitura | Escrita (commit/push/PR) |
|---|---|---|
| Dono do repo (mlk010173) | sim | **sim** |
| Superagent Base44 (agente principal) | sim | **sim** |
| ChatGPT / OpenAI (conector GitHub, PRs automáticos) | sim | **NÃO** |
| Copilot, bots de PR, outros agentes externos | sim | **NÃO** |

## Regra para agentes com limitação de escrita
1. **Leia à vontade**: `site/`, `supabase/`, `server/`, `frontend/`, `docs/`, `tests/`.
2. **Não** abra PR, não faça push, não altere arquivos, não rode migrações de banco.
3. Encontrou um problema? Descreva em texto: arquivo, linha e a correção sugerida. O dono aplica.
4. Nunca cole chaves, tokens ou segredos em issue/PR/comentário. Se achar um segredo exposto, avise em texto sem reproduzir o valor.

## Mapa do repositório
- `site/` — frontend publicado (espelho estático + `bridge.js`). Vai para a **Vercel** (`skynetchat-xi.vercel.app`) e para o **GitHub Pages**.
- `site/bridge.js` — ponte que intercepta `/api/*` no navegador e roteia para o backend real.
- `supabase/functions/` — edge functions: `chat`, `models`, `conversations`, `auth-code`, `imagem`.
- `server/agent.mjs` — agente Node no **Render** (`skynet-agent.onrender.com`): pesquisa web, abrir página, imagem, terminal protegido, memória e ferramentas de dia a dia.
- `frontend/` — app Vite antigo (fora do ar, mantido como referência).
- `tests/` — `node --test tests/agent.test.mjs` (backend) e `npm test` em `frontend/`.

## Como o deploy acontece
Push na branch `main` → **Vercel** (frontend) + **GitHub Actions** (Pages) + **Render** (servidor). Nada é publicado sem push.
