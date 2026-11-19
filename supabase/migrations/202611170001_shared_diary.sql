-- Additive migration. Apply through the existing migration history workflow.
begin;

create function public.valid_diary_format(value jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(value) = 'object'
    and value ?& array['font','size','color','bold','italic','underline','align','headingTilt']
    and (value - array['font','size','color','bold','italic','underline','align','headingTilt']) = '{}'::jsonb
    and value->>'font' in ('serif','handwritten','classic','sans')
    and value->'size' in ('14'::jsonb,'15'::jsonb,'16'::jsonb,'17'::jsonb,'18'::jsonb,'19'::jsonb,'20'::jsonb,'21'::jsonb,'22'::jsonb,'23'::jsonb,'24'::jsonb,'25'::jsonb,'26'::jsonb,'27'::jsonb,'28'::jsonb,'29'::jsonb,'30'::jsonb,'31'::jsonb,'32'::jsonb)
    and value->>'color' in ('#3d2d26','#813e55','#203a73','#435338','#654066')
    and jsonb_typeof(value->'bold') = 'boolean'
    and jsonb_typeof(value->'italic') = 'boolean'
    and jsonb_typeof(value->'underline') = 'boolean'
    and value->>'align' in ('left','center','right')
    and value->'headingTilt' in ('-3'::jsonb,'0'::jsonb,'3'::jsonb), false);
$$;

create table public.bookshelf_titles (
  calendar_id uuid not null references public.shared_calendars(id) on delete cascade,
  book_key text not null check (book_key in ('botany','poetry','history','journey')),
  title text not null check (length(btrim(title)) > 0 and length(title) <= 48),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (calendar_id, book_key)
);
create table public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.shared_calendars(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0 and length(title) <= 160),
  content text not null check (length(btrim(content)) > 0 and length(content) <= 50000),
  formatting jsonb not null check (public.valid_diary_format(formatting)),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version integer not null default 1 check (version > 0)
);
create index diary_calendar_recent on public.diary_entries(calendar_id, updated_at desc, id);

create function public.stamp_journal_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.calendar_id <> old.calendar_id then raise exception 'Calendar identity cannot change'; end if;
    if tg_table_name = 'diary_entries' then
      if new.id <> old.id or new.created_by <> old.created_by or new.created_at <> old.created_at then
        raise exception 'Diary identity and author cannot change';
      end if;
      new.version := old.version + 1;
    elsif new.book_key <> old.book_key then raise exception 'Book identity cannot change';
    end if;
  elsif tg_table_name = 'diary_entries' then
    new.created_by := auth.uid();
    new.created_at := clock_timestamp();
    new.version := 1;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger stamp_bookshelf before insert or update on public.bookshelf_titles for each row execute function public.stamp_journal_write();
create trigger stamp_diary before insert or update on public.diary_entries for each row execute function public.stamp_journal_write();

alter table public.bookshelf_titles enable row level security;
alter table public.diary_entries enable row level security;
create policy bookshelf_read on public.bookshelf_titles for select to authenticated using (public.is_calendar_member(calendar_id));
create policy bookshelf_insert on public.bookshelf_titles for insert to authenticated with check (public.is_calendar_member(calendar_id));
create policy bookshelf_update on public.bookshelf_titles for update to authenticated using (public.is_calendar_member(calendar_id)) with check (public.is_calendar_member(calendar_id));
create policy diary_read on public.diary_entries for select to authenticated using (public.is_calendar_member(calendar_id));
create policy diary_insert on public.diary_entries for insert to authenticated with check (public.is_calendar_member(calendar_id) and created_by = (select auth.uid()));
create policy diary_update on public.diary_entries for update to authenticated using (public.is_calendar_member(calendar_id)) with check (public.is_calendar_member(calendar_id));
create policy diary_delete on public.diary_entries for delete to authenticated using (public.is_calendar_member(calendar_id));

-- Lazy title creation keeps the original physical books until their first rename.
-- An unedited title is a stable client default, never a localStorage record.
create function public.load_shared_journal(p_calendar_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.is_calendar_member(p_calendar_id) then raise exception 'Calendar membership required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'books', (select coalesce(jsonb_agg(b order by b.book_key), '[]'::jsonb) from public.bookshelf_titles b where b.calendar_id = p_calendar_id),
    'entries', (select coalesce(jsonb_agg(d order by d.updated_at desc, d.id), '[]'::jsonb) from public.diary_entries d where d.calendar_id = p_calendar_id)
  );
end;
$$;

revoke all on public.bookshelf_titles, public.diary_entries from anon, authenticated;
grant select, insert, update on public.bookshelf_titles to authenticated;
grant select, insert, update, delete on public.diary_entries to authenticated;
revoke all on function public.valid_diary_format(jsonb), public.stamp_journal_write(), public.load_shared_journal(uuid) from public, anon, authenticated;
grant execute on function public.valid_diary_format(jsonb), public.load_shared_journal(uuid) to authenticated;

-- Private, content-free notifications. All content is refetched under table RLS.
create function public.notify_journal_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send('{}'::jsonb, 'journal_changed',
    'journal:' || (case when tg_op = 'DELETE' then old.calendar_id else new.calendar_id end)::text, true);
  return null;
end;
$$;
revoke all on function public.notify_journal_change() from public, anon, authenticated;
create trigger notify_bookshelf after insert or update on public.bookshelf_titles for each row execute function public.notify_journal_change();
create trigger notify_diary after insert or update or delete on public.diary_entries for each row execute function public.notify_journal_change();
create policy our_time_journal_receive on realtime.messages for select to authenticated using (
  extension = 'broadcast' and exists(select 1 from public.calendar_members m
    where m.user_id = (select auth.uid()) and 'journal:' || m.calendar_id::text = (select realtime.topic()))
);
create policy our_time_journal_boundary on realtime.messages as restrictive for select to authenticated using (
  (select realtime.topic()) not like 'journal:%' or exists(select 1 from public.calendar_members m
    where m.user_id = (select auth.uid()) and 'journal:' || m.calendar_id::text = (select realtime.topic()))
);
commit;
