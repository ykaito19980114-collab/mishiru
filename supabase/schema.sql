-- ============================================================================
-- OpenLab schema v2  （docs/03 §5 データ仕様 / DB-01 準拠）
-- M2でSupabaseを有効化する際に実行する。v0はローカルJSONストア（ADR-002）で動作。
-- 個人情報テーブル（claims/leads/reports/articles）は管理権限のみ参照可（§7）。
-- ============================================================================
-- すべて mishiru_ 接頭辞を付け、同一Supabaseプロジェクト内の既存テーブルと衝突させない。
-- 途中で1件でも失敗した場合はCOMMITされず、部分作成状態を残さない。
begin;

-- ---------- マスタ：大学・専攻・研究室・カード ----------
create table if not exists mishiru_universities (
  id          text primary key,          -- slug 例: osaka-university
  name        text not null,
  prefecture  text,
  region      text,
  website     text,
  created_at  timestamptz default now()
);

create table if not exists mishiru_departments (
  id          text primary key,
  university_id text references mishiru_universities(id),
  name        text not null,             -- 研究科・専攻
  created_at  timestamptz default now()
);

create table if not exists mishiru_labs (
  id            text primary key,          -- 例: lab-1
  name          text not null,
  university_name text not null,
  prefecture    text,
  region        text,
  department    text,
  pi_name       text,
  pi_title      text,
  members       jsonb default '[]'::jsonb, -- [{name,title}]
  keywords      text[] default '{}',
  area_tags     text[] default '{}',       -- taxonomy id（GINで検索）
  official_url  text,
  sources       jsonb default '[]'::jsonb, -- [{label,url}] 出典（FR-LAB-02）
  sections      jsonb default '{}'::jsonb, -- FR-LAB-01 必須10項目。null=未確認
  status        text default 'published'
                 check (status in ('draft','review_requested','published','claimed','update_requested','hidden','archived')),
  verified      boolean default false,     -- claimed（公認）
  confidence    text default 'public_info' check (confidence in ('public_info','verified')),
  last_updated  date,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists idx_mishiru_labs_area on mishiru_labs using gin (area_tags);
create index if not exists idx_mishiru_labs_keywords on mishiru_labs using gin (keywords);
create index if not exists idx_mishiru_labs_status on mishiru_labs (status);

create table if not exists mishiru_theme_cards (
  id            text primary key,          -- card-001
  title         text not null,             -- 学生向けの問い（論文転記禁止）
  everyday_hook text not null,
  hook_genre    text not null,
  plain_summary text not null,
  why_interesting text not null,
  area_tags     text[] default '{}',
  keywords      text[] default '{}',
  methods       text[] default '{}',
  orientation   real default 0,            -- -1(基礎)..+1(応用)
  difficulty    int default 1 check (difficulty between 1 and 3),
  suited_for    text,
  created_at    timestamptz default now()
);
create index if not exists idx_mishiru_cards_area on mishiru_theme_cards using gin (area_tags);

-- 出典（研究室のsourcesはjsonbに内包。独立参照が必要なら使用）
create table if not exists mishiru_sources (
  id          bigserial primary key,
  lab_id      text references mishiru_labs(id) on delete cascade,
  label       text not null,
  url         text not null,
  confirmed_at date,
  created_at  timestamptz default now()
);

-- ---------- 学生セッション系（個人関連情報。匿名sessionId） ----------
create table if not exists mishiru_card_actions (
  action_id   text primary key,          -- クライアント生成UUID（冪等キー AC-10）
  session_id  text not null,
  card_id     text not null references mishiru_theme_cards(id),
  action      text not null check (action in ('like','skip','deep','save','important','unclear','not_fit')),
  created_at  timestamptz default now()
);
create index if not exists idx_mishiru_actions_session on mishiru_card_actions (session_id);

create table if not exists mishiru_interest_profiles (
  session_id     text primary key,
  generated_at   timestamptz default now(),
  evaluated_count int,
  top_areas      jsonb,
  method_preference jsonb,
  orientation    real,
  candidate_fields text[],
  summary        text
);

create table if not exists mishiru_events (
  id          bigserial primary key,
  type        text not null,             -- card_action/profile_generated/lab_view/outbound_click/session_start
  session_id  text,
  payload     jsonb,
  at          timestamptz default now()
);
create index if not exists idx_mishiru_events_type_at on mishiru_events (type, at);

-- ---------- 無料体験・アカウント引き継ぎ ----------
-- ブラウザの匿名 session_id を、ログイン後も同じユーザーへ結び付ける。
create table if not exists mishiru_user_sessions (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  session_id   text unique not null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create table if not exists mishiru_guest_usage (
  session_id   text primary key,
  action_count integer not null default 0 check (action_count >= 0),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- action_id を保存し、通信再送で同じ操作を二重計上しない。
create table if not exists mishiru_guest_usage_events (
  session_id text not null,
  action_id  text not null,
  created_at timestamptz default now(),
  primary key (session_id, action_id)
);

-- ResearchProject・保存・反応など、セッション単位の可変状態。
create table if not exists mishiru_session_state (
  session_id text primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_mishiru_session_state_user on mishiru_session_state (user_id);

-- 5回制限を競合なく、かつ冪等に消費する。
create or replace function mishiru_consume_guest_action(
  p_session_id text,
  p_action_id text,
  p_limit integer default 5
)
returns table (allowed boolean, used integer, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  if exists(select 1 from mishiru_guest_usage_events where session_id = p_session_id and action_id = p_action_id) then
    select action_count into current_count from mishiru_guest_usage where session_id = p_session_id;
    current_count := coalesce(current_count, 0);
    return query select true, current_count, greatest(0, p_limit - current_count);
    return;
  end if;

  insert into mishiru_guest_usage(session_id, action_count) values (p_session_id, 0)
  on conflict (session_id) do nothing;
  select action_count into current_count from mishiru_guest_usage where session_id = p_session_id for update;

  if current_count >= p_limit then
    return query select false, current_count, 0;
    return;
  end if;

  insert into mishiru_guest_usage_events(session_id, action_id) values (p_session_id, p_action_id);
  current_count := current_count + 1;
  update mishiru_guest_usage set action_count = current_count, updated_at = now() where session_id = p_session_id;
  return query select true, current_count, greatest(0, p_limit - current_count);
end;
$$;

revoke all on function mishiru_consume_guest_action(text, text, integer) from public, anon, authenticated;
grant execute on function mishiru_consume_guest_action(text, text, integer) to service_role;

-- ---------- 運営系（個人情報：admin専用） ----------
create table if not exists mishiru_claims (
  id          text primary key,
  type        text check (type in ('fix','takedown','claim','other')),
  lab_id      text references mishiru_labs(id),
  lab_name    text,
  name        text not null,
  affiliation text,
  email       text not null,
  message     text,
  evidence_url text,
  status      text default 'pending' check (status in ('pending','in_review','resolved','rejected')),
  note        text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists mishiru_leads (
  id             text primary key,
  university     text,
  department     text,
  lab_name       text,
  lab_id         text references mishiru_labs(id),
  has_url        boolean default false,
  url_stale      boolean default false,
  has_kaken      boolean default false,
  status         text default 'new' check (status in ('new','diagnosed','contacted','meeting','proposal','won','lost','nurture')),
  next_action    text,
  next_action_date date not null,        -- STATE-03：次アクション日必須
  memo           text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create table if not exists mishiru_reports (
  id          text primary key,
  lab_id      text references mishiru_labs(id),
  lab_name    text,
  researcher  text,
  source_url  text,
  content     text,                       -- Markdown下書き
  generated_by text check (generated_by in ('llm','template')),
  status      text default 'draft' check (status in ('draft','edited','sent','negotiating','won','lost')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists mishiru_articles (
  id           text primary key,
  lab_id       text references mishiru_labs(id),
  lab_name     text,
  title        text,
  writer       text,                      -- 学生ライター名（PII）
  status       text default 'idea'
                check (status in ('idea','assigned','draft','editing','professor_review','approved','published','rejected','archived')),
  return_reason text,                     -- 差戻し理由（professor_review→editing 必須）
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- 外部APIキャッシュ（NFR-EXT-01。v1で使用）
create table if not exists mishiru_api_cache (
  cache_key   text primary key,
  payload     jsonb,
  fetched_at  timestamptz default now(),
  expires_at  timestamptz
);

-- 監査ログ（法令対応記録）
create table if not exists mishiru_audit_logs (
  id          bigserial primary key,
  actor       text,
  action      text,
  target      text,
  detail      jsonb,
  at          timestamptz default now()
);

-- ============================================================================
-- RLS（M2で有効化。サーバーはSERVICE_ROLE_KEYでRLSをバイパスし、認可はAPI層で実施）
-- ============================================================================
alter table mishiru_labs           enable row level security;
alter table mishiru_theme_cards    enable row level security;
alter table mishiru_universities   enable row level security;
alter table mishiru_departments    enable row level security;
alter table mishiru_card_actions   enable row level security;
alter table mishiru_interest_profiles enable row level security;
alter table mishiru_claims         enable row level security;
alter table mishiru_leads          enable row level security;
alter table mishiru_reports        enable row level security;
alter table mishiru_articles       enable row level security;
alter table mishiru_events         enable row level security;
alter table mishiru_user_sessions enable row level security;
alter table mishiru_guest_usage enable row level security;
alter table mishiru_guest_usage_events enable row level security;
alter table mishiru_session_state enable row level security;
alter table mishiru_sources enable row level security;
alter table mishiru_api_cache enable row level security;
alter table mishiru_audit_logs enable row level security;

-- 公開読み取り：published/claimed の研究室・カード・マスタのみ（§7 決定表）
drop policy if exists "public read published labs" on mishiru_labs;
create policy "public read published labs" on mishiru_labs for select using (status in ('published','claimed'));
drop policy if exists "public read cards" on mishiru_theme_cards;
create policy "public read cards" on mishiru_theme_cards for select using (true);
drop policy if exists "public read universities" on mishiru_universities;
create policy "public read universities" on mishiru_universities for select using (true);
drop policy if exists "public read departments" on mishiru_departments;
create policy "public read departments" on mishiru_departments for select using (true);

-- 匿名フォーム投稿：Claimのみ許可（自由口コミは存在しない = PROH-03/Test-PROH-03）
drop policy if exists "anon insert claims" on mishiru_claims;
create policy "anon insert claims" on mishiru_claims for insert with check (true);

-- card_actions / interest_profiles / events：セッション本人のみ（アプリ側でsession_id一致を強制）
-- leads/reports/articles には公開ポリシーを作らない = admin(service role)のみ参照可（PII保護）。

commit;
