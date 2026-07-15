-- MISHIRU schema verification (read-only)
-- schema.sql 実行後、Supabase SQL Editorで実行する。

do $$
declare
  missing_tables text;
  rls_disabled text;
begin
  select string_agg(required.name, ', ')
  into missing_tables
  from (values
    ('mishiru_universities'), ('mishiru_departments'), ('mishiru_labs'),
    ('mishiru_theme_cards'), ('mishiru_sources'), ('mishiru_card_actions'),
    ('mishiru_interest_profiles'), ('mishiru_events'), ('mishiru_user_sessions'),
    ('mishiru_guest_usage'), ('mishiru_guest_usage_events'), ('mishiru_session_state'),
    ('mishiru_claims'), ('mishiru_leads'), ('mishiru_reports'), ('mishiru_articles'),
    ('mishiru_api_cache'), ('mishiru_audit_logs')
  ) as required(name)
  where to_regclass('public.' || required.name) is null;

  if missing_tables is not null then
    raise exception 'Missing MISHIRU tables: %', missing_tables;
  end if;

  select string_agg(c.relname, ', ')
  into rls_disabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname like 'mishiru\_%' escape '\'
    and not c.relrowsecurity;

  if rls_disabled is not null then
    raise exception 'RLS disabled: %', rls_disabled;
  end if;

  if to_regprocedure('public.mishiru_consume_guest_action(text,text,integer)') is null then
    raise exception 'Missing function: mishiru_consume_guest_action(text,text,integer)';
  end if;
end;
$$;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  coalesce(string_agg(p.policyname, ', ' order by p.policyname) filter (where p.policyname is not null), 'service_role only') as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname like 'mishiru\_%' escape '\'
group by c.relname, c.relrowsecurity
order by c.relname;
