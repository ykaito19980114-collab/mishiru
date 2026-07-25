-- 研究室ページの掲載状態と、研究室ホームページの確認状態を分けて管理する。
-- 教員ページ・researchmap・部局一覧は evidence_url にのみ保存する。

alter table if exists mishiru_labs
  add column if not exists homepage_status text default 'pending',
  add column if not exists homepage_evidence_url text,
  add column if not exists homepage_checked_at timestamptz,
  add column if not exists quality_score integer default 0,
  add column if not exists quality_notes jsonb default '[]'::jsonb;

do $$
begin
  if to_regclass('public.mishiru_labs') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'mishiru_labs_homepage_status_check'
         and conrelid = 'public.mishiru_labs'::regclass
     ) then
    alter table mishiru_labs
      add constraint mishiru_labs_homepage_status_check
      check (homepage_status in ('pending','verified','unresolved','manual_hold','duplicate'));
  end if;

  if to_regclass('public.mishiru_labs') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'mishiru_labs_quality_score_check'
         and conrelid = 'public.mishiru_labs'::regclass
     ) then
    alter table mishiru_labs
      add constraint mishiru_labs_quality_score_check
      check (quality_score between 0 and 100);
  end if;
end $$;

create index if not exists idx_mishiru_labs_homepage_status
  on mishiru_labs (homepage_status);

create table if not exists mishiru_lab_publication_audits (
  lab_id          text primary key,
  source_no       text,
  homepage_url    text,
  evidence_url    text,
  outcome         text not null
                  check (outcome in ('verified','discovered','unresolved','manual_hold','duplicate')),
  confidence      integer not null default 0 check (confidence between 0 and 100),
  reasons         jsonb not null default '[]'::jsonb,
  checked_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_mishiru_lab_audits_outcome
  on mishiru_lab_publication_audits (outcome);

alter table mishiru_lab_publication_audits enable row level security;
revoke all on table mishiru_lab_publication_audits from anon, authenticated;

-- 掲載停止対象以外の公開ページは返す。研究室HPの確認状態は別項目で扱う。
drop policy if exists "public read published labs" on mishiru_labs;
create policy "public read published labs" on mishiru_labs for select using (
  status in ('published','claimed')
);

-- Supabaseをマスタへ移行する際も、公開状態のページを同じ条件で返す。
create or replace view mishiru_public_labs
with (security_invoker = true)
as
select *
from mishiru_labs
where status in ('published', 'claimed');

revoke all on table mishiru_public_labs from anon, authenticated;
