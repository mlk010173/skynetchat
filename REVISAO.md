# REVISAO.md — Prompt de Revisão Completa do SKYNETchat

> Prompt reutilizável de manutenção. Copie o bloco abaixo para o agente responsável
> (ou rode `node tests/anon.mjs` dentro de `frontend/` para a parte automática).

## O PROMPT

```
Faça uma revisão completa do site SKYNETchat (https://mlk010173.github.io/skynetchat/)
na perspectiva de um usuário anônimo novo, sem estado salvo, em janela anônima,
celular 390x844 e desktop. Backend: Supabase (Edge Functions) + server/ (agente).

REGRAS DE OURO
- Nada de simulação: todo botão faz algo real ou mostra estado honesto ("em breve").
- Autenticação é SÓ por código de 12 dígitos (criar conta gera o código, entrar usa o código).
  Se existir qualquer lugar pedindo e-mail + senha para ENTRAR, é bug: remover e unificar
  com "criar conta" ou "entrar" por código. E-mail só existe em RECUPERAÇÃO (receber o código).

FLUXO OBRIGATÓRIO (testar na ordem, anotando cada erro de console)
1. Home anônima: hero, chips, dock. Console limpo? Console: F12 → console + network.
2. Drawer: abre pelo ☰, fecha pelo X E clicando fora (scrim). Os dois têm que funcionar.
3. Painéis: Atualizações, Prompts, Suporte, Conheça — abrem e têm "Voltar ao menu".
4. Chips (Pesquisar/Gerar Imagens/Persuasão/Programar): preenchem o composer ou agem.
5. Chat anônimo: enviar mensagem → resposta em streaming com efeito de digitação.
   Sem resposta, resposta vazia ou erro silencioso = bug.
6. Voz (mic): dita em pt-BR e preenche o campo (se o navegador suportar).
7. Criar conta: gerar código → código de 12 dígitos exibido UMA vez → entra logado.
8. Logado: histórico carrega conversas reais; sair volta ao anônimo.
9. Entrar de novo com o mesmo código → sessão restaurada, histórico sincronizado.
10. Recuperação: e-mail → estado honesto (envio de e-mail depende de SMTP configurado).

BACKEND (verificar por HTTP, com apikey anon)
- GET  /functions/v1/models → ok:true, ai_configured:true, lista de modelos.
- POST /functions/v1/auth-code {action:"signup"} → ok:true + código + sessão real (access_token).
- POST /functions/v1/auth-code {action:"login", code} → sessão real; código errado → 401.
- POST /functions/v1/chat (com Bearer da sessão) → stream SSE de verdade.
- GET  /functions/v1/conversations (Bearer) → conversas do usuário (RLS: só as dele).
- server/agent.mjs (Render): /health 200; /tools protegido por AGENT_TOKEN.

CRITÉRIOS DE BUG (classifique cada um)
- BLOQUEANTE: impede o fluxo (não fecha, não entra, não responde).
- VISUAL: diferente do original skynetchat.net (cores, textos, posições, alinhamento).
- HONESTIDADE: botão que simula função inexistente ou promete o que não faz.
- SEGURANÇA: endpoint sem rate limit, segredo exposto, RLS faltando.

ENTREGA
Lista única com: nº, área (frontend/backend), gravidade, como reproduzir,
comportamento esperado, estado (corrigido / pendente). Ao final: resumo de 3 linhas.
```

## Comandos da parte automática

```bash
cd frontend
npx vitest run            # testes unitários (CI também roda)
npm run anon              # teste E2E de pessoa anônima no site publicado
```

## Bugs conhecidos e pendências (registro vivo)

| # | Área | Gravidade | Descrição | Estado |
|---|------|-----------|-----------|--------|
| 1 | backend | média | Envio de e-mail na recuperação aguarda SMTP/API (estado honesto na UI) | pendente |
| 2 | frontend | média | Sino de notificações não existe no app novo (tabela notifications ativa, sem UI) | pendente |
| 3 | frontend | baixa | user_settings (tema por conta) não usado; tema é só localStorage | pendente |
| 4 | backend | baixa | auth-code sem rate limit por IP (tentativas de código ilimitadas; espaço 10^12 + bcrypt mitiga) | pendente |
| 5 | frontend | baixa | Página de conta/perfil (ver e-mail, membro desde, sair de todos os dispositivos) não existe no app novo | pendente |

> Corrigiu algo? Marque "corrigido" com o hash do commit. Achou novo? Adicione na tabela.
