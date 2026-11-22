begin;
-- Existing profiles are provisioned by an administrator; authenticated clients
-- have no profile INSERT/UPDATE privileges. Never trust the visual perspective.
create function public.is_private_cycle_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and person_key = 'deena');
$$;
revoke all on function public.is_private_cycle_owner() from public, anon;
grant execute on function public.is_private_cycle_owner() to authenticated;

create table public.period_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  start_date date not null check (start_date between date '1900-01-01' and date '2199-12-31'),
  end_date date check (end_date between date '1900-01-01' and date '2199-12-31' and end_date >= start_date and end_date - start_date <= 120),
  notes text not null default '' check (length(notes) <= 2000),
  updated_at timestamptz not null default clock_timestamp(),
  unique(user_id, start_date)
);
create table public.cycle_settings (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  cycle_length integer not null default 28 check (cycle_length between 10 and 120),
  period_duration integer not null default 5 check (period_duration between 1 and 30 and period_duration < cycle_length),
  luteal_length integer not null default 14 check (luteal_length between 5 and 25 and luteal_length < cycle_length),
  estimate_mode text not null default 'history' check (estimate_mode in ('history','manual')),
  expected_next_date date check (expected_next_date between date '1900-01-01' and date '2199-12-31'),
  override_anchor date check (override_anchor between date '1900-01-01' and date '2199-12-31'),
  missed_prediction_on date check (missed_prediction_on between date '1900-01-01' and date '2199-12-31'),
  updated_at timestamptz not null default clock_timestamp(),
  check (expected_next_date is null or (override_anchor is not null and expected_next_date > override_anchor)),
  check (missed_prediction_on is null or override_anchor is not null)
);
-- Serialize writes per owner, including concurrent inserts from separate devices.
-- No sensitive payload is broadcast to shared-calendar Realtime topics.
create function public.validate_private_cycle_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target uuid; latest_start date;
begin
  target := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target::text, 220002));
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or (tg_table_name = 'period_entries' and to_jsonb(new)->>'id' is distinct from to_jsonb(old)->>'id')) then
    raise exception 'Record ownership and identity cannot change' using errcode='23514';
  end if;
  if tg_table_name = 'period_entries' then
    if new.start_date > (current_timestamp at time zone 'Asia/Kuala_Lumpur')::date
      or new.end_date > (current_timestamp at time zone 'Asia/Kuala_Lumpur')::date then
      raise exception 'Actual periods cannot be recorded in the future' using errcode='23514';
    end if;
    if exists(select 1 from public.period_entries e where e.user_id = target and e.id <> new.id
      and daterange(e.start_date,e.end_date,'[]') && daterange(new.start_date,new.end_date,'[]')) then
      raise exception 'Period records cannot overlap; end or correct the earlier entry first' using errcode='23514';
    end if;
  else
    select max(start_date) into latest_start from public.period_entries where user_id=target;
    if (new.expected_next_date is not null or new.missed_prediction_on is not null) and new.override_anchor is distinct from latest_start then
      raise exception 'Refresh before adjusting the latest cycle' using errcode='23514';
    end if;
    if new.missed_prediction_on > (current_timestamp at time zone 'Asia/Kuala_Lumpur')::date then
      raise exception 'A future prediction cannot be marked missed' using errcode='23514';
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.validate_private_cycle_write() from public, anon, authenticated;
create trigger period_write before insert or update or delete on public.period_entries for each row execute function public.validate_private_cycle_write();
create trigger cycle_write before insert or update or delete on public.cycle_settings for each row execute function public.validate_private_cycle_write();
alter table public.period_entries enable row level security;
alter table public.cycle_settings enable row level security;
revoke all on public.period_entries, public.cycle_settings from public, anon, authenticated;
grant select,insert,update,delete on public.period_entries, public.cycle_settings to authenticated;
create policy private_period_owner on public.period_entries for all to authenticated
  using (user_id=(select auth.uid()) and (select public.is_private_cycle_owner()))
  with check (user_id=(select auth.uid()) and (select public.is_private_cycle_owner()));
create policy private_settings_owner on public.cycle_settings for all to authenticated
  using (user_id=(select auth.uid()) and (select public.is_private_cycle_owner()))
  with check (user_id=(select auth.uid()) and (select public.is_private_cycle_owner()));
-- A single transaction deletes all health records/settings; it cannot target a peer.
create function public.delete_my_cycle_data() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_private_cycle_owner() then raise exception 'Private tracker access required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended((select auth.uid())::text,220002));
  delete from public.period_entries where user_id=(select auth.uid());
  delete from public.cycle_settings where user_id=(select auth.uid());
end;
$$;
revoke all on function public.delete_my_cycle_data() from public, anon;
grant execute on function public.delete_my_cycle_data() to authenticated;
commit;
