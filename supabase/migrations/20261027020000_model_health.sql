-- Saúde dos modelos: alimenta o roteador automático do chat.
-- Cada tentativa atualiza ok/fail/avg_ms; falhas colocam o modelo em cooldown.
create table if not exists public.model_health (
  model_id text primary key,
  ok integer not null default 0,
  fail integer not null default 0,
  avg_ms integer not null default 0,
  cooldown_until timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.model_health enable row level security;

-- Só o service role escreve; usuários autenticados podem ler o status (nada sensível).
drop policy if exists "model_health leitura" on public.model_health;
create policy "model_health leitura" on public.model_health
  for select to authenticated using (true);
