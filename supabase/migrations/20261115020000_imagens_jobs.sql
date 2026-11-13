-- Geração de imagem com idempotência, histórico e Storage.
--
-- Problemas que esta migration resolve (função supabase/functions/imagem):
--   * retry gerava e cobrava outra imagem -> tabela image_jobs + chave de idempotência;
--   * falha queimava cota -> fluxo passa a consumir a cota só no sucesso (e há estorno seguro);
--   * imagem voltava em base64 no JSON -> bucket privado 'skynet-imagens' + URL assinada;
--   * sem histórico -> image_jobs com RLS por dono.
--
-- Idempotente: pode ser aplicada mais de uma vez sem erro.

begin;

-- ---------------------------------------------------------------- extensões
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tabela
create table if not exists public.image_jobs (
  id uuid primary key default gen_random_uuid(),
  -- dono autenticado (Supabase Auth). Nulo para visitante anônimo.
  user_id uuid null references auth.users (id) on delete cascade,
  -- visitante anônimo: hash do IP (nunca o IP bruto) ou hash da conta sem auth.
  session_key text null,
  chave_idempotencia text not null,
  prompt_original text not null,
  prompt_final text not null,
  atributos jsonb not null default '[]'::jsonb,
  aspecto text,
  qualidade text,
  estado text not null default 'pendente'
    constraint image_jobs_estado_check
    check (estado in ('pendente', 'gerando', 'concluido', 'falhou', 'cancelado')),
  provedor text,
  modelo text,
  storage_path text,
  mime text,
  bytes integer,
  seed text,
  erro text,
  tentativas integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  concluido_em timestamptz,
  -- variação/edição de outro job
  referencia_de uuid null references public.image_jobs (id) on delete set null
);

-- Garante as colunas mesmo se a tabela já existisse de uma versão anterior.
alter table public.image_jobs add column if not exists user_id uuid;
alter table public.image_jobs add column if not exists session_key text;
alter table public.image_jobs add column if not exists chave_idempotencia text;
alter table public.image_jobs add column if not exists prompt_original text;
alter table public.image_jobs add column if not exists prompt_final text;
alter table public.image_jobs add column if not exists atributos jsonb default '[]'::jsonb;
alter table public.image_jobs add column if not exists aspecto text;
alter table public.image_jobs add column if not exists qualidade text;
alter table public.image_jobs add column if not exists estado text default 'pendente';
alter table public.image_jobs add column if not exists provedor text;
alter table public.image_jobs add column if not exists modelo text;
alter table public.image_jobs add column if not exists storage_path text;
alter table public.image_jobs add column if not exists mime text;
alter table public.image_jobs add column if not exists bytes integer;
alter table public.image_jobs add column if not exists seed text;
alter table public.image_jobs add column if not exists erro text;
alter table public.image_jobs add column if not exists tentativas integer default 0;
alter table public.image_jobs add column if not exists criado_em timestamptz default now();
alter table public.image_jobs add column if not exists atualizado_em timestamptz default now();
alter table public.image_jobs add column if not exists concluido_em timestamptz;
alter table public.image_jobs add column if not exists referencia_de uuid;

-- Um job precisa de dono: user_id (autenticado) OU session_key (anônimo).
alter table public.image_jobs drop constraint if exists image_jobs_dono_check;
alter table public.image_jobs
  add constraint image_jobs_dono_check
  check (user_id is not null or nullif(btrim(coalesce(session_key, '')), '') is not null);

alter table public.image_jobs drop constraint if exists image_jobs_chave_check;
alter table public.image_jobs
  add constraint image_jobs_chave_check
  check (char_length(chave_idempotencia) between 8 and 200);

alter table public.image_jobs drop constraint if exists image_jobs_tentativas_check;
alter table public.image_jobs
  add constraint image_jobs_tentativas_check check (tentativas >= 0);

-- Idempotência: a mesma chave do mesmo dono (usuário OU sessão anônima) é um único job.
create unique index if not exists image_jobs_idempotencia_uidx
  on public.image_jobs ((coalesce(user_id::text, session_key)), chave_idempotencia);

-- Histórico e limpeza.
create index if not exists image_jobs_user_criado_idx
  on public.image_jobs (user_id, criado_em desc);
create index if not exists image_jobs_session_criado_idx
  on public.image_jobs (session_key, criado_em desc);
create index if not exists image_jobs_estado_criado_idx
  on public.image_jobs (estado, criado_em desc);

comment on table public.image_jobs is
  'Fila/histórico de geração de imagem: idempotência por (dono, chave_idempotencia), resultado no bucket privado skynet-imagens. Escrita do servidor via service role.';

-- atualizado_em automático
create or replace function public.image_jobs_touch()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
begin
  new.atualizado_em := now();
  return new;
