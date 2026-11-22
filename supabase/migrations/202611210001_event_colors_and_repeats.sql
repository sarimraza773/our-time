begin;

alter table public.calendar_events
  add column color text check (color in ('blush','rose','peony','mauve','shell','berry'));

alter table public.recurring_rules
  add column color text check (color in ('blush','rose','peony','mauve','shell','berry')),
  add column start_date date check (start_date between date '0001-01-01' and date '9999-12-31'),
  add column end_date date check (end_date between date '0001-01-01' and date '9999-12-31'),
  add column repeat_interval integer not null default 1 check (repeat_interval between 1 and 999),
  drop constraint recurring_rules_pattern_check,
  add constraint recurring_rules_pattern_check check (
    (start_date is null and end_date is null and repeat_interval = 1 and pattern in ('daily','weekdays','weekly','custom'))
    or (start_date is not null and (end_date is null or end_date >= start_date) and pattern in ('daily','weekly','monthly','yearly'))
  );

alter table public.recurring_exceptions
  add constraint recurring_exceptions_color_check check (replacement_event->>'color' in ('blush','rose','peony','mauve','shell','berry'));

-- The snapshot already serializes each whole row. Extend the existing atomic
-- device import to copy the new fields while accepting older device backups.
create or replace function public.import_local_calendar(p_calendar_id uuid, p_events jsonb, p_rules jsonb, p_exceptions jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare item jsonb;
begin
  if not public.is_calendar_member(p_calendar_id) then raise exception 'Calendar membership required' using errcode='42501'; end if;
  perform 1 from public.shared_calendars where id=p_calendar_id for update;
  if exists(select 1 from public.shared_calendars where id=p_calendar_id and local_import_completed_at is not null)
    or exists(select 1 from public.calendar_events where calendar_id=p_calendar_id)
    or exists(select 1 from public.recurring_rules where calendar_id=p_calendar_id)
    or exists(select 1 from public.recurring_exceptions where calendar_id=p_calendar_id) then
    raise exception 'The shared calendar is no longer empty. Refresh to see its latest schedule.';
  end if;
  if jsonb_typeof(p_events) is distinct from 'array' or jsonb_typeof(p_rules) is distinct from 'array' or jsonb_typeof(p_exceptions) is distinct from 'array' then
    raise exception 'Invalid import data';
  end if;
  for item in select * from jsonb_array_elements(p_rules) loop
    insert into public.recurring_rules(id,calendar_id,owner_user_id,owner_person_key,title,category,timezone,local_start_time,local_end_time,pattern,weekdays,enabled,notes,open_to_study_together,
      color,start_date,end_date,repeat_interval)
    values(item->>'id',p_calendar_id,(item->>'owner_user_id')::uuid,item->>'owner_person_key',item->>'title',item->>'category',item->>'timezone',
      (item->>'local_start_time')::time,(item->>'local_end_time')::time,item->>'pattern',array(select jsonb_array_elements_text(item->'weekdays')::integer),
      (item->>'enabled')::boolean,item->>'notes',(item->>'open_to_study_together')::boolean,
      item->>'color',(item->>'start_date')::date,(item->>'end_date')::date,coalesce((item->>'repeat_interval')::integer,1));
  end loop;
  for item in select * from jsonb_array_elements(p_events) loop
    insert into public.calendar_events(id,calendar_id,owner_user_id,owner_person_key,title,category,start_utc,end_utc,timezone,notes,open_to_study_together,color)
    values(item->>'id',p_calendar_id,(item->>'owner_user_id')::uuid,item->>'owner_person_key',item->>'title',item->>'category',
      (item->>'start_utc')::timestamptz,(item->>'end_utc')::timestamptz,item->>'timezone',item->>'notes',(item->>'open_to_study_together')::boolean,item->>'color');
  end loop;
  for item in select * from jsonb_array_elements(p_exceptions) loop
    insert into public.recurring_exceptions(calendar_id,recurring_rule_id,occurrence_key,exception_type,replacement_event)
    values(p_calendar_id,item->>'recurring_rule_id',(item->>'occurrence_key')::date,item->>'exception_type',nullif(item->'replacement_event','null'::jsonb));
  end loop;
  update public.shared_calendars set local_import_completed_at=clock_timestamp() where id=p_calendar_id;
end;
$$;

commit;
