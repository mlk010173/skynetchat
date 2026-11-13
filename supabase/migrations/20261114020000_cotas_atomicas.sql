-- Cotas atômicas: fecha o buraco de cota que não gravava nada e versiona as RPCs
-- do limitador (rate_bater/rate_contar existiam só no banco de produção, criadas
-- à mão — um deploy limpo derrubava tudo com 429 porque liberar() falha fechado).
--
-- Corrigida em 13/11/2026 para refletir EXATAMENTE o banco de produção:
-- rate_hits é tabela de contadores por bucket (chave, bucket, n) com PK
-- (chave, bucket) — não a tabela de linhas por evento da primeira versão, que
-- dava erro 42703 ("column janela does not exist") ao ser aplicada.

create table if not exists public.rate_hits (
  chave text not null,
  bucket timestamp with time zone not null,
  n integer not null default 0,
  constraint rate_hits_pkey primary key (chave, bucket)
);

alter table public.rate_hits enable row level security;

create or replace function public.rate_bater(p_chave text, p_janela text)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  b timestamptz;
  total integer;
begin
  b := case p_janela
    when 'minute' then pg_catalog.date_trunc('minute', pg_catalog.now())
    when 'hour'   then pg_catalog.date_trunc('hour', pg_catalog.now())
    else               pg_catalog.date_trunc('day', pg_catalog.now())
  end;

  insert into public.rate_hits as rh (chave, bucket, n)
  values (p_chave, b, 1)
  on conflict (chave, bucket)
  do update set n = rh.n + 1
  returning n into total;

  return total;
end $$;

create or replace function public.rate_contar(p_chave text, p_janela text)
returns integer
language sql
security definer
set search_path to 'pg_catalog'
as $$
  select coalesce(max(n), 0)
  from public.rate_hits
  where chave = p_chave
    and bucket = case p_janela
      when 'minute' then pg_catalog.date_trunc('minute', pg_catalog.now())
      when 'hour'   then pg_catalog.date_trunc('hour', pg_catalog.now())
      else               pg_catalog.date_trunc('day', pg_catalog.now())
    end;
$$;

revoke all on function public.rate_bater(text, text) from public, anon, authenticated;
revoke all on function public.rate_contar(text, text) from public, anon, authenticated;
grant execute on function public.rate_bater(text, text) to service_role;
grant execute on function public.rate_contar(text, text) to service_role;

-- cota diária: soma 1 atômico, satura em p_limite + 1.
-- acc_uso.account_id não tem FK: aceita accounts.id (login por código) ou o uid
-- do Supabase Auth (login por e-mail/senha), que é o caso em produção hoje.
create or replace function public.acc_consumir_mensagem(
  p_account_id uuid,
  p_dia date,
  p_limite integer
)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v integer;
begin
  insert into public.acc_uso (account_id, dia, mensagens)
  values (p_account_id, p_dia, 1)
  on conflict (account_id, dia) do update
     set mensagens = public.acc_uso.mensagens + 1
   where public.acc_uso.mensagens < p_limite + 1
  returning mensagens into v;

  if v is null then
    select mensagens into v
      from public.acc_uso
     where account_id = p_account_id and dia = p_dia;
  end if;

  return coalesce(v, 0);
end $$;

revoke all on function public.acc_consumir_mensagem(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.acc_consumir_mensagem(uuid, date, integer) to service_role;
