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
revoke all privileges on table mishiru_ai_usage_daily from anon, authenticated;
grant select, insert, update, delete on table mishiru_ai_usage_daily to service_role;

-- サーバーレスの複数インスタンスから同時記録されても取りこぼさない原子的加算。
create or replace function mishiru_record_ai_usage(
  p_day date,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_reasoning_tokens bigint,
  p_cached_tokens bigint,
  p_calls integer,
  p_failures integer
) returns void
language sql
security definer
set search_path = public
as $$
  insert into mishiru_ai_usage_daily (
    day, input_tokens, output_tokens, reasoning_tokens, cached_tokens, calls, failures, updated_at
  ) values (
    p_day,
    greatest(p_input_tokens, 0),
    greatest(p_output_tokens, 0),
    greatest(p_reasoning_tokens, 0),
    greatest(p_cached_tokens, 0),
    greatest(p_calls, 0),
    greatest(p_failures, 0),
    now()
  )
  on conflict (day) do update set
    input_tokens = mishiru_ai_usage_daily.input_tokens + excluded.input_tokens,
    output_tokens = mishiru_ai_usage_daily.output_tokens + excluded.output_tokens,
    reasoning_tokens = mishiru_ai_usage_daily.reasoning_tokens + excluded.reasoning_tokens,
    cached_tokens = mishiru_ai_usage_daily.cached_tokens + excluded.cached_tokens,
    calls = mishiru_ai_usage_daily.calls + excluded.calls,
    failures = mishiru_ai_usage_daily.failures + excluded.failures,
    updated_at = now();
$$;

revoke all on function mishiru_record_ai_usage(date,bigint,bigint,bigint,bigint,integer,integer)
  from public, anon, authenticated;
grant execute on function mishiru_record_ai_usage(date,bigint,bigint,bigint,bigint,integer,integer)
  to service_role;
