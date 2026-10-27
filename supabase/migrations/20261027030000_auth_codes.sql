-- Contas por código secreto + recuperação por e-mail (estilo skynetchat.net).
-- O código NUNCA é guardado em texto puro: fica em AES-256-GCM (chave em secret CODE_ENC_KEY).

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  code_enc text not null,              -- código 0000-0000-0000 cifrado
  code_hint text,                      -- últimos 4 dígitos, só para o dono se reconhecer
  recovery_email text,
  recovery_email_verified boolean not null default false,
  tier text not null default 'free',   -- free | pro | admin
  visits integer not null default 0,
  blocked boolean not null default false,
  last_seen timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists accounts_email_idx on public.accounts (lower(recovery_email));
create index if not exists accounts_id_idx on public.accounts (id);

-- Sessões: token opaco que o navegador guarda; nada de JWT com dado sensível.
create table if not exists public.acc_sessions (
  token text primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used timestamptz not null default now(),
  revoked boolean not null default false,
  ua text
);

-- Fila de e-mails: garante envio assíncrono e o limite diário do plano free (5/dia).
create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  to_email text not null,
  subject text not null,
  body text not null,
  kind text not null,                  -- recovery | new_code | support | welcome
  status text not null default 'queued', -- queued | sent | failed | blocked_quota
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists email_outbox_day_idx on public.email_outbox (created_at);

alter table public.accounts enable row level security;
alter table public.acc_sessions enable row level security;
alter table public.email_outbox enable row level security;
-- Sem policies: só o service role (edge functions) acessa.
