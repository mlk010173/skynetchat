-- Persistently limits costly image generations. Apply through Supabase migrations/SQL Editor
-- BEFORE deploying supabase/functions/imagem/index.ts after hardening.
create table if not exists public.image_requests (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);

create index if not exists image_requests_ip_created_idx
  on public.image_requests (ip, created_at desc);

alter table public.image_requests enable row level security;
revoke all on public.image_requests from anon, authenticated;
grant all on public.image_requests to service_role;
grant usage, select on sequence public.image_requests_id_seq to service_role;

comment on table public.image_requests is
  'Server-only request log for the image generation per-IP hourly quota; no client policies.';


-- Atomic quota consumption. Advisory lock prevents concurrent requests for one IP
-- from all passing the count check at once. SECURITY INVOKER: no privilege elevation.
create or replace function public.consume_image_quota(p_ip text, p_limit integer)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  current_count integer;
begin
  if p_ip is null or length(p_ip) < 1 or length(p_ip) > 128 or p_limit < 1 or p_limit > 100 then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_ip, 0));
  select count(*)::integer into current_count
    from public.image_requests
    where ip = p_ip and created_at >= now() - interval '1 hour';
  if current_count >= p_limit then return false; end if;
  insert into public.image_requests(ip) values (p_ip);
  return true;
end;
$function$;

revoke all on function public.consume_image_quota(text, integer) from public, anon, authenticated;
grant execute on function public.consume_image_quota(text, integer) to service_role;

-- Cleanup hourly when pg_cron is available; keep this migration safe to rerun.
do $$
declare
  existing_job bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      select jobid into existing_job from cron.job where jobname = 'cleanup-image-requests' limit 1;
      if existing_job is not null then perform cron.unschedule(existing_job); end if;
      perform cron.schedule(
        'cleanup-image-requests',
        '17 * * * *',
        'delete from public.image_requests where created_at < now() - interval ''24 hours'''
      );
    exception when undefined_table or undefined_function then
      raise notice 'pg_cron cleanup unavailable; schedule deletion of image_requests rows older than 24 hours manually';
    end;
  else
    raise notice 'pg_cron extension unavailable; schedule deletion of image_requests rows older than 24 hours manually';
  end if;
end $$;
