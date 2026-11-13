-- SKYNET COMPUTER: uma sessão de navegador real por conta.
-- Acesso só por service role (a edge function `computer`): RLS ligada, sem policy,
-- então nenhum usuário lê a sessão de outro pelo PostgREST.
create table if not exists public.computer_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  worker_id text not null,
  estado text not null default 'ativa',
  url_atual text,
  permissoes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  ultimo_uso timestamptz not null default now()
);

create index if not exists computer_sessions_conta_idx on public.computer_sessions (account_id, estado, criado_em desc);

alter table public.computer_sessions enable row level security;

revoke all on public.computer_sessions from public, anon, authenticated;
grant all on public.computer_sessions to service_role;
