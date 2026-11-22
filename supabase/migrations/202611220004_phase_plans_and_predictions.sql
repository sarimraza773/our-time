begin;
create function public.valid_cycle_phase_lengths(value jsonb, total integer, bleeding integer, mode text) returns boolean
language plpgsql immutable set search_path='' as $$
declare part text; days integer; sum_days integer:=0;
begin
 if value is null then return true; end if;
 if jsonb_typeof(value)<>'object' or (select count(*) from jsonb_object_keys(value))<>4 or mode<>'manual' then return false; end if;
 foreach part in array array['menstruation','follicular','ovulation','luteal'] loop
  if jsonb_typeof(value->part) is distinct from 'number' then return false; end if;
  days:=(value->>part)::integer;
  if days<1 or days>90 then return false; end if;
  sum_days:=sum_days+days;
 end loop;
 return sum_days=total and (value->>'menstruation')::integer=bleeding;
exception when others then return false;
end; $$;
alter table public.cycle_settings add column auto_log_predictions boolean not null default true,
 add column phase_lengths jsonb,
 add constraint cycle_phase_lengths_valid check (public.valid_cycle_phase_lengths(phase_lengths,cycle_length,period_duration,estimate_mode));

create function public.valid_cycle_phase_plan(anchor date, value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb; phase_names text[]:=array['menstruation','follicular','ovulation','luteal']; i integer; first_day date; last_day date; previous_end date;
begin
 if anchor is null or anchor not between date '1900-01-01' and date '2199-12-31' or jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value)<>4 then return false; end if;
 for i in 0..3 loop
  item:=value->i;
  if not coalesce(jsonb_typeof(item)='object' and item->>'phase'=phase_names[i+1]
    and jsonb_typeof(item->'start_date')='string' and (item->>'start_date')~'^\d{4}-\d{2}-\d{2}$'
    and jsonb_typeof(item->'end_date')='string' and (item->>'end_date')~'^\d{4}-\d{2}-\d{2}$',false) then return false; end if;
  first_day:=(item->>'start_date')::date;last_day:=(item->>'end_date')::date;
  if first_day<anchor or last_day<first_day or last_day-anchor>119 or last_day>date '2199-12-31'
    or (i=0 and first_day<>anchor) or first_day<=previous_end then return false; end if;
  previous_end:=last_day;
 end loop;
 return true;
exception when others then return false;
end; $$;
create table public.cycle_phase_plans (
 user_id uuid not null references public.profiles(id) on delete cascade,
 cycle_start_date date not null,
 phases jsonb not null,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(user_id,cycle_start_date),
 check(public.valid_cycle_phase_plan(cycle_start_date,phases))
);
create table public.cycle_predictions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 anchor_start date not null check(anchor_start between date '1900-01-01' and date '2199-12-31'),
 start_date date not null check(start_date>anchor_start and start_date<=date '2199-12-31'),
 end_date date not null check(end_date>=start_date and end_date-start_date<30 and end_date<=date '2199-12-31'),
 status text not null default 'predicted' check(status in ('predicted','dismissed','confirmed','superseded')),
 confirmed_entry_id uuid references public.period_entries(id) on delete set null,
 updated_at timestamptz not null default clock_timestamp(),
 unique(user_id,anchor_start)
);
alter table public.cycle_phase_plans enable row level security;
alter table public.cycle_predictions enable row level security;
revoke all on public.cycle_phase_plans,public.cycle_predictions from public,anon,authenticated;
grant select on public.cycle_phase_plans,public.cycle_predictions to authenticated;
create policy linked_phase_read on public.cycle_phase_plans for select to authenticated using(user_id=(select public.cycle_tracker_owner_id()));
create policy linked_prediction_read on public.cycle_predictions for select to authenticated using(user_id=(select public.cycle_tracker_owner_id()));

