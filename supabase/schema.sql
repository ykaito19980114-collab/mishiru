-- ============================================================================
-- OpenLab schema v2  （docs/03 §5 データ仕様 / DB-01 準拠）
-- M2でSupabaseを有効化する際に実行する。v0はローカルJSONストア（ADR-002）で動作。
-- 個人情報テーブル（claims/leads/reports/articles）は管理権限のみ参照可（§7）。
-- ============================================================================

-- ---------- マスタ：大学・専攻・研究室・カード ----------
create table if not exists universities (
  id          text primary key,          -- slug 例: osaka-university
  name        text not null,
  prefecture  text,
  region      text,
  website     text,
  created_at  timestamptz default now()
);

create table if not exists departments (
  id          text primary key,
  university_id text references universities(id),
  name        text not null,             -- 研究科・専攻
  created_at  timestamptz default now()
);

create table if not exists labs (
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
create index if not exists idx_labs_area on labs using gin (area_tags);
create index if not exists idx_labs_keywords on labs using gin (keywords);
create index if not exists idx_labs_status on labs (status);

create table if not exists theme_cards (
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
create index if not exists idx_cards_area on theme_cards using gin (area_tags);

-- 出典（研究室のsourcesはjsonbに内包。独立参照が必要なら使用）
create table if not exists sources (
  id          bigserial primary key,
  lab_id      text references labs(id) on delete cascade,
  label       text not null,
  url         text not null,
  confirmed_at date,
  created_at  timestamptz default now()
);

-- ---------- 学生セッション系（個人関連情報。匿名sessionId） ----------
create table if not exists card_actions (
  action_id   text primary key,          -- クライアント生成UUID（冪等キー AC-10）
  session_id  text not null,
  card_id     text not null references theme_cards(id),
  action      text not null check (action in ('like','skip','deep','save')),
  created_at  timestamptz default now()
);
create index if not exists idx_actions_session on card_actions (session_id);

create table if not exists interest_profiles (
  session_id     text primary key,
  generated_at   timestamptz default now(),
  evaluated_count int,
  top_areas      jsonb,
  method_preference jsonb,
  orientation    real,
  candidate_fields text[],
  summary        text
);

create table if not exists events (
  id          bigserial primary key,
  type        text not null,             -- card_action/profile_generated/lab_view/outbound_click/session_start
  session_id  text,
  payload     jsonb,
  at          timestamptz default now()
);
create index if not exists idx_events_type_at on events (type, at);

-- ---------- 運営系（個人情報：admin専用） ----------
create table if not exists claims (
  id          text primary key,
  type        text check (type in ('fix','takedown','claim','other')),
  lab_id      text references labs(id),
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

create table if not exists leads (
  id             text primary key,
  university     text,
  department     text,
  lab_name       text,
  lab_id         text references labs(id),
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

create table if not exists reports (
  id          text primary key,
  lab_id      text references labs(id),
  lab_name    text,
  researcher  text,
  source_url  text,
  content     text,                       -- Markdown下書き
  generated_by text check (generated_by in ('llm','template')),
  status      text default 'draft' check (status in ('draft','edited','sent','negotiating','won','lost')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists articles (
  id           text primary key,
  lab_id       text references labs(id),
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
create table if not exists api_cache (
  cache_key   text primary key,
  payload     jsonb,
  fetched_at  timestamptz default now(),
  expires_at  timestamptz
);

-- 監査ログ（法令対応記録）
create table if not exists audit_logs (
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
alter table labs           enable row level security;
alter table theme_cards    enable row level security;
alter table universities   enable row level security;
alter table departments    enable row level security;
alter table card_actions   enable row level security;
alter table interest_profiles enable row level security;
alter table claims         enable row level security;
alter table leads          enable row level security;
alter table reports        enable row level security;
alter table articles       enable row level security;
alter table events         enable row level security;

-- 公開読み取り：published/claimed の研究室・カード・マスタのみ（§7 決定表）
drop policy if exists "public read published labs" on labs;
create policy "public read published labs" on labs for select using (status in ('published','claimed'));
drop policy if exists "public read cards" on theme_cards;
create policy "public read cards" on theme_cards for select using (true);
drop policy if exists "public read universities" on universities;
create policy "public read universities" on universities for select using (true);
drop policy if exists "public read departments" on departments;
create policy "public read departments" on departments for select using (true);

-- 匿名フォーム投稿：Claimのみ許可（自由口コミは存在しない = PROH-03/Test-PROH-03）
drop policy if exists "anon insert claims" on claims;
create policy "anon insert claims" on claims for insert with check (true);

-- card_actions / interest_profiles / events：セッション本人のみ（アプリ側でsession_id一致を強制）
-- leads/reports/articles には公開ポリシーを作らない = admin(service role)のみ参照可（PII保護）。
