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
-- 1) updated_at automático nas conversas quando chega mensagem
create or replace function touch_conversation() returns trigger as $$
begin
  update conversations set updated_at = now() where id = new.conversation_id;
  return new;
end $$ language plpgsql;
drop trigger if exists trg_touch_conversation on messages;
create trigger trg_touch_conversation after insert on messages
  for each row execute function touch_conversation();

-- 2) busca full-text em português no conteúdo das mensagens
alter table messages add column if not exists search_text tsvector
  generated always as (to_tsvector('portuguese', coalesce(content, ''))) stored;
create index if not exists idx_messages_search on messages using gin (search_text);

-- 3) memória de longo prazo do agente: embeddings vetoriais (pgvector)
create extension if not exists vector;
alter table messages add column if not exists embedding vector(1536);
create index if not exists idx_messages_embedding on messages
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- 4) busca de conversas por título OU conteúdo das mensagens
create or replace function search_conversations(uid uuid, q text)
returns setof conversations language sql stable as $$
  select c.* from conversations c
  where c.user_id = uid and (
    c.title ilike '%' || q || '%' or exists (
      select 1 from messages m
      where m.conversation_id = c.id
        and m.search_text @@ websearch_to_tsquery('portuguese', q)))
  order by c.updated_at desc
  limit 50;
$$;

-- 5) sincronização em tempo real entre dispositivos
do $$ begin
  alter publication supabase_realtime add table conversations;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null; end $$;

-- 6) limpeza automática da tabela de rate-limit (pg_cron, a cada hora)
create extension if not exists pg_cron;
select cron.schedule('cleanup-anon-requests', '5 * * * *',
  $$delete from anon_requests where created_at < now() - interval '3 hours'$$);

-- 7) RPC de memória: mensagens mais parecidas de outras conversas do usuário
create or replace function match_memories(
  p_user uuid, p_conv uuid, p_embedding vector(1536), p_threshold float, p_count int
) returns table (role text, content text, similarity float) language sql stable as $$
  select m.role, m.content, 1 - (m.embedding <=> p_embedding) as similarity
  from messages m
  join conversations c on c.id = m.conversation_id
  where c.user_id = p_user
    and m.conversation_id <> coalesce(p_conv, m.conversation_id)
    and m.embedding is not null
    and 1 - (m.embedding <=> p_embedding) > p_threshold
  order by m.embedding <=> p_embedding
  limit p_count;
$$;
-- ============ CONTA / PERFIL / CONFIGURAÇÕES / NOTIFICAÇÕES ============

-- 1) Configurações por usuário (tema, modelo padrão, notificações)
create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'black' check (theme in ('black','white')),
  default_model text not null default 'gpt-4o-mini',
  notifications_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;
create policy "user_settings_select_own" on user_settings for select using (auth.uid() = user_id);
create policy "user_settings_upsert_own" on user_settings for insert with check (auth.uid() = user_id);
create policy "user_settings_update_own" on user_settings for update using (auth.uid() = user_id);

-- 2) Notificações reais do sistema
create table if not exists notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'system' check (kind in ('system','welcome','account','warning')),
  title text not null,
  body text not null default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;
create policy "notifications_select_own" on notifications for select using (auth.uid() = user_id);
create policy "notifications_update_own" on notifications for update using (auth.uid() = user_id);

-- 3) Novo usuário: configurações padrão + notificação de boas-vindas
create or replace function on_new_user() returns trigger as $$
begin
  insert into user_settings (user_id) values (new.id) on conflict do nothing;
  insert into notifications (user_id, kind, title, body) values (
    new.id, 'welcome',
    'Bem-vindo ao SKYNET',
    'Sua conta foi criada com sucesso. Seu histórico fica salvo no servidor e sincroniza entre dispositivos.'
  );
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_on_new_user on auth.users;
create trigger trg_on_new_user after insert on auth.users
  for each row execute function on_new_user();

-- 4) Notificações em tempo real
do $$ begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then null; end $$;
