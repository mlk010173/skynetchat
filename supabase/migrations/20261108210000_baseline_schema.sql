-- Baseline do banco do SKYNET (projeto rkgwhhtenfozdwzpvxjj)
-- Gerado a partir do banco em producao em 2026-11-08.
-- Motivo: o projeto tem 22 migracoes aplicadas no Supabase e apenas 3 versionadas,
-- o que impedia reconstruir o banco em outro ambiente. Este arquivo descreve o estado
-- atual (tabelas, chaves, indices, RLS e politicas) de forma idempotente.
-- Nao executa em producao: serve de referencia e de base para ambientes novos.

create table if not exists public.acc_memory (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  account_id uuid,
  chave text NOT NULL,
  valor text NOT NULL,
  tipo text DEFAULT 'fato'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id) /* acc_memory_pkey */
);
create table if not exists public.acc_pedidos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  dono text NOT NULL,
  ferramenta text NOT NULL,
  resumo text,
  assinatura text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  estado text DEFAULT 'pendente'::text NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  decidido_em timestamp with time zone,
  expira_em timestamp with time zone DEFAULT (now() + '00:30:00'::interval) NOT NULL,
  conversa_id uuid,
  pedido_texto text,
  continuado_em timestamp with time zone,
  PRIMARY KEY (id) /* acc_pedidos_pkey */
);
create table if not exists public.acc_permissoes (
  dono text NOT NULL,
  ferramenta text NOT NULL,
  politica text DEFAULT 'livre'::text NOT NULL,
  aprovado_em timestamp with time zone,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (dono, ferramenta) /* acc_permissoes_pkey */
);
create table if not exists public.acc_sessions (
  token text NOT NULL,
  account_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  last_used timestamp with time zone DEFAULT now() NOT NULL,
  revoked boolean DEFAULT false NOT NULL,
  ua text,
  PRIMARY KEY (token) /* acc_sessions_pkey */
);
create table if not exists public.acc_uso (
  account_id uuid NOT NULL,
  dia date DEFAULT CURRENT_DATE NOT NULL,
  mensagens integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (account_id, dia) /* acc_uso_pkey */
);
create table if not exists public.accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code_enc text NOT NULL,
  code_hint text,
  recovery_email text,
  recovery_email_verified boolean DEFAULT false NOT NULL,
  tier text DEFAULT 'free'::text NOT NULL,
  visits integer DEFAULT 0 NOT NULL,
  blocked boolean DEFAULT false NOT NULL,
  last_seen timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  role text DEFAULT 'user'::text,
  nickname text,
  auth_user_id uuid,
  PRIMARY KEY (id) /* accounts_pkey */
);
create table if not exists public.agent_memory (
  id bigint DEFAULT nextval('agent_memory_id_seq'::regclass) NOT NULL,
  email text,
  texto text NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  user_id uuid,
  PRIMARY KEY (id) /* agent_memory_pkey */
);
create table if not exists public.anon_requests (
  id bigint DEFAULT nextval('anon_requests_id_seq'::regclass) NOT NULL,
  ip text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id) /* anon_requests_pkey */
);
create table if not exists public.api_keys (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  account_id uuid NOT NULL,
  name text DEFAULT 'chave'::text NOT NULL,
  prefix text NOT NULL,
  key_hash text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  last_used timestamp with time zone,
  calls bigint DEFAULT 0 NOT NULL,
  revoked boolean DEFAULT false NOT NULL,
  PRIMARY KEY (id) /* api_keys_pkey */
);
create table if not exists public.api_log (
  id bigint DEFAULT nextval('api_log_id_seq'::regclass) NOT NULL,
  account_id uuid,
  key_id uuid,
  rota text,
  status integer,
  ms integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id) /* api_log_pkey */
);
create table if not exists public.auth_attempts (
  ip text NOT NULL,
  at timestamp with time zone DEFAULT now() NOT NULL,
  id bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (id) /* auth_attempts_pkey */
);
create table if not exists public.auth_codes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  email text NOT NULL,
  code_hash text NOT NULL,
  code_lookup text NOT NULL,
  code_enc text,
  recovery_email text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id) /* auth_codes_pkey */
);
create table if not exists public.automations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  nome text NOT NULL,
  prompt text NOT NULL,
  cron_minutos integer DEFAULT 60 NOT NULL,
  ativo boolean DEFAULT true,
  criado_em timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id) /* automations_pkey */
);
create table if not exists public.automations_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  automation_id uuid,
  iniciado_em timestamp with time zone DEFAULT now(),
  status text,
  resultado text,
  PRIMARY KEY (id) /* automations_runs_pkey */
);
create table if not exists public.conversations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  title text DEFAULT 'Nova conversa'::text NOT NULL,
  model text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  account_id uuid,
  PRIMARY KEY (id) /* conversations_pkey */
);
create table if not exists public.crm_atividades (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  dono text NOT NULL,
  contato_id uuid,
  negocio_id uuid,
  tipo text DEFAULT 'nota'::text NOT NULL,
  titulo text NOT NULL,
  descricao text,
  quando timestamp with time zone DEFAULT now(),
  concluida boolean DEFAULT false NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id) /* crm_atividades_pkey */
);
create table if not exists public.crm_contatos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  dono text NOT NULL,
  nome text NOT NULL,
  email text,
  telefone text,
  empresa text,
  cargo text,
  origem text DEFAULT 'manual'::text,
  tags text[] DEFAULT '{}'::text[],
  notas text,
  ultimo_contato timestamp with time zone,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id) /* crm_contatos_pkey */
);
create table if not exists public.crm_negocios (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  dono text NOT NULL,
  contato_id uuid,
  titulo text NOT NULL,
  etapa text DEFAULT 'novo'::text NOT NULL,
  valor numeric(14,2) DEFAULT 0,
  moeda text DEFAULT 'BRL'::text,
  probabilidade integer DEFAULT 20,
  previsao date,
  notas text,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  fechado_em timestamp with time zone,
  PRIMARY KEY (id) /* crm_negocios_pkey */
);
create table if not exists public.email_outbox (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  account_id uuid,
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  kind text NOT NULL,
  status text DEFAULT 'queued'::text NOT NULL,
  provider_id text,
  error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  sent_at timestamp with time zone,
  PRIMARY KEY (id) /* email_outbox_pkey */
);
create table if not exists public.image_requests (
  id bigint GENERATED ALWAYS AS IDENTITY,
  ip text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id) /* image_requests_pkey */
);
create table if not exists public.lembretes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  dono text NOT NULL,
  titulo text NOT NULL,
  detalhe text,
  quando timestamp with time zone,
  feito boolean DEFAULT false NOT NULL,
  avisado boolean DEFAULT false NOT NULL,
  origem text DEFAULT 'chat'::text,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  concluido_em timestamp with time zone,
  PRIMARY KEY (id) /* lembretes_pkey */
);
create table if not exists public.messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  conversation_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  model text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  search_text tsvector GENERATED ALWAYS AS (to_tsvector('portuguese'::regconfig, COALESCE(content, ''::text))) STORED,
  embedding vector(2048),
  PRIMARY KEY (id) /* messages_pkey */
);
create table if not exists public.model_health (
  model_id text NOT NULL,
  ok integer DEFAULT 0 NOT NULL,
  fail integer DEFAULT 0 NOT NULL,
  avg_ms integer DEFAULT 0 NOT NULL,
  cooldown_until timestamp with time zone,
  last_error text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (model_id) /* model_health_pkey */
);
create table if not exists public.notifications (
  id bigint GENERATED ALWAYS AS IDENTITY,
  user_id uuid NOT NULL,
  kind text DEFAULT 'system'::text NOT NULL,
  title text NOT NULL,
  body text DEFAULT ''::text NOT NULL,
  read boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id) /* notifications_pkey */
);
create table if not exists public.rate_hits (
  chave text NOT NULL,
  bucket timestamp with time zone NOT NULL,
  n integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (chave, bucket) /* rate_hits_pkey */
);
create table if not exists public.recovery_email_verifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  account_id uuid NOT NULL,
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  attempts smallint DEFAULT 0 NOT NULL,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id) /* recovery_email_verifications_pkey */
);
create table if not exists public.sandbox_arquivos (
  conta text NOT NULL,
  caminho text NOT NULL,
  conteudo text DEFAULT ''::text NOT NULL,
  bytes integer DEFAULT 0 NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (conta, caminho) /* sandbox_arquivos_pkey */
);
create table if not exists public.sandbox_historico (
  id bigint DEFAULT nextval('sandbox_historico_id_seq'::regclass) NOT NULL,
  conta text NOT NULL,
  comando text NOT NULL,
  saida text,
  ok boolean DEFAULT true NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id) /* sandbox_historico_pkey */
);
create table if not exists public.user_settings (
  user_id uuid NOT NULL,
  theme text DEFAULT 'black'::text NOT NULL,
  default_model text DEFAULT 'gpt-4o-mini'::text NOT NULL,
  notifications_enabled boolean DEFAULT true NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  dados jsonb DEFAULT '{}'::jsonb NOT NULL,
  PRIMARY KEY (user_id) /* user_settings_pkey */
);
alter table public.api_keys add constraint api_keys_key_hash_key UNIQUE (key_hash);
alter table public.auth_codes add constraint auth_codes_code_lookup_key UNIQUE (code_lookup);
create index if not exists acc_memory_owner_updated ON public.acc_memory USING btree (account_id, updated_at DESC);
create unique index if not exists acc_memory_unica ON public.acc_memory USING btree (account_id, chave);
create index if not exists acc_pedidos_continuar ON public.acc_pedidos USING btree (dono, estado, expira_em DESC);
create index if not exists idx_pedidos_dono ON public.acc_pedidos USING btree (dono, estado, criado_em DESC);
create index if not exists idx_acc_sessions_account_id ON public.acc_sessions USING btree (account_id);
create index if not exists acc_uso_owner_dia ON public.acc_uso USING btree (account_id, dia);
create unique index if not exists accounts_auth_user_id_key ON public.accounts USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);
create index if not exists accounts_code_hint_active_idx ON public.accounts USING btree (code_hint) WHERE (blocked IS FALSE);
create index if not exists accounts_email_idx ON public.accounts USING btree (lower(recovery_email));
create index if not exists accounts_id_idx ON public.accounts USING btree (id);
create index if not exists agent_memory_texto_idx ON public.agent_memory USING gin (to_tsvector('portuguese'::regconfig, texto));
create index if not exists agent_memory_user_id_created_idx ON public.agent_memory USING btree (user_id, criado_em DESC);
create index if not exists idx_anon_requests_ip_time ON public.anon_requests USING btree (ip, created_at);
create index if not exists api_keys_account ON public.api_keys USING btree (account_id);
create index if not exists idx_api_log_conta ON public.api_log USING btree (account_id, created_at DESC);
create index if not exists idx_api_log_criado ON public.api_log USING btree (created_at DESC);
create index if not exists auth_attempts_ip_at_idx ON public.auth_attempts USING btree (ip, at);
create index if not exists idx_auth_codes_user_id ON public.auth_codes USING btree (user_id);
create index if not exists automations_active_user_id_idx ON public.automations USING btree (user_id) WHERE (ativo IS TRUE);
create index if not exists idx_automations_ativo_user ON public.automations USING btree (ativo, user_id);
create index if not exists idx_automations_user_id ON public.automations USING btree (user_id);
create unique index if not exists automations_runs_one_executing_idx ON public.automations_runs USING btree (automation_id) WHERE ((status = 'executando'::text) AND (automation_id IS NOT NULL));
create index if not exists automations_runs_recent_per_automation_idx ON public.automations_runs USING btree (automation_id, iniciado_em DESC);
create index if not exists idx_automations_runs_auto_id ON public.automations_runs USING btree (automation_id);
create index if not exists conv_account_idx ON public.conversations USING btree (account_id);
create index if not exists conversations_user_idx ON public.conversations USING btree (user_id, updated_at DESC);
create index if not exists idx_conv_account_data ON public.conversations USING btree (account_id, updated_at DESC);
create index if not exists crm_atividades_contato_dono_idx ON public.crm_atividades USING btree (contato_id, dono);
create index if not exists crm_atividades_negocio_dono_idx ON public.crm_atividades USING btree (negocio_id, dono);
create index if not exists idx_crm_ativ_dono ON public.crm_atividades USING btree (dono, concluida, quando);
create index if not exists idx_crm_contatos_dono ON public.crm_contatos USING btree (dono, atualizado_em DESC);
create index if not exists crm_negocios_contato_dono_idx ON public.crm_negocios USING btree (contato_id, dono);
create index if not exists idx_crm_negocios_dono ON public.crm_negocios USING btree (dono, etapa, atualizado_em DESC);
create index if not exists email_outbox_day_idx ON public.email_outbox USING btree (created_at);
create index if not exists idx_email_outbox_account_id ON public.email_outbox USING btree (account_id);
create index if not exists image_requests_ip_created_idx ON public.image_requests USING btree (ip, created_at DESC);
create index if not exists lembretes_abertos ON public.lembretes USING btree (dono, feito, quando) WHERE (feito = false);
create index if not exists lembretes_dono_quando ON public.lembretes USING btree (dono, quando);
create index if not exists idx_messages_conv_data ON public.messages USING btree (conversation_id, created_at DESC);
create index if not exists idx_messages_search ON public.messages USING gin (search_text);
create index if not exists messages_conversation_idx ON public.messages USING btree (conversation_id, created_at);
create index if not exists idx_notifications_user_id ON public.notifications USING btree (user_id);
create index if not exists recovery_email_verifications_expiry_idx ON public.recovery_email_verifications USING btree (expires_at);
create unique index if not exists recovery_email_verifications_one_pending_per_account ON public.recovery_email_verifications USING btree (account_id) WHERE (consumed_at IS NULL);
create index if not exists sandbox_hist_conta ON public.sandbox_historico USING btree (conta, criado_em DESC);
alter table public.acc_memory enable row level security;
alter table public.acc_pedidos enable row level security;
alter table public.acc_permissoes enable row level security;
alter table public.acc_sessions enable row level security;
alter table public.acc_uso enable row level security;
alter table public.accounts enable row level security;
alter table public.agent_memory enable row level security;
alter table public.anon_requests enable row level security;
alter table public.api_keys enable row level security;
alter table public.api_log enable row level security;
alter table public.auth_attempts enable row level security;
alter table public.auth_codes enable row level security;
alter table public.automations enable row level security;
alter table public.automations_runs enable row level security;
alter table public.conversations enable row level security;
alter table public.crm_atividades enable row level security;
alter table public.crm_contatos enable row level security;
alter table public.crm_negocios enable row level security;
alter table public.email_outbox enable row level security;
alter table public.image_requests enable row level security;
alter table public.lembretes enable row level security;
alter table public.messages enable row level security;
alter table public.model_health enable row level security;
alter table public.notifications enable row level security;
alter table public.rate_hits enable row level security;
alter table public.recovery_email_verifications enable row level security;
alter table public.sandbox_arquivos enable row level security;
alter table public.sandbox_historico enable row level security;
alter table public.user_settings enable row level security;
create policy agent_memory_owner on public.agent_memory for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "dono gerencia automations" on public.automations for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "dono gerencia automations_runs" on public.automations_runs for ALL to authenticated using ((EXISTS ( SELECT 1
   FROM automations a
  WHERE ((a.id = automations_runs.automation_id) AND (a.user_id = ( SELECT auth.uid() AS uid)))))) with check ((EXISTS ( SELECT 1
   FROM automations a
  WHERE ((a.id = automations_runs.automation_id) AND (a.user_id = ( SELECT auth.uid() AS uid))))));
create policy "dono gerencia conversas" on public.conversations for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "dono le mensagens" on public.messages for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND (c.user_id = ( SELECT auth.uid() AS uid))))));
create policy "model_health leitura" on public.model_health for SELECT to authenticated using (true);
create policy notifications_select_own on public.notifications for SELECT to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));
create policy notifications_update_own on public.notifications for UPDATE to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy user_settings_select_own on public.user_settings for SELECT to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));
create policy user_settings_update_own on public.user_settings for UPDATE to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy user_settings_upsert_own on public.user_settings for INSERT to authenticated with check ((user_id = ( SELECT auth.uid() AS uid)));
