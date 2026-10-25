# CELEBRO.md — Protocolo de Raciocínio Profundo do Agente SKYNET

Este é o "cérebro" do agente: como pensar antes de agir, como diagnosticar sem
chutar, e como aprender com os bugs já resolvidos. Aplique em toda tarefa não-trivial.

---

## 1. MODO PROFUNDO: O CICLO OODA-LUCIDE

Para cada tarefa complexa, execute as 4 fases **na ordem**, e só avance quando a
atual estiver realmente concluída:

### Fase 1 — OBSERVAR (entender antes de tocar)
- Reler o `AGENT.md` (§ arquitetura e regras) e os arquivos envolvidos.
- Perguntar: **qual é o resultado que o usuário quer?** (não o passo que ele descreveu).
- Listar o que é fato verificado vs. suposição. Suposição não vira commit.

### Fase 2 — ORIENTAR (hipóteses ranqueadas)
- Gerar ≥2 hipóteses plausíveis para o problema/abordagem.
- Ranquear por: probabilidade × custo de testar. A mais barata de falsificar vai primeiro.
- **Anti-padrão**: adotar a primeira hipótese porque "faz sentido".

### Fase 3 — DECIDIR (plano mínimo verificável)
- Escolher o menor experimento que distingue as hipóteses (um `curl`, um log, um teste).
- Definir ANTES o critério de sucesso: "funciona se X responder Y".
- Mudanças reversíveis e isoladas: um commit = uma intenção.

### Fase 4 — AGIR (executar + verificar em loop)
- Executar, medir, comparar com o critério. Falhou → volta à Fase 2 com a evidência nova.
- **Nunca reportar sucesso baseado no sucesso da ferramenta** (build OK ≠ site OK).
  Verdade = verificação na produção (ver AGENT.md §6).

## 2. DIAGNÓSTICO DE CAUSA RAÍZ (não de sintoma)

Ao encontrar um bug, desça a cadeia causal até a causa física/última:

```
Sintoma (o que se vê)
  └─ Comportamento imediato (o que o navegador/SQL fez)
       └─ Mecanismo (por que fez isso)
            └─ CAUSA RAÍZ (configuração/premissa errada)  ← corrija AQUI
```

Perguntas-chave:
1. **O que mudou entre "funcionava" e "quebrou"?** (git diff, timestamp, deploy)
2. **Em qual camada mora o bug?** rede → asset → hidratação → lógica → API → banco → policy.
3. **Por que o mesmo código funciona em outro ambiente?** (diferença de contexto:
   search_path, basePath, cache, Jekyll, perfil do navegador).

## 3. CASOS REAIS ARQUIVADOS (aprendizados institucionais)

### Caso 1 — "O HTML carrega mas nada funciona" (chunk 404)
- **Sintoma**: página renderiza, botões fazem submit nativo GET (`/login/?`), sem React.
- **Causa raíz**: GitHub Pages roda Jekyll; sem `.nojekyll`, pastas com `_`
  (`_next`) são descartadas do build → chunks 404 → hidratação nunca ocorre.
- **Lição**: sintoma de "app morto" em GitHub Pages = **sempre `curl` num chunk primeiro**.

### Caso 2 — Erro 500 no signup ("Database error saving new user")
- **Sintoma**: signup quebra; insert direto no SQL editor funciona.
- **Causa raíz**: trigger AFTER INSERT em `auth.users` usava tabelas sem qualificar
  schema. A sessão do GoTrue tem `search_path` restrito → tabela não resolvida → 500.
- **Lição**: **toda** função `security definer` de trigger: `set search_path = public`
  e `public.tabela` qualificado. Testar signup real (não só insert manual).

### Caso 3 — URL `/skynetchat/skynetchat/`
- **Sintoma**: 404 ao clicar em links internos após o deploy.
- **Causa raíz**: `<Link href={BASE + "/"}>` — o Next aplica `basePath`
  automaticamente em `next/link` e `router.*`; o prefixo manual duplicou.
- **Lição**: prefixo manual (`BASE`) **só** em `<a>` e `location.*`.

### Caso 4 — Automação de navegador "sabota" formulários
- **Sintoma**: o robô limpa os campos de senha sozinho.
- **Causa raíz**: overlay do gerenciador de senhas (1Password) intercepta `input[type=password]`.
- **Lição**: em E2E automático, preferir login via API + verificação de UI sem digitação;
  ou desativar extensões do perfil de teste.

## 4. ANTI-PADRÕES PROIBIDOS

- ❌ Concluir por aparência ("a página abriu = funciona").
- ❌ Corrigir sintoma (colar `try/catch` silencioso) sem achar a causa.
- ❌ Reescrever arquitetura quando um diff de 3 linhas resolve.
- ❌ Testar só o caminho feliz (sempre: erro, vazio, permissão negada).
- ❌ Deixar credencial, mesmo anon key de serviço, em log ou commit.
- ❌ Dizer "deve funcionar" — ou funciona (verificado) ou está pendente (dito claramente).

## 5. ROTEIRO DE DECISÃO RÁPIDO

```
A tarefa envia dados reais?          → Supabase (RLS + policy). Nunca localStorage como "banco".
É conteúdo institucional estático?    → Deixa estático. Não inventar API.
Precisa rodar no cliente?            → Edge Function; chave NUNCA no bundle.
O usuário não logou?                  → Modo anônimo com expiração (pg_cron já faz).
Algo quebrou em produção?            → 1) curl no chunk  2) Network/Console  3) SQL  4) logs.
```

## 6. APRENDIZADO CONTÍNUO

Todo bug novo resolvido entra aqui como "Caso N" com: sintoma, causa raíz, lição.
O `CELEBRO.md` é memória viva do projeto — atualizá-lo faz parte da correção.
