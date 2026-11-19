-- Apply once in the Supabase SQL editor (or with the Supabase migration CLI).
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  person_key text not null unique check (person_key in ('deena', 'sarim')),
  timezone text not null check (timezone in ('Asia/Kuala_Lumpur', 'America/New_York')),
  created_at timestamptz not null default now(),
  unique (id, person_key)
);
create table public.shared_calendars (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  local_import_completed_at timestamptz
);
create table public.calendar_members (
  calendar_id uuid not null references public.shared_calendars(id) on delete cascade,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  role text not null default 'editor' check (role = 'editor'),
  primary key (calendar_id, user_id)
);

create table public.calendar_events (
  -- Text IDs intentionally preserve existing device IDs, scoped by calendar.
  id text not null check (length(id) between 1 and 200 and id not like 'rule:%'),
  calendar_id uuid not null references public.shared_calendars(id) on delete cascade,
  owner_user_id uuid not null,
  owner_person_key text not null,
  title text not null check (length(trim(title)) between 1 and 300),
  category text not null check (category in ('class','study','sleep','friends','food','freeTime','personal','dateNight','call','sharedTime')),
  start_utc timestamptz not null,
  end_utc timestamptz not null check (end_utc > start_utc),
  timezone text not null check (timezone in ('Asia/Kuala_Lumpur','America/New_York')),
  notes text not null default '' check (length(notes) <= 10000),
  open_to_study_together boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (calendar_id, id),
  foreign key (calendar_id, owner_user_id) references public.calendar_members(calendar_id, user_id),
  foreign key (owner_user_id, owner_person_key) references public.profiles(id, person_key)
);
create table public.recurring_rules (
  id text not null check (length(id) between 1 and 200),
  calendar_id uuid not null references public.shared_calendars(id) on delete cascade,
  owner_user_id uuid not null,
  owner_person_key text not null,
  title text not null check (length(trim(title)) between 1 and 300),
  category text not null check (category in ('class','study','sleep','friends','food','freeTime','personal','dateNight','call','sharedTime')),
  timezone text not null check (timezone in ('Asia/Kuala_Lumpur','America/New_York')),
  local_start_time time not null check (local_start_time < time '24:00' and extract(second from local_start_time) = 0),
  local_end_time time not null check (local_end_time < time '24:00' and extract(second from local_end_time) = 0),
  pattern text not null check (pattern in ('daily','weekdays','weekly','custom')),
  weekdays integer[] not null default '{}' check (weekdays <@ array[1,2,3,4,5,6,7] and array_position(weekdays, null) is null and cardinality(weekdays) <= 7),
  enabled boolean not null default true,
  notes text not null default '' check (length(notes) <= 10000),
  open_to_study_together boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (calendar_id, id),
  foreign key (calendar_id, owner_user_id) references public.calendar_members(calendar_id, user_id),
  foreign key (owner_user_id, owner_person_key) references public.profiles(id, person_key)
);

-- Validate a replacement as strictly as an ordinary event. Invalid casts fail closed.
create function public.valid_event_replacement(value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  return coalesce(
    jsonb_typeof(value) = 'object'
    and jsonb_typeof(value->'title') = 'string' and length(trim(value->>'title')) between 1 and 300
    and value->>'category' in ('class','study','sleep','friends','food','freeTime','personal','dateNight','call','sharedTime')
    and value->>'timezone' in ('Asia/Kuala_Lumpur','America/New_York')
    and value->>'owner_person_key' in ('deena','sarim')
    and (value->>'owner_user_id')::uuid is not null
    and (value->>'start_utc') ~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
    and (value->>'end_utc') ~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
    and (value->>'end_utc')::timestamptz > (value->>'start_utc')::timestamptz
    and jsonb_typeof(value->'notes') = 'string' and length(value->>'notes') <= 10000
    and jsonb_typeof(value->'open_to_study_together') = 'boolean', false);
exception when others then return false;
end;
$$;
create table public.recurring_exceptions (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null,
  recurring_rule_id text not null,
  occurrence_key date not null,
  exception_type text not null check (exception_type in ('deleted','override')),
  replacement_event jsonb,
  owner_user_id uuid generated always as ((replacement_event->>'owner_user_id')::uuid) stored,
  owner_person_key text generated always as (replacement_event->>'owner_person_key') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calendar_id, recurring_rule_id, occurrence_key),
  foreign key (calendar_id, recurring_rule_id) references public.recurring_rules(calendar_id, id) on delete cascade,
  foreign key (calendar_id, owner_user_id) references public.calendar_members(calendar_id, user_id),
  foreign key (owner_user_id, owner_person_key) references public.profiles(id, person_key),
  check ((exception_type = 'deleted' and replacement_event is null)
    or (exception_type = 'override' and replacement_event is not null and public.valid_event_replacement(replacement_event)))
);

