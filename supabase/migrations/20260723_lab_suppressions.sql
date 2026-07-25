create table if not exists public.mishiru_content_suppressions (
  id                    text primary key,
  lab_id                text not null unique,
  source_no             text,
  reason                text not null,
  suppress_publication  boolean not null default true,
  suppress_contact      boolean not null default true,
  requested_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.mishiru_content_suppressions enable row level security;
revoke all on table public.mishiru_content_suppressions from anon, authenticated;

insert into public.mishiru_content_suppressions (
  id,
  lab_id,
  source_no,
  reason,
  suppress_publication,
  suppress_contact,
  requested_at,
  updated_at
) values (
  'suppression-lab-1291',
  'lab-1291',
  '1291',
  '研究室関係者から掲載停止および連絡停止の依頼を受領',
  true,
  true,
  '2026-07-23T00:00:00+09:00',
  now()
)
on conflict (lab_id) do update set
  reason = excluded.reason,
  suppress_publication = true,
  suppress_contact = true,
  requested_at = excluded.requested_at,
  updated_at = now();

insert into public.mishiru_audit_logs (actor, action, target, detail)
values (
  'support',
  'content_takedown',
  'lab-1291',
  jsonb_build_object(
    'source_no', '1291',
    'publication_suppressed', true,
    'contact_suppressed', true,
    'requested_at', '2026-07-23'
  )
);
