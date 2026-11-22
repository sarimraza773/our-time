begin;
-- Both linked accounts edit the same Deena-owned tracker. Resolve ownership
-- from protected profiles/memberships, never a browser UUID or perspective.
create function public.cycle_tracker_owner_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select owner.id from public.profiles owner where owner.person_key = 'deena'
    and (owner.id = (select auth.uid()) or (
      exists(select 1 from public.profiles viewer where viewer.id=(select auth.uid()) and viewer.person_key='sarim')
      and public.is_calendar_peer(owner.id)
    ));
$$;
revoke all on function public.cycle_tracker_owner_id() from public, anon;
grant execute on function public.cycle_tracker_owner_id() to authenticated;

drop policy private_period_owner on public.period_entries;
drop policy private_settings_owner on public.cycle_settings;
create policy linked_cycle_editors on public.period_entries for all to authenticated
  using (user_id=(select public.cycle_tracker_owner_id()))
  with check (user_id=(select public.cycle_tracker_owner_id()));
create policy linked_cycle_editors on public.cycle_settings for all to authenticated
  using (user_id=(select public.cycle_tracker_owner_id()))
  with check (user_id=(select public.cycle_tracker_owner_id()));
-- Keep all previous date/identity/overlap validation and optimistic timestamps.
-- No rows are copied, rewritten or made public; ownership remains Deena's.
create function public.delete_cycle_tracker_data() returns void
language plpgsql security invoker set search_path = '' as $$
declare target uuid;
begin
  target := public.cycle_tracker_owner_id();
  if target is null then raise exception 'Linked tracker access required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target::text,220002));
  delete from public.period_entries where user_id=target;
  delete from public.cycle_settings where user_id=target;
end;
$$;
revoke all on function public.delete_cycle_tracker_data() from public, anon;
grant execute on function public.delete_cycle_tracker_data() to authenticated;
commit;