-- Internal-only reconciler. Forecasts never enter actual period_entries or the
-- history estimator. One durable predicted log is created per actual-cycle anchor.
-- It is saved ahead of time; its dates make it active without a browser or cron job.
create function public.sync_cycle_predictions_for(target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare prefs public.cycle_settings%rowtype; anchor date; total_records integer; cycle_days integer; bleeding integer; expected date;
begin
 if not exists(select 1 from public.profiles where id=target and person_key='deena') then return; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target::text,220002));
 select * into prefs from public.cycle_settings where user_id=target;
 select count(*),max(start_date) into total_records,anchor from public.period_entries where user_id=target;
 update public.cycle_predictions set status='superseded',updated_at=clock_timestamp()
  where user_id=target and status='predicted' and (anchor_start is distinct from anchor or total_records<3 or prefs.auto_log_predictions=false);
 if total_records<3 or prefs.auto_log_predictions=false then return; end if;
 if prefs.estimate_mode='manual' then cycle_days:=prefs.cycle_length;
 else
  select round((percentile_cont(0.5) within group(order by days))::numeric)::integer into cycle_days
  from (select days from (select start_date,start_date-lag(start_date) over(order by start_date) as days from public.period_entries where user_id=target) all_lengths where days is not null order by start_date desc limit 6) lengths;
 end if;
 bleeding:=coalesce(prefs.period_duration,5);
 if cycle_days is null or cycle_days<10 or cycle_days>120 then return; end if;
 expected:=case when prefs.override_anchor=anchor and prefs.expected_next_date is not null then prefs.expected_next_date else anchor+cycle_days end;
 if prefs.override_anchor=anchor and prefs.missed_prediction_on is not null and expected<=prefs.missed_prediction_on then
  update public.cycle_predictions set status='superseded',updated_at=clock_timestamp() where user_id=target and anchor_start=anchor and status='predicted';return;
 end if;
 if expected+bleeding-1>date '2199-12-31' then return; end if;
 insert into public.cycle_predictions(user_id,anchor_start,start_date,end_date) values(target,anchor,expected,expected+bleeding-1)
 on conflict(user_id,anchor_start) do update set start_date=excluded.start_date,end_date=excluded.end_date,status='predicted',updated_at=clock_timestamp()
 where (cycle_predictions.status in ('predicted','superseded') or (cycle_predictions.status='dismissed' and cycle_predictions.start_date<>excluded.start_date)) and
  (cycle_predictions.start_date,cycle_predictions.end_date,cycle_predictions.status) is distinct from (excluded.start_date,excluded.end_date,'predicted');
end; $$;
revoke all on function public.sync_cycle_predictions_for(uuid) from public,anon,authenticated;
create function public.sync_cycle_predictions() returns void
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 target:=public.cycle_tracker_owner_id();
 if target is null then raise exception 'Linked tracker access required' using errcode='42501'; end if;
 perform public.sync_cycle_predictions_for(target);
end; $$;
revoke all on function public.sync_cycle_predictions() from public,anon;
grant execute on function public.sync_cycle_predictions() to authenticated;
create function public.refresh_cycle_predictions_after_write() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform public.sync_cycle_predictions_for(case when tg_op='DELETE' then old.user_id else new.user_id end);
 return null;
end; $$;
revoke all on function public.refresh_cycle_predictions_after_write() from public,anon,authenticated;
create trigger period_prediction_sync after insert or update or delete on public.period_entries for each row execute function public.refresh_cycle_predictions_after_write();
create trigger settings_prediction_sync after insert or update or delete on public.cycle_settings for each row execute function public.refresh_cycle_predictions_after_write();

create function public.save_cycle_phase_plan(p_cycle_start date,p_phases jsonb,p_use_for_future boolean,p_expected_updated_at timestamptz default null) returns void
language plpgsql security definer set search_path='' as $$
declare target uuid; existing_stamp timestamptz; lengths jsonb:='{}'; item jsonb; total integer:=0; days integer; bleeding integer;
begin
 target:=public.cycle_tracker_owner_id();
 if target is null then raise exception 'Linked tracker access required' using errcode='42501'; end if;
 if not public.valid_cycle_phase_plan(p_cycle_start,p_phases) then raise exception 'Invalid phase dates' using errcode='23514'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target::text,220002));
 select updated_at into existing_stamp from public.cycle_phase_plans where user_id=target and cycle_start_date=p_cycle_start for update;
 if existing_stamp is distinct from p_expected_updated_at then raise exception 'Phase plan changed; refresh before saving' using errcode='40001'; end if;
 insert into public.cycle_phase_plans(user_id,cycle_start_date,phases) values(target,p_cycle_start,p_phases)
 on conflict(user_id,cycle_start_date) do update set phases=excluded.phases,updated_at=clock_timestamp();
 if p_use_for_future then
  for item in select * from jsonb_array_elements(p_phases) loop
   days:=(item->>'end_date')::date-(item->>'start_date')::date+1;total:=total+days;
   lengths:=lengths||jsonb_build_object(item->>'phase',days);
  end loop;
  bleeding:=(lengths->>'menstruation')::integer;
  if total<10 or total>120 or bleeding>30 then raise exception 'Invalid future phase durations' using errcode='23514'; end if;
  insert into public.cycle_settings(user_id,cycle_length,period_duration,luteal_length,estimate_mode,phase_lengths)
   values(target,total,bleeding,least(14,total-1),'manual',lengths)
  on conflict(user_id) do update set cycle_length=excluded.cycle_length,period_duration=excluded.period_duration,
   luteal_length=least(cycle_settings.luteal_length,total-1),estimate_mode='manual',phase_lengths=excluded.phase_lengths,
   expected_next_date=null,override_anchor=null,missed_prediction_on=null;
 end if;
