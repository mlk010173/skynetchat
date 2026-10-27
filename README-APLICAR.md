# SKYNETchat — pacote de melhorias e expansão

Este pacote foi preparado para `mlk010173/skynetchat` depois de leitura do repositório e auditoria read-only da interface pública em 26/10/2026. Ele **não foi enviado ao GitHub nem implantado**: o conector GitHub devolveu `403 Resource not accessible by integration` ao criar uma branch. Não contém tokens nem secrets.

## Conteúdo

- `scripts/apply-hardening.mjs`: correções para `server/agent.mjs`, `supabase/functions/auth-code/index.ts` e `frontend/src/lib.js`.
- `scripts/apply-image-rate-limit.mjs`: hardening da Edge Function de imagem.
- `supabase/migrations/20261026170000_image_rate_limit.sql`: tabela privada para limite persistente de imagens.
- `frontend/src/components/ConnectorExplorer.jsx` e `.css`: componente de exploração pesquisável e responsivo.
- `frontend/src/data/connectors.json` e `integrations/registry.json`: catálogo declarativo com centenas de serviços. Todos são marcados `catalog_only` deliberadamente.
- `tests/agent-security.test.mjs`: testes de URL, calculadora e whitelist do terminal depois de aplicar o hardening.
- `docs/AUDITORIA-E-ROADMAP.md`, `docs/CONNECTORS.md` e `docs/OPERACAO-SEGURA.md`: achados, limitações e próximos passos.

## Aplicar as correções locais (recomendado: branch nova)

1. Faça um clone do repositório ou baixe um ZIP do GitHub e crie uma branch, por exemplo `security/skynet-hardening`.
2. Copie esta pasta para dentro do repositório clonado ou extraia o ZIP ao lado dele.
3. Em primeiro lugar, **simule** as alterações:

   ```bash
   node /caminho/skynet-expansion-pack/scripts/apply-hardening.mjs /caminho/para/skynetchat
   node /caminho/skynet-expansion-pack/scripts/apply-image-rate-limit.mjs /caminho/para/skynetchat
   ```

   Os scripts são dry-run por padrão e abortam antes de gravar se os trechos da versão atual não corresponderem exatamente.
4. Leia os resumos. Depois aplique:

   ```bash
   node /caminho/skynet-expansion-pack/scripts/apply-hardening.mjs /caminho/para/skynetchat --apply
   node /caminho/skynet-expansion-pack/scripts/apply-image-rate-limit.mjs /caminho/para/skynetchat --apply
   ```

   Cada script cria uma pasta de backup `.skynet-backup-*` antes de salvar. Se algum trecho mudou no repositório desde a auditoria, **não force a substituição**: adapte o patch para a versão atual.
5. Aplique a migration `supabase/migrations/20261026170000_image_rate_limit.sql` no projeto Supabase correto antes de publicar a alteração da função `imagem`. Ela bloqueia acesso direto às linhas para `anon` e `authenticated`; a Edge Function usa `service_role` no backend.
6. Rode os testes e a verificação de sintaxe conforme `docs/OPERACAO-SEGURA.md`.
7. Faça commit na branch, revise o diff e abra um Pull Request. Não publique diretamente em `main` sem revisar.

## Conector de interface

Copie `frontend/src/components/ConnectorExplorer.jsx`, `frontend/src/components/ConnectorExplorer.css` e `frontend/src/data/connectors.json` para os mesmos caminhos no clone alvo. Copie também `integrations/registry.json` para a raiz do projeto.

O componente `ConnectorExplorer` é novo e ainda precisa ser conectado ao seletor/painel “Explorar” existente em `frontend/src/pages/Home.jsx`. Procure o estado/rota que abre a área Explorar e importe o componente ali. Não substitua o arquivo inteiro de Home.jsx por um snippet.

## Limites importantes

- O catálogo de 568 entradas é **catálogo**, não 568 integrações prontas. Uma integração real precisa de adaptador testado, OAuth/API scopes, callbacks, secrets no backend, tratamento de erro e testes de segurança.
- A correção de recuperação desativa `newcode` até que exista comprovação de controle do e-mail. O caminho atual não implementa envio SMTP confiável; não reative `newcode` com a implementação antiga.
- O hardening de DNS/redirect diminui risco de SSRF, mas a resolução DNS e `fetch` usam resoluções separadas no runtime Node. Para proteção forte contra DNS rebinding, o próximo passo é usar um dispatcher HTTP que fixe a conexão ao IP público validado.
- Limite por IP não substitui autenticação e pode ser afetado por proxies. Mantenha limites de gastos e monitoramento no provedor de imagem.
