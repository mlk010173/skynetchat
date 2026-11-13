-- ============================================================================
-- SKYNET · MEMÓRIA INTELIGENTE (2026-11-15)
-- ----------------------------------------------------------------------------
-- O que esta migration faz:
--   1) liga pgvector no schema `extensions` (o mesmo já usado por messages.embedding);
--   2) cria `public.memoria_itens` — item de memória por usuário, com embedding
--      opcional, deduplicação por hash e busca híbrida (texto + vetor);
--   3) cria `public.memoria_resumos` — resumo por conversa (fallback sem LLM);
--   4) cria `public.memoria_config` — interruptor da memória e projetos liberados;
--   5) cria `public.memoria_log` — auditoria do que foi criado/alterado/apagado;
--   6) liga RLS em tudo com política `auth.uid() = user_id`;
--   7) cria a função `public.buscar_memorias(...)` de recuperação híbrida.
--
-- O que ela NÃO faz (de propósito):
--   • não mexe em acc_memory (memória por conta do login por código) nem em
--     agent_memory (rascunho automático do chat) — as duas continuam valendo;
--   • não cria trigger de embedding: quem gera vetor é a edge function
--     `memorias`, com a chave do provedor. Sem chave, o item entra sem embedding
--     e a busca cai para full-text (modo 'texto'), sem inventar vetor.
--
-- Idempotente: pode rodar duas vezes no mesmo banco sem erro.
-- ============================================================================

-- ---------------------------------------------------------------- extensão --
-- pgvector no schema `extensions` é o padrão do Supabase (e é onde
-- messages.embedding já mora). `vector(1536)` só existe depois disto.
create schema if not exists extensions;
create extension if not exists vector with schema extensions;

-- ================================================================ ITENS ====
-- Um item de memória é uma afirmação curta e durável sobre o usuário.
-- A mesma frase não entra duas vezes: `hash_conteudo` (SHA-256 do texto
-- normalizado) + unique(user_id, hash_conteudo) transformam repetição em UPDATE.
create table if not exists public.memoria_itens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- separação lógica: um dia pode existir mais de um workspace/agente por conta
  workspace text not null default 'pessoal',
  agente text not null default 'principal',
  -- projeto é texto livre (o nome que o usuário usa), não FK: projeto é etiqueta
  projeto text,
  tipo text not null default 'fato'
    check (tipo in ('preferencia', 'projeto', 'objetivo', 'decisao', 'configuracao', 'instrucao', 'fato', 'tarefa')),
  conteudo text not null,
  resumo text,
  hash_conteudo text not null,
  -- nulo até (e se) a edge function conseguir gerar o vetor. NUNCA preenchido à mão.
  embedding extensions.vector(1536),
  importancia smallint not null default 3 check (importancia between 1 and 5),
  -- item marcado como sensível existe só para auditoria: a busca sempre o ignora
  sensivel boolean not null default false,
  -- exclusão lógica (o painel oferece hard delete; isto é rede de segurança)
  ativo boolean not null default true,
  origem_conversa uuid,
  -- item que este substitui (correção de preferência, decisão revista…)
  substitui uuid references public.memoria_itens (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  ultimo_uso_em timestamptz,
  usos integer not null default 0
);

-- Deduplicação: um mesmo texto normalizado, uma linha por usuário.
create unique index if not exists memoria_itens_user_hash_uniq
  on public.memoria_itens (user_id, hash_conteudo);

-- Cobertura para "minhas memórias deste projeto", que é a consulta do painel.
create index if not exists memoria_itens_user_projeto_idx
  on public.memoria_itens (user_id, projeto);

create index if not exists memoria_itens_user_ativo_idx
  on public.memoria_itens (user_id, ativo, atualizado_em desc);

create index if not exists memoria_itens_user_tipo_idx
  on public.memoria_itens (user_id, tipo);

-- Full-text em português (o mesmo regconfig de messages.search_text).
-- Índice de expressão: a consulta precisa usar exatamente to_tsvector('portuguese', conteudo).
create index if not exists memoria_itens_busca_idx
  on public.memoria_itens using gin (to_tsvector('portuguese', conteudo));

-- Vetor: HNSW é o preferido (melhor recall sem treino). Em pgvector antigo
-- (< 0.5) HNSW não existe; o bloco cai para ivfflat em vez de falhar a migration.
do $$
begin
  begin
    execute 'create index if not exists memoria_itens_embedding_hnsw
               on public.memoria_itens using hnsw (embedding extensions.vector_cosine_ops)';
  exception
    when undefined_object or feature_not_supported or invalid_parameter_value then
      execute 'create index if not exists memoria_itens_embedding_ivfflat
                 on public.memoria_itens using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 100)';
  end;
end $$;

-- Constraints que podem faltar se a tabela já existisse de uma versão anterior
-- (create table if not exists não acrescenta coluna/constraint em tabela existente).
do $$
begin
  alter table public.memoria_itens
    add constraint memoria_itens_tipo_check
    check (tipo in ('preferencia', 'projeto', 'objetivo', 'decisao', 'configuracao', 'instrucao', 'fato', 'tarefa'));