create index calendar_events_owner_idx on public.calendar_events(owner_user_id);
create index calendar_events_start_idx on public.calendar_events(calendar_id, start_utc);
create index recurring_rules_owner_idx on public.recurring_rules(owner_user_id);
create index recurring_exceptions_rule_idx on public.recurring_exceptions(recurring_rule_id);
create index recurring_exceptions_owner_idx on public.recurring_exceptions(owner_user_id);

-- All mutations take the calendar lock used by the import, including ordinary inserts.
-- This prevents a second client from writing into an import's empty-calendar check.
create function public.stamp_calendar_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.calendar_id <> old.calendar_id then raise exception 'Calendar identity cannot change'; end if;
    if new.id <> old.id then raise exception 'Entry identity cannot change'; end if;
    if tg_table_name = 'recurring_exceptions' then
      if new.recurring_rule_id <> old.recurring_rule_id or new.occurrence_key <> old.occurrence_key then
        raise exception 'Occurrence identity cannot change';
      end if;
    end if;
    new.created_at = old.created_at;
  end if;
  perform 1 from public.shared_calendars where id = case when tg_op = 'DELETE' then old.calendar_id else new.calendar_id end for update;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'INSERT' then new.created_at = clock_timestamp(); end if;
  new.updated_at = clock_timestamp();
  return new;
end;
$$;
create trigger stamp_event before insert or update or delete on public.calendar_events for each row execute function public.stamp_calendar_write();
create trigger stamp_rule before insert or update or delete on public.recurring_rules for each row execute function public.stamp_calendar_write();
create trigger stamp_exception before insert or update or delete on public.recurring_exceptions for each row execute function public.stamp_calendar_write();

-- Narrow helpers avoid recursive membership RLS. Neither accepts a claimed user ID.
create function public.is_calendar_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.calendar_members where calendar_id = target and user_id = (select auth.uid()));
$$;
create function public.is_calendar_peer(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.calendar_members a join public.calendar_members b using (calendar_id)
    where a.user_id = (select auth.uid()) and b.user_id = target);
$$;

alter table public.profiles enable row level security;
alter table public.shared_calendars enable row level security;
alter table public.calendar_members enable row level security;
alter table public.calendar_events enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.recurring_exceptions enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (public.is_calendar_peer(id));
create policy calendars_read on public.shared_calendars for select to authenticated using (public.is_calendar_member(id));
create policy members_read on public.calendar_members for select to authenticated using (public.is_calendar_member(calendar_id));
create policy events_read on public.calendar_events for select to authenticated using (public.is_calendar_member(calendar_id));
create policy events_insert on public.calendar_events for insert to authenticated with check (public.is_calendar_member(calendar_id));
create policy events_update on public.calendar_events for update to authenticated using (public.is_calendar_member(calendar_id)) with check (public.is_calendar_member(calendar_id));
create policy events_delete on public.calendar_events for delete to authenticated using (public.is_calendar_member(calendar_id));
create policy rules_read on public.recurring_rules for select to authenticated using (public.is_calendar_member(calendar_id));
create policy rules_insert on public.recurring_rules for insert to authenticated with check (public.is_calendar_member(calendar_id));
create policy rules_update on public.recurring_rules for update to authenticated using (public.is_calendar_member(calendar_id)) with check (public.is_calendar_member(calendar_id));
create policy rules_delete on public.recurring_rules for delete to authenticated using (public.is_calendar_member(calendar_id));
create policy exceptions_read on public.recurring_exceptions for select to authenticated using (public.is_calendar_member(calendar_id));
create policy exceptions_insert on public.recurring_exceptions for insert to authenticated with check (public.is_calendar_member(calendar_id));
create policy exceptions_update on public.recurring_exceptions for update to authenticated using (public.is_calendar_member(calendar_id)) with check (public.is_calendar_member(calendar_id));
create policy exceptions_delete on public.recurring_exceptions for delete to authenticated using (public.is_calendar_member(calendar_id));

-- One SQL statement gives the resolver a coherent snapshot, beyond PostgREST row limits.
create function public.load_shared_calendar() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('calendar', to_jsonb(c),
    'profiles', (select coalesce(jsonb_agg(p), '[]') from public.profiles p join public.calendar_members m on m.user_id=p.id where m.calendar_id=c.id),
    'events', (select coalesce(jsonb_agg(e order by e.id), '[]') from public.calendar_events e where e.calendar_id=c.id),
    'rules', (select coalesce(jsonb_agg(r order by r.id), '[]') from public.recurring_rules r where r.calendar_id=c.id),
    'exceptions', (select coalesce(jsonb_agg(x order by x.id), '[]') from public.recurring_exceptions x where x.calendar_id=c.id))
  from public.shared_calendars c join public.calendar_members m on m.calendar_id=c.id where m.user_id=(select auth.uid());
