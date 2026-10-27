-- Vinculo de identidade Firebase -> Supabase. Nao altera auth.users nem dados existentes.
create table if not exists public.firebase_identities (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null unique,
  supabase_user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  email_verified boolean not null default false,
  provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists firebase_identities_email_key on public.firebase_identities (lower(email));
create index if not exists firebase_identities_user_idx on public.firebase_identities (supabase_user_id);

alter table public.firebase_identities enable row level security;

-- Sem politicas publicas: apenas service_role acessa. anon/authenticated nao leem nem escrevem.
revoke all on public.firebase_identities from anon, authenticated;
grant all on public.firebase_identities to service_role;

comment on table public.firebase_identities is 'Vinculo Firebase UID -> usuario Supabase. Somente service_role. Sem politicas publicas por decisao de seguranca.';
