-- SKYHUB — schema do Supabase
-- Rode este SQL no SQL Editor do seu projeto Supabase.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Nova conversa',
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);
create index if not exists conversations_user_idx on public.conversations (user_id, updated_at desc);

-- RLS: cada usuário só acessa o que é dele (o backend usa service role e
-- também valida dono manualmente — duas camadas).
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "dono gerencia conversas" on public.conversations;
create policy "dono gerencia conversas"
  on public.conversations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "dono le mensagens" on public.messages;
create policy "dono le mensagens"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

-- Rate limit do modo anônimo (usado pelas edge functions com service role)
create table if not exists anon_requests (
  id bigserial primary key,
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_anon_requests_ip_time on anon_requests (ip, created_at);
alter table anon_requests enable row level security;
