# Prompt para aplicar o pacote no GitHub via Codex

Cole esta instrução no Codex com o repositório `mlk010173/skynetchat` aberto e anexe/torne disponível o `skynet-expansion-pack.zip`.

---

Trabalhe no repositório `mlk010173/skynetchat`. Você tem autorização para preparar as melhorias, mas preserve a versão de produção até o usuário revisar. Crie uma branch `security/skynet-hardening-20261026` a partir da branch padrão e trabalhe nela; nunca escreva diretamente em `main`.

1. Leia `README-APLICAR.md`, `docs/AUDITORIA-E-ROADMAP.md`, `docs/CONNECTORS.md` e `docs/OPERACAO-SEGURA.md` do pacote.
2. Leia os arquivos reais da branch atual antes de editar. O script usa substituições exatas; se a versão divergiu, aplique a intenção manualmente, não force nem apague a lógica atual.
3. Aplique hardening em `server/agent.mjs`: autentique `/mcp`, mantenha terminal protegido, restrinja memória e `perguntar`, valide URLs e cada redirect antes de buscar o destino. Acrescente testes unitários. Avalie DNS rebinding residual e documente-o.
4. Corrija `supabase/functions/auth-code/index.ts`: não permita que `newcode` emita um novo código/sessão baseado somente no e-mail; não revele se existe conta em `recover`. Não habilite recuperação real até haver e-mail com token de uso único, expiração, limite e verificação de posse.
5. Adicione `apikey: VITE_SUPABASE_ANON_KEY` às chamadas manuais do cliente Supabase em `frontend/src/lib.js`; nunca exponha `service_role`, `AGENT_TOKEN`, chaves de provedor ou tokens de OAuth no bundle.
6. Aplique a migration da tabela privada `image_requests` e da função SQL atômica `consume_image_quota`; altere `supabase/functions/imagem/index.ts` para consumir quota, validar proporção e ter timeout. Verifique RLS/grants e cron cleanup. Não publique migration/Edge Function sem confirmar o projeto de destino.
7. Copie `ConnectorExplorer.jsx`, CSS, JSON e registro canônico. Conecte o componente à área “Explorar” existente depois de inspecionar a navegação atual, respeitando estilo e funcionamento do app. Não substitua `Home.jsx` inteiro.
8. Preserve o estado `catalog_only` das 568 entradas. Não marque qualquer conector como ativo sem adaptador real, documentação conferida, credenciais no backend e testes. Priorize GitHub, Vercel, Render, Supabase, Hugging Face e provedores de IA usados atualmente.
9. Rode `node --check server/agent.mjs`, `node --test tests/agent-security.test.mjs`, os testes existentes relevantes, typecheck/build do frontend e validações SQL possíveis. Corrija falhas; não declare testes como aprovados sem executá-los.
10. Faça revisão do diff de segurança e compatibilidade. Abra um Pull Request em modo draft com achados, arquivos alterados, testes executados, riscos restantes e instruções de rollback. Não faça merge nem deploy de produção. Não peça nem use tokens colados em chat.

Entregue o link do PR e um resumo técnico honesto. Se um segredo, ambiente ou acesso faltar, deixe um TODO específico; não simule integração nem sucesso.
