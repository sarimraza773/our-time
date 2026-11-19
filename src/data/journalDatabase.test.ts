import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { calendarId, outsider, users } from '../test/calendarFixtures';
import { defaultFormat } from '../lib/journal';

let db: PGlite;
const entryId = '00000000-0000-4000-8000-000000000100';
const asUser = async (id: string) => { await db.exec('set local role authenticated'); await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id]); };
const insert = () => db.query(`insert into public.diary_entries(id,calendar_id,title,content,formatting,created_by,version,created_at)
  values($1,$2,'A small joy','Rain together',$3,$4,99,'2000-01-01') returning *`, [entryId, calendarId, JSON.stringify(defaultFormat), users.sarim]);
const rename = () => db.query("insert into public.bookshelf_titles(calendar_id,book_key,title) values($1,'botany','Our diary') on conflict(calendar_id,book_key) do update set title=excluded.title", [calendarId]);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    create schema realtime; create table realtime.messages(extension text, topic text, payload jsonb, private boolean);
    alter table realtime.messages enable row level security;
    grant usage on schema realtime to authenticated; grant select on realtime.messages to authenticated;
    create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
    create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as $$
      insert into realtime.messages values ('broadcast',topic,payload,private) $$;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated;
    grant select,insert,update,delete on storage.objects to anon,authenticated;`);
  await db.exec(readFileSync(new URL('../../supabase/migrations/202609260001_shared_calendar.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../../supabase/migrations/202610190001_photobooth.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../../supabase/migrations/202611170001_shared_diary.sql', import.meta.url), 'utf8'));
  await db.query('insert into auth.users values($1),($2),($3)', [users.deena, users.sarim, outsider]);
  await db.query("insert into public.profiles(id,display_name,person_key,timezone) values($1,'Deena','deena','Asia/Kuala_Lumpur'),($2,'Sarim','sarim','America/New_York')", [users.deena, users.sarim]);
  await db.query("insert into public.shared_calendars(id,name) values($1,'Our Time')", [calendarId]);
  await db.query('insert into public.calendar_members(calendar_id,user_id) values($1,$2),($1,$3)', [calendarId, users.deena, users.sarim]);
}, 30000);
beforeEach(async () => { await db.exec('begin'); });
afterEach(async () => { await db.exec('rollback'); });
afterAll(async () => { await db?.close(); });
describe('actual diary migration and RLS on embedded Postgres', () => {
  it('enables RLS on both new tables alongside the calendar and photobooth migrations', async () => {
    const { rows } = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname in ('diary_entries','bookshelf_titles')");
    expect(rows).toHaveLength(2); expect(rows.every(row => row.relrowsecurity)).toBe(true);
  });
  it('stores book titles and formatted pages, stamps author/timestamps, and lets both members edit/delete', async () => {
    await asUser(users.deena); await rename();
    const { rows } = await insert(); const row = rows[0] as { created_by: string; created_at: string; version: number };
    expect(row.created_by).toBe(users.deena); expect(row.version).toBe(1); expect(new Date(row.created_at).getUTCFullYear()).toBeGreaterThan(2000);
    await asUser(users.sarim);
    expect((await db.query("update public.diary_entries set content='A letter back',version=500 where version=1 returning version")).rows).toEqual([{ version: 2 }]);
    const result = await db.query<{ value: { books: { title: string }[]; entries: { content: string; formatting: unknown }[] } }>('select public.load_shared_journal($1) as value', [calendarId]);
    expect(result.rows[0].value.books[0].title).toBe('Our diary'); expect(result.rows[0].value.entries[0].content).toBe('A letter back'); expect(result.rows[0].value.entries[0].formatting).toEqual(defaultFormat);
    expect((await db.query('delete from public.diary_entries returning id')).rows).toHaveLength(1);
  });
  it('hides private data and prevents outsider writes/deletes', async () => {
    await asUser(users.deena); await insert(); await rename(); await asUser(outsider);
    for (const table of ['diary_entries', 'bookshelf_titles']) expect((await db.query(`select * from public.${table}`)).rows).toEqual([]);
    expect((await db.query("update public.diary_entries set content='Intruder' returning id")).rows).toEqual([]);
    expect((await db.query('delete from public.diary_entries returning id')).rows).toEqual([]);
    await expect(db.query('select public.load_shared_journal($1)', [calendarId])).rejects.toThrow(/membership required/);
  });
  it('rejects outsider diary inserts', async () => { await asUser(outsider); await expect(insert()).rejects.toThrow(/row-level security/); });
  it('rejects outsider book title creation', async () => { await asUser(outsider); await expect(rename()).rejects.toThrow(/row-level security/); });
  it('denies anonymous reads and RPCs', async () => { await db.exec('set local role anon'); await expect(db.query('select * from public.diary_entries')).rejects.toThrow(/permission denied/); });
  it('denies anonymous bookshelf access', async () => { await db.exec('set local role anon'); await expect(db.query('select * from public.bookshelf_titles')).rejects.toThrow(/permission denied/); });
  it('denies anonymous journal RPC', async () => { await db.exec('set local role anon'); await expect(db.query('select public.load_shared_journal($1)', [calendarId])).rejects.toThrow(/permission denied/); });
  it('rejects unsafe or malformed formatting', async () => {
    await asUser(users.deena);
    await expect(db.query("insert into public.diary_entries(calendar_id,title,content,formatting) values($1,'Title','Text',$2)", [calendarId, JSON.stringify({ ...defaultFormat, color: 'url(evil)' })])).rejects.toThrow(/check constraint/);
  });
  it('rejects empty diary text', async () => {
    await asUser(users.deena); await expect(db.query("insert into public.diary_entries(calendar_id,title,content,formatting) values($1,'Title','   ',$2)", [calendarId, JSON.stringify(defaultFormat)])).rejects.toThrow(/check constraint/);
  });
  it('rejects unknown books', async () => {
    await asUser(users.deena); await expect(db.query("insert into public.bookshelf_titles(calendar_id,book_key,title) values($1,'evil','Unknown')", [calendarId])).rejects.toThrow(/check constraint/);
  });
  it('rejects overlong book titles even when padded with spaces', async () => {
    await asUser(users.deena); await expect(db.query("insert into public.bookshelf_titles(calendar_id,book_key,title) values($1,'botany',$2)", [calendarId, 'Title' + ' '.repeat(48)])).rejects.toThrow(/check constraint/);
  });
  it('prevents stale updates/deletes from overwriting a newer page', async () => {
    await asUser(users.deena); await insert(); await db.exec("update public.diary_entries set content='Newer' where version=1");
    await asUser(users.sarim);
    expect((await db.query("update public.diary_entries set content='Stale' where version=1 returning id")).rows).toEqual([]);
    expect((await db.query('delete from public.diary_entries where version=1 returning id')).rows).toEqual([]);
    expect((await db.query('select content from public.diary_entries')).rows).toEqual([{ content: 'Newer' }]);
  });
  it('prevents changing author or moving a page to another calendar', async () => {
    await asUser(users.deena); await insert(); await expect(db.query('update public.diary_entries set created_by=$1', [users.sarim])).rejects.toThrow(/author cannot change/);
  });
  it('revoking membership immediately removes table and RPC access', async () => {
    await asUser(users.deena); await insert(); await db.exec('reset role'); await db.query('delete from public.calendar_members where user_id=$1', [users.deena]);
    await asUser(users.deena); expect((await db.query('select * from public.diary_entries')).rows).toEqual([]);
    await expect(db.query('select public.load_shared_journal($1)', [calendarId])).rejects.toThrow(/membership required/);
  });
  it('emits content-free private notifications for rename and CRUD, and protects the journal topic', async () => {
    await asUser(users.deena); await rename(); await insert(); await db.exec("update public.diary_entries set content='Edited'; delete from public.diary_entries;");
    await db.query("select set_config('realtime.topic',$1,true)", [`journal:${calendarId}`]);
    const notifications = (await db.query<{ payload: unknown; private: boolean; topic: string }>('select payload,private,topic from realtime.messages')).rows;
    expect(notifications).toHaveLength(4); expect(notifications.every(row => row.private === true && JSON.stringify(row.payload) === '{}' && row.topic === `journal:${calendarId}`)).toBe(true);
    await asUser(outsider); expect((await db.query('select * from realtime.messages')).rows).toEqual([]);
  });
});