end; $$;
revoke all on function public.save_cycle_phase_plan(date,jsonb,boolean,timestamptz) from public,anon;
grant execute on function public.save_cycle_phase_plan(date,jsonb,boolean,timestamptz) to authenticated;
create function public.delete_cycle_phase_plan(p_cycle_start date,p_expected_updated_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 target:=public.cycle_tracker_owner_id();
 if target is null then raise exception 'Linked tracker access required' using errcode='42501'; end if;
 delete from public.cycle_phase_plans where user_id=target and cycle_start_date=p_cycle_start and updated_at=p_expected_updated_at;
 if not found then raise exception 'Phase plan changed; refresh before deleting' using errcode='40001'; end if;
end; $$;
revoke all on function public.delete_cycle_phase_plan(date,timestamptz) from public,anon;
grant execute on function public.delete_cycle_phase_plan(date,timestamptz) to authenticated;
create function public.dismiss_cycle_prediction(p_id uuid,p_expected_updated_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 target:=public.cycle_tracker_owner_id();
 if target is null then raise exception 'Linked tracker access required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target::text,220002));
 update public.cycle_predictions set status='dismissed',updated_at=clock_timestamp() where id=p_id and user_id=target and updated_at=p_expected_updated_at and status='predicted';
 if not found then raise exception 'Prediction changed; refresh before dismissing' using errcode='40001'; end if;
end; $$;
revoke all on function public.dismiss_cycle_prediction(uuid,timestamptz) from public,anon;
grant execute on function public.dismiss_cycle_prediction(uuid,timestamptz) to authenticated;
create function public.confirm_cycle_prediction(p_id uuid,p_start date,p_end date,p_notes text,p_expected_updated_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare target uuid; prediction public.cycle_predictions%rowtype; entry_id uuid;
begin
 target:=public.cycle_tracker_owner_id();
 if target is null then raise exception 'Linked tracker access required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target::text,220002));
 select * into prediction from public.cycle_predictions where id=p_id and user_id=target for update;
 if prediction.id is null or prediction.status<>'predicted' or prediction.updated_at is distinct from p_expected_updated_at then raise exception 'Prediction changed; refresh before confirming' using errcode='40001'; end if;
 if p_start<=prediction.anchor_start then raise exception 'Actual start must follow the previous recorded start' using errcode='23514'; end if;
 insert into public.period_entries(user_id,start_date,end_date,notes) values(target,p_start,p_end,p_notes) returning id into entry_id;
 update public.cycle_predictions set status='confirmed',confirmed_entry_id=entry_id,updated_at=clock_timestamp() where id=p_id;
end; $$;
revoke all on function public.confirm_cycle_prediction(uuid,date,date,text,timestamptz) from public,anon;
grant execute on function public.confirm_cycle_prediction(uuid,date,date,text,timestamptz) to authenticated;
create or replace function public.delete_cycle_tracker_data() returns void
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 target:=public.cycle_tracker_owner_id();
 if target is null then raise exception 'Linked tracker access required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target::text,220002));
 delete from public.period_entries where user_id=target;
 delete from public.cycle_settings where user_id=target;
 delete from public.cycle_phase_plans where user_id=target;
 delete from public.cycle_predictions where user_id=target;
end; $$;
-- Do not prefill existing users' histories during migration. Refresh/write hooks
-- reconcile the next forecast after the deployed client loads this schema.
commit;
