-- Requires the Phase 3 shared-calendar migration. Apply manually; no remote changes are automatic.
begin;
create function public.valid_photo_stickers(value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare item jsonb;
begin
  if jsonb_typeof(value) <> 'array' or jsonb_array_length(value) > 16 then return false; end if;
  for item in select * from jsonb_array_elements(value) loop
    if not coalesce(jsonb_typeof(item->'id')='string' and length(item->>'id') between 1 and 100
      and jsonb_typeof(item->'x')='number' and jsonb_typeof(item->'y')='number'
      and item->>'asset' in ('sammy','rupert','chadwick','carlisle')
      and (item->>'x')::numeric between 0 and 1 and (item->>'y')::numeric between 0 and 1, false) then return false; end if;
  end loop;
  if (select count(distinct entry.element->>'id') from jsonb_array_elements(value) as entry(element)) <> jsonb_array_length(value) then return false; end if;
  return true;
exception when others then return false;
end; $$;
create table public.photo_memories (
  id uuid primary key,
  calendar_id uuid not null references public.shared_calendars(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 80),
  mode text not null check (mode in ('solo','together')),
  shot_count integer not null check (shot_count in (3,4) and (mode <> 'together' or shot_count=4)),
  frame text not null check (frame in ('rose','blue','cream')),
  stickers jsonb not null default '[]' check (public.valid_photo_stickers(stickers)),
  created_at timestamptz not null default now(),
  unique (calendar_id,id)
);
create table public.photo_contributions (
  memory_id uuid not null,
  calendar_id uuid not null,
  user_id uuid not null,
  person_key text not null,
  paths text[] not null check (cardinality(paths) between 2 and 4 and array_position(paths,null) is null),
  primary key (memory_id,user_id),
  unique (memory_id,person_key),
  foreign key (calendar_id,memory_id) references public.photo_memories(calendar_id,id) on delete cascade,
  foreign key (calendar_id,user_id) references public.calendar_members(calendar_id,user_id),
  foreign key (user_id,person_key) references public.profiles(id,person_key)
);
create index photo_memories_calendar_idx on public.photo_memories(calendar_id,created_at desc);
create index photo_contributions_calendar_idx on public.photo_contributions(calendar_id);
alter table public.photo_memories enable row level security;
alter table public.photo_contributions enable row level security;
create policy memories_read on public.photo_memories for select to authenticated using (public.is_calendar_member(calendar_id));
create policy contributions_read on public.photo_contributions for select to authenticated using (public.is_calendar_member(calendar_id));
revoke all on public.photo_memories,public.photo_contributions from anon,authenticated;
grant select on public.photo_memories,public.photo_contributions to authenticated;
-- One RLS-protected snapshot avoids table-read races and PostgREST pagination truncation.
create function public.load_photo_memories(p_calendar_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select case when public.is_calendar_member(p_calendar_id) then jsonb_build_object(
    'memories',(select coalesce(jsonb_agg(m order by m.created_at desc,m.id),'[]') from public.photo_memories m where m.calendar_id=p_calendar_id),
    'contributions',(select coalesce(jsonb_agg(c),'[]') from public.photo_contributions c where c.calendar_id=p_calendar_id)) else null end;
$$;
revoke all on function public.load_photo_memories(uuid) from public,anon;
grant execute on function public.load_photo_memories(uuid) to authenticated;

-- One atomic metadata commit after explicit Save uploads. Locking serializes partner saves.
-- Identity comes only from auth.uid(), never the UI's perspective/person selection.
create function public.save_photo_contribution(p_memory jsonb,p_paths text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare cal uuid := (p_memory->>'calendar_id')::uuid;
  mid uuid := (p_memory->>'id')::uuid;
  uid uuid := auth.uid(); person text; memory public.photo_memories; path text; expected integer;
begin
  if not public.is_calendar_member(cal) then raise exception 'Calendar membership required' using errcode='42501'; end if;
  perform 1 from public.shared_calendars where id=cal for update;
  select person_key into person from public.profiles where id=uid;
  select * into memory from public.photo_memories where id=mid;
  if found then
    if memory.calendar_id<>cal or memory.mode<>'together' then raise exception 'This strip cannot accept another contribution'; end if;
  else
    insert into public.photo_memories(id,calendar_id,title,mode,shot_count,frame,stickers)
      values(mid,cal,p_memory->>'title',p_memory->>'mode',(p_memory->>'shot_count')::integer,p_memory->>'frame',p_memory->'stickers') returning * into memory;
  end if;
  if exists(select 1 from public.photo_contributions where memory_id=mid and user_id=uid) then raise exception 'Your photos are already saved. Refresh Memories.'; end if;
  expected := case when memory.mode='together' then 2 else memory.shot_count end;
  if p_paths is null or cardinality(p_paths)<>expected or array_position(p_paths,null) is not null then raise exception 'Incorrect photo count'; end if;
  if (select count(distinct x) from unnest(p_paths) x)<>expected then raise exception 'Photos must be distinct'; end if;
  foreach path in array p_paths loop
    if path not like cal::text || '/' || uid::text || '/%.jpg'
      or not exists(select 1 from storage.objects where bucket_id='our-time-memories' and name=path)
      then raise exception 'Photo upload missing or belongs to another account'; end if;
  end loop;
  insert into public.photo_contributions values(mid,cal,uid,person,p_paths);
end; $$;
revoke all on function public.save_photo_contribution(jsonb,text[]),public.valid_photo_stickers(jsonb) from public,anon;
grant execute on function public.save_photo_contribution(jsonb,text[]),public.valid_photo_stickers(jsonb) to authenticated;
create function public.notify_memory_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send('{}'::jsonb,'memories_changed','memories:' || (case when tg_op='DELETE' then old.calendar_id else new.calendar_id end)::text,true);
  return null;
end; $$;
revoke all on function public.notify_memory_change() from public,anon,authenticated;
create trigger notify_memory after insert or update or delete on public.photo_memories for each row execute function public.notify_memory_change();
create trigger notify_photo after insert or update or delete on public.photo_contributions for each row execute function public.notify_memory_change();
create policy our_time_memories_receive on realtime.messages for select to authenticated using (
  extension='broadcast' and exists(select 1 from public.calendar_members m where m.user_id=auth.uid() and 'memories:' || m.calendar_id::text=(select realtime.topic()))
);
create policy our_time_memories_boundary on realtime.messages as restrictive for select to authenticated using (
  (select realtime.topic()) not like 'memories:%' or exists(select 1 from public.calendar_members m where m.user_id=auth.uid() and 'memories:' || m.calendar_id::text=(select realtime.topic()))
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('our-time-memories','our-time-memories',false,5242880,array['image/jpeg']);
-- The caller must be a calendar member AND may upload only under their own Auth UUID.
create policy our_time_photo_upload on storage.objects for insert to authenticated with check (
  bucket_id='our-time-memories' and exists(select 1 from public.calendar_members m
    where m.user_id=auth.uid() and split_part(name,'/',1)=m.calendar_id::text
    and split_part(name,'/',2)=auth.uid()::text) and name ~ '^[^/]+/[^/]+/[0-9a-f-]+[.]jpg$'
);
-- Only committed, member-visible photos may be downloaded; no public bucket or URLs.
create policy our_time_photo_read on storage.objects for select to authenticated using (
  bucket_id='our-time-memories' and exists(select 1 from public.photo_contributions c
    where public.is_calendar_member(c.calendar_id) and name=any(c.paths))
);
-- Boundaries keep pre-existing broad permissive policies from opening this bucket.
create policy our_time_photo_read_boundary on storage.objects as restrictive for select to authenticated using (
  bucket_id<>'our-time-memories' or exists(select 1 from public.photo_contributions c where public.is_calendar_member(c.calendar_id) and name=any(c.paths))
);
create policy our_time_photo_upload_boundary on storage.objects as restrictive for insert to authenticated with check (
  bucket_id<>'our-time-memories' or (split_part(name,'/',2)=auth.uid()::text and exists(select 1 from public.calendar_members m where m.user_id=auth.uid() and m.calendar_id::text=split_part(name,'/',1)))
);
create policy our_time_photo_no_overwrite on storage.objects as restrictive for update to authenticated using (bucket_id<>'our-time-memories');
create policy our_time_photo_no_delete on storage.objects as restrictive for delete to authenticated using (bucket_id<>'our-time-memories');
create policy our_time_photo_no_anon on storage.objects as restrictive for all to anon using (bucket_id<>'our-time-memories') with check (bucket_id<>'our-time-memories');
commit;
