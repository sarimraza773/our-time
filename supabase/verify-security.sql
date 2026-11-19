-- Optional administrator audit, after approval to connect. Read-only; no photo/event contents.
begin read only;
select c.relname as table_name, c.relrowsecurity as rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_select_grant,
  has_table_privilege('authenticated', c.oid, 'INSERT') as browser_insert_grant,
  has_table_privilege('authenticated', c.oid, 'UPDATE') as browser_update_grant,
  has_table_privilege('authenticated', c.oid, 'DELETE') as browser_delete_grant
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
  ('profiles','shared_calendars','calendar_members','calendar_events','recurring_rules','recurring_exceptions','photo_memories','photo_contributions','bookshelf_titles','diary_entries')
order by c.relname;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where
  (schemaname='public' and tablename in ('profiles','shared_calendars','calendar_members','calendar_events','recurring_rules','recurring_exceptions','photo_memories','photo_contributions','bookshelf_titles','diary_entries'))
  or (schemaname in ('storage','realtime') and policyname like 'our_time%')
order by schemaname,tablename,policyname;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id='our-time-memories';

select p.person_key, p.id=auth_user.id as auth_user_exists,
  auth_user.email_confirmed_at is not null as email_confirmed, m.calendar_id, m.role
from public.profiles p join auth.users auth_user on auth_user.id=p.id
join public.calendar_members m on m.user_id=p.id order by p.person_key;

select 'profiles' as entity, count(*) as total from public.profiles
union all select 'shared_calendars', count(*) from public.shared_calendars
union all select 'calendar_members', count(*) from public.calendar_members;
commit;
