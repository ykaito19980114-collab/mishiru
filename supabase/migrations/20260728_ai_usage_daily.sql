-- ADR-010: AIトークン使用量の日次集計（管理画面の今日/今月/累計表示の永続元）
-- mishiru_api_cacheはTTL付きキャッシュ表でパージで消えうるため、専用の小テーブルに分離する
create table if not exists mishiru_ai_usage_daily (
  day              date primary key,
  input_tokens     bigint not null default 0,
  output_tokens    bigint not null default 0,
  reasoning_tokens bigint not null default 0,
  cached_tokens    bigint not null default 0,
  calls            integer not null default 0,
  failures         integer not null default 0,
  updated_at       timestamptz default now()
);
alter table mishiru_ai_usage_daily enable row level security;
-- 公開ポリシーは作らない = service_role のみ読み書き可（運営コスト情報）
