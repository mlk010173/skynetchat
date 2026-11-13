-- SKYNET · consumo por mensagem, execuções idempotentes e trilha de atividades.
-- Idempotente: pode rodar mais de uma vez. Escrita só pelo service role (Edge Functions);
-- o usuário lê apenas o que é dele (RLS).

-- ------------------------------------------------------------------ execuções (idempotência entre instâncias)
create table if not exists public.chat_execucoes (
  execucao_id   text primary key check (execucao_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  user_id       uuid references auth.users(id) on delete cascade,
  conversa_id   uuid,
  estado        text not null default 'em_andamento' check (estado in ('em_andamento','concluido','falhou','cancelado')),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  expira_em     timestamptz not null default now() + interval '1 day'
);
create index if not exists chat_execucoes_user_idx on public.chat_execucoes (user_id, criado_em desc);
create index if not exists chat_execucoes_expira_idx on public.chat_execucoes (expira_em);

-- Reserva atômica: devolve true quando a execução pode começar, false quando é duplicada.
create or replace function public.reservar_execucao(p_execucao text, p_user uuid, p_conversa uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inseriu boolean;
begin
  -- limpeza oportunista de expiradas (barata, indexada)
  delete from public.chat_execucoes where expira_em < now();
  insert into public.chat_execucoes (execucao_id, user_id, conversa_id)
  values (p_execucao, p_user, p_conversa)
  on conflict (execucao_id) do nothing;
  get diagnostics inseriu = row_count;
  return inseriu = 1;
end;
$$;
revoke all on function public.reservar_execucao(text, uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ consumo por mensagem
create table if not exists public.uso_modelos (
  id                bigint generated always as identity primary key,
  user_id           uuid references auth.users(id) on delete cascade,
  execucao_id       text,
  conversa_id       uuid,
  modelo            text not null,
  provedor          text,
  tokens_entrada    integer not null default 0,
  tokens_saida      integer not null default 0,
  estimado          boolean not null default true,   -- true = estimativa (~4 chars/token)
  msgs_no_contexto  integer not null default 0,
  msgs_omitidas     integer not null default 0,
  tentativas        integer not null default 1,
  duracao_ms        integer not null default 0,
  custo_usd         numeric(12,6),                   -- null = preço do modelo desconhecido
  criado_em         timestamptz not null default now()
);
create index if not exists uso_modelos_user_idx   on public.uso_modelos (user_id, criado_em desc);
create index if not exists uso_modelos_modelo_idx on public.uso_modelos (modelo, criado_em desc);
create unique index if not exists uso_modelos_execucao_uq on public.uso_modelos (execucao_id) where execucao_id is not null;

-- ------------------------------------------------------------------ trilha de atividades dos agentes
create table if not exists public.atividades_agente (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  agente      text not null default 'principal',
  acao        text not null,
  alvo        text,
  detalhe     jsonb not null default '{}'::jsonb,
  execucao_id text,
  criado_em   timestamptz not null default now()
);
create index if not exists atividades_agente_user_idx on public.atividades_agente (user_id, criado_em desc);

-- ------------------------------------------------------------------ RLS
alter table public.chat_execucoes   enable row level security;
alter table public.uso_modelos      enable row level security;
alter table public.atividades_agente enable row level security;

drop policy if exists "uso_modelos leitura propria" on public.uso_modelos;
create policy "uso_modelos leitura propria" on public.uso_modelos
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "atividades leitura propria" on public.atividades_agente;
create policy "atividades leitura propria" on public.atividades_agente
  for select to authenticated using (auth.uid() = user_id);

-- chat_execucoes: sem política = só o service role enxerga (nada sensível para o cliente).

-- ------------------------------------------------------------------ resumo de consumo para o painel
create or replace view public.uso_modelos_resumo
with (security_invoker = true) as
select
  user_id,
  date_trunc('day', criado_em)::date as dia,
  modelo,
  count(*)                       as mensagens,
  sum(tokens_entrada)            as tokens_entrada,
  sum(tokens_saida)              as tokens_saida,
  sum(msgs_omitidas)             as msgs_omitidas,
  round(avg(duracao_ms))         as duracao_media_ms,
  sum(custo_usd)                 as custo_usd
from public.uso_modelos
group by user_id, date_trunc('day', criado_em)::date, modelo;

grant select on public.uso_modelos_resumo to authenticated;
