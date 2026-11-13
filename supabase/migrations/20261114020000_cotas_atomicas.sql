-- Cotas atômicas: fecha o buraco de cota que não gravava nada e versiona as RPCs
-- do limitador (rate_bater/rate_contar existiam só no banco de produção, criadas
-- à mão — um deploy limpo derrubava tudo com 429 porque liberar() falha fechado).

-- ---------------------------------------------------------------- limitador
create table if not exists public.rate_hits (
  chave text not null,
  janela text not null,
  criado_em timestamp with time zone not null default now()
);

create index if not exists rate_hits_chave_janela_idx
  on public.rate_hits using btree (chave, janela, criado_em desc);

alter table public.rate_hits enable row level security;

create or replace function public.rate_bater(p_chave text, p_janela text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_desde timestamp with time zone;
  v_total integer;
begin
  v_desde := case p_janela
    when 'minute' then now() - interval '1 minute'
    when 'hour'   then now() - interval '1 hour'
    when 'day'    then now() - interval '1 day'
    else now() - interval '1 hour'
  end;

  delete from public.rate_hits
   where chave = p_chave and janela = p_janela and criado_em < v_desde;

  insert into public.rate_hits (chave, janela) values (p_chave, p_janela);

  select count(*) into v_total
    from public.rate_hits
   where chave = p_chave and janela = p_janela and criado_em >= v_desde;

  return v_total;
end $$;

create or replace function public.rate_contar(p_chave text, p_janela text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_desde timestamp with time zone;
  v_total integer;
begin
  v_desde := case p_janela
    when 'minute' then now() - interval '1 minute'
    when 'hour'   then now() - interval '1 hour'
    when 'day'    then now() - interval '1 day'
    else now() - interval '1 hour'
  end;

  select count(*) into v_total
    from public.rate_hits
   where chave = p_chave and janela = p_janela and criado_em >= v_desde;

  return v_total;
end $$;

revoke all on function public.rate_bater(text, text) from public, anon, authenticated;
revoke all on function public.rate_contar(text, text) from public, anon, authenticated;
grant execute on function public.rate_bater(text, text) to service_role;
grant execute on function public.rate_contar(text, text) to service_role;

-- ------------------------------------------------------------- cota diária
-- Soma 1 de forma atômica e devolve o contador pós-incremento.
-- Satura em p_limite + 1: passou do limite, o consumidor recebe > p_limite.
create or replace function public.acc_consumir_mensagem(
  p_account_id uuid,
  p_dia date,
  p_limite integer
)
returns integer
language plpgsql
security definer
set search_path = public
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

-- backfill: contas de e-mail criadas antes da coluna auth_user_id
-- (rodar depois de conferir quantas estão sem vínculo; só relata, não altera)
-- select count(*) from public.accounts where auth_user_id is null and recovery_email is not null;