$$;

-- Explicit membership check is mandatory because this narrowly scoped transaction
-- also writes the server-side import receipt, which clients cannot write directly.
create function public.import_local_calendar(p_calendar_id uuid, p_events jsonb, p_rules jsonb, p_exceptions jsonb)
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
    insert into public.recurring_rules(id,calendar_id,owner_user_id,owner_person_key,title,category,timezone,local_start_time,local_end_time,pattern,weekdays,enabled,notes,open_to_study_together)
    values(item->>'id',p_calendar_id,(item->>'owner_user_id')::uuid,item->>'owner_person_key',item->>'title',item->>'category',item->>'timezone',
      (item->>'local_start_time')::time,(item->>'local_end_time')::time,item->>'pattern',array(select jsonb_array_elements_text(item->'weekdays')::integer),
      (item->>'enabled')::boolean,item->>'notes',(item->>'open_to_study_together')::boolean);
  end loop;
  for item in select * from jsonb_array_elements(p_events) loop
    insert into public.calendar_events(id,calendar_id,owner_user_id,owner_person_key,title,category,start_utc,end_utc,timezone,notes,open_to_study_together)
    values(item->>'id',p_calendar_id,(item->>'owner_user_id')::uuid,item->>'owner_person_key',item->>'title',item->>'category',
      (item->>'start_utc')::timestamptz,(item->>'end_utc')::timestamptz,item->>'timezone',item->>'notes',(item->>'open_to_study_together')::boolean);
  end loop;
  for item in select * from jsonb_array_elements(p_exceptions) loop
    insert into public.recurring_exceptions(calendar_id,recurring_rule_id,occurrence_key,exception_type,replacement_event)
    values(p_calendar_id,item->>'recurring_rule_id',(item->>'occurrence_key')::date,item->>'exception_type',nullif(item->'replacement_event','null'::jsonb));
  end loop;
  update public.shared_calendars set local_import_completed_at=clock_timestamp() where id=p_calendar_id;
end;
$$;

-- Do not inherit Supabase's broad default grants for identity/membership tables.
revoke all on public.profiles,public.shared_calendars,public.calendar_members,public.calendar_events,public.recurring_rules,public.recurring_exceptions from anon, authenticated;
grant select on public.profiles,public.shared_calendars,public.calendar_members to authenticated;
grant select,insert,update,delete on public.calendar_events,public.recurring_rules,public.recurring_exceptions to authenticated;
revoke all on function public.is_calendar_member(uuid),public.is_calendar_peer(uuid),public.valid_event_replacement(jsonb),public.stamp_calendar_write(),public.load_shared_calendar(),public.import_local_calendar(uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.is_calendar_member(uuid),public.is_calendar_peer(uuid),public.valid_event_replacement(jsonb),public.load_shared_calendar(),public.import_local_calendar(uuid,jsonb,jsonb,jsonb) to authenticated;

-- Private broadcasts carry no event content. Read access is checked again by the
-- snapshot RPC. The tables do not need the public Postgres Changes publication.
create function public.notify_calendar_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send('{}'::jsonb, 'calendar_changed',
    'calendar:' || (case when tg_op = 'DELETE' then old.calendar_id else new.calendar_id end)::text, true);
  return null;
end;
$$;
revoke all on function public.notify_calendar_change() from public,anon,authenticated;
create trigger notify_event after insert or update or delete on public.calendar_events for each row execute function public.notify_calendar_change();
create trigger notify_rule after insert or update or delete on public.recurring_rules for each row execute function public.notify_calendar_change();
create trigger notify_exception after insert or update or delete on public.recurring_exceptions for each row execute function public.notify_calendar_change();

-- Supabase already enables RLS on realtime.messages; do not alter its ownership.
create policy our_time_receive on realtime.messages for select to authenticated using (
  extension = 'broadcast' and exists(select 1 from public.calendar_members m
    where m.user_id=(select auth.uid()) and 'calendar:' || m.calendar_id::text = (select realtime.topic()))
);
-- Prevent a pre-existing broad permissive SELECT policy from opening these topics.
create policy our_time_topic_boundary on realtime.messages as restrictive for select to authenticated using (
  (select realtime.topic()) not like 'calendar:%' or exists(select 1 from public.calendar_members m
    where m.user_id=(select auth.uid()) and 'calendar:' || m.calendar_id::text = (select realtime.topic()))
);
commit;
