# Auditoria e roteiro — SKYNETchat

Data da inspeção pública: 26/10/2026 UTC. Repositório consultado: `https://github.com/mlk010173/skynetchat`. URL pública usada na auditoria de interface: `https://mlk010173.github.io/skynetchat/`.

## Achados de prioridade alta

1. **`POST /mcp` sem autenticação no código versionado.** `tools/call` executava ferramentas pelo nome, incluindo terminal e memória, sem verificar `AGENT_TOKEN`. O pacote adiciona validação de bearer antes de processar chamadas MCP; o token precisa existir como secret do Render e nunca deve ser enviado ao browser.
2. **Recuperação de código com possível takeover.** O código de `auth-code` para `newcode` aceitava o e-mail de recuperação, rotacionava o código e devolvia novo código e sessão na própria resposta. O pacote desabilita essa ação até que haja verificação real do e-mail e torna a resposta de `recover` uniforme para evitar enumeração de contas.
3. **SSRF por redirecionamento.** `abrirPagina` usava `redirect: "follow"` e só examinava a URL final depois do fetch. A requisição redirecionada já poderia ter ocorrido antes da validação. O pacote passa a seguir os redirects manualmente e validar o destino antes de cada salto, além de consultar DNS e bloquear IPs não públicos.
4. **Memória do agente exposta por rotas públicas.** Os endpoints `memoria_salvar` e `memoria_buscar` aceitavam e-mail arbitrário e usavam chave Supabase privilegiada se definida no Render. O pacote exige o token de agente nessas rotas e as remove do catálogo público. Isso limita o acesso público, mas não substitui uma migração futura para autorização por `auth.uid()` em memória por usuário.
5. **Custo/abuso de imagens.** A Edge Function de imagem estava sem limite persistente próprio. O pacote adiciona quota de 5 gerações por IP/hora e uma tabela privada de contagem. É um primeiro controle, não uma garantia contra múltiplos IPs ou requisições concorrentes.
6. **Chamadas manuais do frontend a Edge Functions sem `apikey`.** O pacote inclui a anon/publishable key nos headers de `api()`, `streamChat()` e `askOnce()`. Essa chave pública não é um segredo; a `service_role` nunca pode ir ao frontend.

## Achados adicionais para a próxima rodada

- Verificar e corrigir todas as rotas do agente com controle de acesso, quotas, logs sem dados sensíveis e CORS configurado para as origens reais. CORS sozinho não é autenticação.
- Separar os fluxos anônimo e autenticado no chat: verificar token via Supabase Auth em operação autenticada; nunca confiar em e-mail ou `user_metadata` enviado no corpo para decidir a propriedade dos dados.
- Migrar `agent_memory` para `user_id UUID` ligado a `auth.users`, definir RLS adequada e remover uso da service role para leituras arbitrárias.
- Rever grants e policies de `messages`, `notifications`, `auth_codes`, `auth_attempts`, `agent_memory`, `anon_requests` e novas tabelas; rodar advisor após migration.
- Rever `.env.production` versionado. A anon key é pública por design, mas o arquivo deve conter apenas variáveis públicas; segredos ficam no painel do provedor.
- Adicionar testes E2E de login, recuperação, chat anônimo, chat autenticado, histórico, autorização de ferramentas, rate-limit e chamadas de imagem. Testes de produção devem usar contas e dados de teste, nunca contas reais.
- A auditoria pública observou seis áreas indisponíveis na navegação: indicação, monetização, imagens na navegação, conversas em grupo, projetos e Codex. As telas públicas de login, cadastro e recuperação carregaram. Não foram submetidos formulários nem mensagens.

## Estado da verificação

Os arquivos foram lidos pelo conector GitHub. A tentativa de criar a branch retornou `403 Resource not accessible by integration`; nenhum commit, alteração em Supabase, secret, deploy ou dado de usuário foi modificado. A auditoria do navegador não enviou código, não criou conta, não enviou mensagem e não fez upload. O script de hardening precisa ser aplicado/testado em uma cópia do repositório antes de publicação.
