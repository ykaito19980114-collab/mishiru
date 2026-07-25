insert into public.mishiru_content_suppressions (
  id,
  lab_id,
  source_no,
  reason,
  suppress_publication,
  suppress_contact,
  requested_at,
  updated_at
)
select
  'suppression-' || request.lab_id,
  request.lab_id,
  request.source_no,
  request.reason,
  true,
  true,
  '2026-07-23T00:00:00+09:00'::timestamptz,
  now()
from (
  values
    ('lab-874', '874', '研究室関係者から掲載停止および連絡停止の依頼を受領'),
    ('lab-1291', '1291', '研究室関係者から掲載停止および連絡停止の依頼を受領'),
    ('lab-6736', '6736', '研究室関係者から掲載停止および連絡停止の依頼を受領'),
    ('lab-8036', '8036', '研究室閉鎖に伴う掲載停止および連絡停止の依頼を受領'),
    ('lab-10504', '10504', '大学規則上の営業連絡辞退を受領したため掲載および連絡を停止'),
    ('lab-12172', '12172', '研究室関係者から掲載停止および連絡停止の依頼を受領'),
    ('lab-12280', '12280', '研究室関係者から掲載停止および連絡停止の依頼を受領'),
    ('lab-13850', '13850', '研究室関係者から掲載停止および連絡停止の依頼を受領')
) as request(lab_id, source_no, reason)
on conflict (lab_id) do update set
  source_no = excluded.source_no,
  reason = excluded.reason,
  suppress_publication = true,
  suppress_contact = true,
  requested_at = excluded.requested_at,
  updated_at = now();

insert into public.mishiru_audit_logs (actor, action, target, detail)
select
  'support',
  'content_takedown',
  request.lab_id,
  jsonb_build_object(
    'source_no', request.source_no,
    'publication_suppressed', true,
    'contact_suppressed', true,
    'requested_at', '2026-07-23'
  )
from (
  values
    ('lab-874', '874'),
    ('lab-1291', '1291'),
    ('lab-6736', '6736'),
    ('lab-8036', '8036'),
    ('lab-10504', '10504'),
    ('lab-12172', '12172'),
    ('lab-12280', '12280'),
    ('lab-13850', '13850')
) as request(lab_id, source_no);