end;
$fn$;

drop trigger if exists image_jobs_touch on public.image_jobs;
create trigger image_jobs_touch
  before update on public.image_jobs
  for each row execute function public.image_jobs_touch();

-- ---------------------------------------------------------------- RLS
alter table public.image_jobs enable row level security;

revoke all on public.image_jobs from anon, authenticated;
grant select, insert, update on public.image_jobs to authenticated;
grant all on public.image_jobs to service_role;

drop policy if exists image_jobs_leitura_dono on public.image_jobs;
create policy image_jobs_leitura_dono
  on public.image_jobs for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists image_jobs_insercao_dono on public.image_jobs;
create policy image_jobs_insercao_dono
  on public.image_jobs for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists image_jobs_atualizacao_dono on public.image_jobs;
create policy image_jobs_atualizacao_dono
  on public.image_jobs for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- Storage
-- Bucket privado: leitura sempre por URL assinada; policies limitam o prefixo {auth.uid()}/.
do $do$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('skynet-imagens', 'skynet-imagens', false, 10485760,
            array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do nothing;
  else
    raise notice 'schema storage ausente: crie o bucket privado skynet-imagens manualmente';
  end if;
end;
$do$;

do $do$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'objects'
  ) then
    execute 'drop policy if exists skynet_imagens_leitura on storage.objects';
    execute $p$create policy skynet_imagens_leitura on storage.objects
      for select to authenticated
      using (bucket_id = 'skynet-imagens' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;

    execute 'drop policy if exists skynet_imagens_envio on storage.objects';
    execute $p$create policy skynet_imagens_envio on storage.objects
      for insert to authenticated
      with check (bucket_id = 'skynet-imagens' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;

    execute 'drop policy if exists skynet_imagens_atualizacao on storage.objects';
    execute $p$create policy skynet_imagens_atualizacao on storage.objects
      for update to authenticated
      using (bucket_id = 'skynet-imagens' and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = 'skynet-imagens' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;

    execute 'drop policy if exists skynet_imagens_remocao on storage.objects';
    execute $p$create policy skynet_imagens_remocao on storage.objects
      for delete to authenticated
      using (bucket_id = 'skynet-imagens' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  else
    raise notice 'schema storage ausente: aplique as policies de storage.objects manualmente';
  end if;
end;
$do$;

-- ---------------------------------------------------------------- cota de imagem
-- A função de consumo existente (20261026170000_image_rate_limit.sql) grava uma linha em
-- public.image_requests por geração. Isso permite estorno SEGURO: basta apagar a linha mais
-- recente daquele IP dentro da janela de 1 hora (a mesma janela que o consumo usa).
create or replace function public.refund_image_quota(p_ip text)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  removidos integer := 0;
  alvo bigint;
begin
  if p_ip is null or length(btrim(p_ip)) < 1 or length(p_ip) > 128 then
    return false;
  end if;

  -- mesmo lock do consumo: estorno e consumo do mesmo IP não se cruzam
  perform pg_advisory_xact_lock(hashtextextended(p_ip, 0));

  select id into alvo
    from public.image_requests
   where ip = p_ip
     and created_at >= now() - interval '1 hour'
   order by created_at desc, id desc
   limit 1;

  if alvo is null then
    return false;
  end if;

  delete from public.image_requests where id = alvo;
  get diagnostics removidos = row_count;
  return removidos > 0;
end;
$fn$;

comment on function public.refund_image_quota(text) is
  'Estorna 1 unidade da cota horária de imagem do IP (apaga a linha de consumo mais recente da janela de 1h). Retorna false quando não havia nada para estornar.';

revoke all on function public.refund_image_quota(text) from public, anon, authenticated;
grant execute on function public.refund_image_quota(text) to service_role;

-- Leitura (sem consumir) da cota: usada para decidir ANTES de gerar.
-- Devolve quantas gerações ainda cabem na janela de 1 hora.
create or replace function public.image_quota_restante(p_ip text, p_limit integer)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  usados integer;
begin
  if p_ip is null or length(btrim(p_ip)) < 1 or length(p_ip) > 128 or p_limit < 1 or p_limit > 100 then
    return 0;
  end if;
  select count(*)::integer into usados
    from public.image_requests
   where ip = p_ip
     and created_at >= now() - interval '1 hour';
  return greatest(p_limit - coalesce(usados, 0), 0);
end;
$fn$;

comment on function public.image_quota_restante(text, integer) is
  'Quantas gerações ainda cabem na janela de 1 hora para o IP, sem consumir nada.';

revoke all on function public.image_quota_restante(text, integer) from public, anon, authenticated;
grant execute on function public.image_quota_restante(text, integer) to service_role;

commit;