exception
  when duplicate_object then null;
  when duplicate_table then null;
end $$;

do $$
begin
  alter table public.memoria_itens
    add constraint memoria_itens_importancia_check check (importancia between 1 and 5);
exception
  when duplicate_object then null;
  when duplicate_table then null;
end $$;

-- ============================================================== RESUMOS ====
-- Resumo por conversa. Serve para não reler 200 mensagens a cada pergunta:
-- `mensagens_cobertas` diz até onde o resumo já chegou.
create table if not exists public.memoria_resumos (
  conversa_id uuid primary key references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  resumo text not null,
  topicos text[] not null default '{}'::text[],
  mensagens_cobertas integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists memoria_resumos_user_idx
  on public.memoria_resumos (user_id, atualizado_em desc);

-- =============================================================== CONFIG ====
-- Uma linha por usuário. Sem linha = memória ativa (comportamento padrão).
create table if not exists public.memoria_config (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ativa boolean not null default true,
  -- vazio = todos os projetos podem ser lembrados
  projetos_permitidos text[] not null default '{}'::text[],
  -- nulo = sem expiração automática
  retencao_dias integer,
  atualizado_em timestamptz not null default now()
);

-- ================================================================= LOG ====
-- Auditoria mínima: quem fez o quê. `detalhe` nunca contém conteúdo sensível
-- (a edge function manda o texto mascarado). Sem update/delete por política:
-- o log do usuário é imutável (some junto quando a conta é apagada, via cascade).
create table if not exists public.memoria_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  acao text not null,
  item_id uuid,
  agente text,
  detalhe jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists memoria_log_user_idx
  on public.memoria_log (user_id, criado_em desc);

-- ------------------------------------------------------- atualizado_em ----
-- Um único trigger para as tabelas que têm a coluna. A função é separada
-- (memoria_tocar) para não colidir com eventual trigger genérico do projeto.
create or replace function public.memoria_tocar()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists memoria_itens_tocar on public.memoria_itens;
create trigger memoria_itens_tocar
  before update on public.memoria_itens
  for each row execute function public.memoria_tocar();

drop trigger if exists memoria_resumos_tocar on public.memoria_resumos;
create trigger memoria_resumos_tocar
  before update on public.memoria_resumos
  for each row execute function public.memoria_tocar();

drop trigger if exists memoria_config_tocar on public.memoria_config;
create trigger memoria_config_tocar
  before update on public.memoria_config
  for each row execute function public.memoria_tocar();

-- ================================================================== RLS ====
-- Todas as tabelas ficam com RLS ligada. A edge function usa service role
-- (ignora RLS de propósito) mas SEMPRE filtra por user_id vindo do JWT; o
-- PostgREST direto do navegador passa por estas políticas.
alter table public.memoria_itens enable row level security;
alter table public.memoria_resumos enable row level security;
alter table public.memoria_config enable row level security;
alter table public.memoria_log enable row level security;

-- anon não tem nada a fazer aqui (nem leitura): tudo é por usuário logado.
revoke all on public.memoria_itens from anon;
revoke all on public.memoria_resumos from anon;
revoke all on public.memoria_config from anon;
revoke all on public.memoria_log from anon;

drop policy if exists memoria_itens_select_own on public.memoria_itens;
create policy memoria_itens_select_own on public.memoria_itens
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists memoria_itens_insert_own on public.memoria_itens;
create policy memoria_itens_insert_own on public.memoria_itens
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists memoria_itens_update_own on public.memoria_itens;
create policy memoria_itens_update_own on public.memoria_itens
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists memoria_itens_delete_own on public.memoria_itens;
create policy memoria_itens_delete_own on public.memoria_itens
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists memoria_resumos_select_own on public.memoria_resumos;
create policy memoria_resumos_select_own on public.memoria_resumos
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists memoria_resumos_insert_own on public.memoria_resumos;
create policy memoria_resumos_insert_own on public.memoria_resumos
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists memoria_resumos_update_own on public.memoria_resumos;
create policy memoria_resumos_update_own on public.memoria_resumos
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists memoria_resumos_delete_own on public.memoria_resumos;
create policy memoria_resumos_delete_own on public.memoria_resumos
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists memoria_config_select_own on public.memoria_config;
create policy memoria_config_select_own on public.memoria_config
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists memoria_config_insert_own on public.memoria_config;
create policy memoria_config_insert_own on public.memoria_config
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists memoria_config_update_own on public.memoria_config;
create policy memoria_config_update_own on public.memoria_config
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists memoria_config_delete_own on public.memoria_config;
create policy memoria_config_delete_own on public.memoria_config
  for delete to authenticated using (auth.uid() = user_id);

-- log: o usuário lê e insere o próprio registro; não edita nem apaga o histórico.
drop policy if exists memoria_log_select_own on public.memoria_log;
create policy memoria_log_select_own on public.memoria_log
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists memoria_log_insert_own on public.memoria_log;
create policy memoria_log_insert_own on public.memoria_log
  for insert to authenticated with check (auth.uid() = user_id);

-- ========================================================= BUSCA HÍBRIDA ==
-- score = 0.6 * similaridade de cosseno (só quando há embedding dos dois lados)
--       + 0.3 * ts_rank_cd em português (full-text)
--       + 0.1 * (0.6 * recência + 0.4 * importância)
--
-- Regras de segurança:
--   • SECURITY INVOKER: roda com os privilégios de quem chamou (RLS vale);
--   • além do p_user, a cláusula `auth.uid() is null or m.user_id = auth.uid()`
--     impede que um usuário logado peça a memória de outro passando outro uuid
--     (com service role — a edge function — auth.uid() é nulo e a checagem é neutra);
--   • só ativo = true e sensivel = false: segredo nunca entra no prompt.
--
-- Quando p_embedding é nulo (sem chave de embedding), a parcela vetorial vira 0
-- e a ordenação passa a depender do full-text: é o "modo texto" que a edge
-- function informa ao cliente. Nenhum vetor é inventado aqui.
create or replace function public.buscar_memorias(
  p_user uuid,
  p_consulta text,
  p_embedding extensions.vector(1536) default null,
  p_projeto text default null,
  p_limite integer default 10
)
returns table (
  id uuid,
  tipo text,
  conteudo text,
  projeto text,
  score real
)
language sql
stable
security invoker
set search_path = public, extensions, pg_catalog
as $$
  with consulta as (
    select
      nullif(btrim(coalesce(p_consulta, '')), '') as texto,
      -- websearch_to_tsquery nunca levanta erro com entrada livre (ao contrário de to_tsquery)
      case
        when nullif(btrim(coalesce(p_consulta, '')), '') is null then null
        else websearch_to_tsquery('portuguese', left(btrim(p_consulta), 400))
      end as tsq
  ),
  pontuado as (
    select
      m.id,
      m.tipo,
      m.conteudo,
      m.projeto,
      case
        when p_embedding is not null and m.embedding is not null
          then (1 - (m.embedding <=> p_embedding))::real
        else 0::real
      end as sim_vetor,
      case
        when c.tsq is null or c.tsq::text = '' then 0::real
        else least(
          ts_rank_cd(to_tsvector('portuguese', coalesce(m.conteudo, '')), c.tsq)::real,
          1::real
        )
      end as rank_texto,
      -- recência: 1.0 hoje, ~0.37 depois de 30 dias (decaimento exponencial)
      exp(
        -greatest(
          extract(epoch from (now() - coalesce(m.ultimo_uso_em, m.atualizado_em, m.criado_em))) / 86400.0,
          0
        ) / 30.0
      )::real as recencia,
      (m.importancia::real / 5.0) as peso_importancia
    from public.memoria_itens m
    cross join consulta c
    where m.user_id = p_user
      and m.ativo = true
      and m.sensivel = false
      and (p_projeto is null or btrim(p_projeto) = '' or m.projeto = btrim(p_projeto))
      and (auth.uid() is null or m.user_id = auth.uid())
  )
  select
    p.id,
    p.tipo,
    p.conteudo,
    p.projeto,
    (
      0.6 * p.sim_vetor
      + 0.3 * p.rank_texto
      + 0.1 * (0.6 * p.recencia + 0.4 * p.peso_importancia)
    )::real as score
  from pontuado p
  order by score desc, p.id
  limit greatest(1, least(coalesce(p_limite, 10), 50));
$$;

comment on function public.buscar_memorias(uuid, text, extensions.vector, text, integer) is
  'Recuperação híbrida de memórias: 0.6 cosseno + 0.3 ts_rank_cd(pt) + 0.1 recência/importância. Filtra ativo e não sensível.';

revoke all on function public.buscar_memorias(uuid, text, extensions.vector, text, integer) from public, anon;
grant execute on function public.buscar_memorias(uuid, text, extensions.vector, text, integer) to authenticated, service_role;

-- ============================================================ COMENTÁRIOS ==
comment on table public.memoria_itens is
  'Item de memória durável por usuário (preferência, projeto, decisão…). Deduplicado por hash_conteudo.';
comment on column public.memoria_itens.embedding is
  'Vetor de 1536 dims gerado pela edge function memorias. Nulo = item só pesquisável por texto.';
comment on column public.memoria_itens.sensivel is
  'Marcado pela detecção de segredos (senha, token, CPF, cartão). Nunca entra no prompt.';
comment on table public.memoria_resumos is
  'Resumo por conversa (extrativo quando não há LLM) para não reler o histórico inteiro.';
comment on table public.memoria_config is
  'Interruptor da memória, projetos liberados e retenção. Ausência de linha = memória ativa.';
comment on table public.memoria_log is
  'Auditoria de criar/editar/excluir/exportar/esquecer. Insert-only para o usuário.';
