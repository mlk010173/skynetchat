# AGENTS.md — acessos, caminhos e contrato de integração

> Este arquivo é a porta de entrada para qualquer agente que trabalhe neste repositório.
> Leia antes de mexer em qualquer coisa.

## 1. Permissões (acesso total)
| Agente | Leitura | Escrita (commit/push/PR) | Observação |
|---|---|---|---|
| Dono do repo (mlk010173) | sim | **sim** | autoridade final |
| Superagent Base44 (agente principal) | sim | **sim** | mantém o ecossistema |
| ChatGPT / OpenAI (conector GitHub) | sim | **sim** | acesso total concedido pelo dono |
| Copilot / outros agentes | sim | **sim** | mesmo contrato abaixo |

Todo agente com escrita deve: rodar os testes antes do push, não quebrar contrato de rota abaixo, e nunca commitar segredo.

## 2. Mapa de caminhos (onde está cada coisa)
```
site/                     frontend publicável (build Vite: index.html + assets/)
site/index.html           app real (SPA) — é o que a Vercel e o Pages servem
supabase/functions/chat/          edge function do chat (streaming SSE + memória + fallback de modelo)
supabase/functions/models/        catálogo de modelos da conta NVIDIA
supabase/functions/conversations/ histórico de conversas
supabase/functions/auth-code/     login/cadastro por código de 12 dígitos
supabase/functions/imagem/        geração de imagem (flux)
supabase/schema.sql               schema do banco (RLS, pgvector, tsvector)
server/agent.mjs                  agente Node do Render (ferramentas)
tests/agent.test.mjs              testes do servidor (node --test)
frontend/                         app Vite antigo (referência, fora do ar)
vercel.json                       rewrite SPA + outputDirectory site/
.github/workflows/                CI/CD do GitHub Pages
```

## 3. Rotas e endpoints (contrato — não renomear sem atualizar este arquivo)
### Supabase (base: https://rkgwhhtenfozdwzpvxjj.supabase.co)
| Rota | Método | Uso |
|---|---|---|
| `/functions/v1/chat` | POST | chat streaming (SSE). Corpo: `{content, model, conversation_id}`. Sem JWT = modo anônimo (limite por IP). |
| `/functions/v1/models` | GET | catálogo de modelos |
| `/functions/v1/conversations` | GET/POST | listar/criar conversas |
| `/functions/v1/auth-code` | POST | `{action: signup\|login\|recover\|newcode}` — devolve `code` + `session` |
| `/functions/v1/imagem` | POST | `{prompt, aspect_ratio, modelo}` |
| `/rest/v1/<tabela>` | CRUD | PostgREST com RLS (anon key respeita RLS; service_role ignora) |

Tabelas: `conversations`, `messages` (embedding vector 2048), `auth_codes`, `notifications`, `user_settings`, `anon_requests`, `agent_memory`.

### Render — agente (`https://skynet-agent.onrender.com`)
| Rota | Método | Uso |
|---|---|---|
| `/health` | GET | `{ok, servico, versao, ferramentas}` |
| `/tools` | GET | catálogo das 11 ferramentas |
| `/mcp` | POST | JSON-RPC (`tools/list`, `tools/call`, `ping`) |
| `/tools/web_pesquisar` | POST | `{consulta}` — Google News + Bing + Wikipedia |
| `/tools/abrir` | POST | `{url}` — https only, anti-SSRF |
| `/tools/imagem` | POST | `{prompt}` |
| `/tools/terminal` | POST | `{cmd}` — exige `Authorization: Bearer $AGENT_TOKEN` (401 sem) |
| `/tools/memoria_salvar` `/tools/memoria_buscar` | POST | memória de longo prazo (usa Supabase) |
| `/tools/calcular` `/tools/moeda` `/tools/clima` `/tools/hora` `/tools/perguntar` | POST/GET | dia a dia + cérebro de IA (perguntar chama a função chat) |

### Frontend (Vercel e Pages)
Rotas SPA: `/`, `/login`, `/sign-up`, `/chat`, `/voz`, `/monetize`, `/termos`. Rewrite catch-all para `index.html`.

## 4. Contrato de comunicação (tudo tem que conversar)
```
Navegador → site/ (Vercel / Pages)
              ↓ fetch direto
         Supabase (edge functions + Postgres + Auth)
              ↓ chamada interna
         chat → NVIDIA NIM (modelos) e embeddings

Render (agente) → Supabase (memória, imagens) → internet (pesquisa, páginas)
Render (agente) → chat (endpoint /tools/perguntar = raciocínio)
```
Regras do contrato:
1. **O frontend NUNCA fala com o Render direto para chat.** Chat é sempre `functions/v1/chat`.
2. **O Render nunca guarda estado próprio**: memória e dados vivem no Supabase.
3. **CORS**: funções e agente liberam `*`; endpoints com token exigem header explícito.
4. **Segredo só em variável de ambiente**, nunca no código nem no repo.

## 5. Variáveis de ambiente (nomes — valores nunca no repo)
- Supabase (edge functions): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SKYNET_MODELS`, `OPENAI_API_KEY` (chave NVIDIA), `AUTH_CODE_PEPPER`.
- Render (agente): `PORT`, `AGENT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Frontend: URL + anon key já embutidas no build em `site/assets/`.

## 6. Deploy (push na `main` publica tudo)
| Alvo | Gatilho | URL |
|---|---|---|
| Vercel | push na `main` | https://skynetchat-xi.vercel.app |
| GitHub Pages | GitHub Actions (`pages.yml`) | https://mlk010173.github.io/skynetchat/ |
| Supabase functions | `npx supabase functions deploy <nome> --project-ref rkgwhhtenfozdwzpvxjj --no-verify-jwt` | — |
| Render | push na `main` (auto-deploy) | https://skynet-agent.onrender.com |

## 7. Antes de dar push
```bash
node --test tests/agent.test.mjs     # servidor (esperado: 9 passer)
cd frontend && npm test              # frontend (esperado: 14 passer)
curl -s https://skynet-agent.onrender.com/health   # versão e nº de ferramentas
```

## 8. Proibido
- Commitar chave, token ou senha (usar variável de ambiente no painel).
- Renomear rota/endpoint sem atualizar a seção 3 deste arquivo.
- Fazer push de código que não passa nos testes.
- Apagar `supabase/functions/*` sem substituir a rota correspondente.
