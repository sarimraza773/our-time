import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it } from 'vitest';
import { calendarId, outsider, users } from '../test/calendarFixtures';

let db: PGlite;
const mid = '11111111-2222-4333-8444-555555555555';
const paths = (user: string, n = 2) => Array.from({ length: n }, (_, i) => `${calendarId}/${user}/${i + 1}.jpg`);
const metadata = (mode = 'together') => ({ id: mid, calendar_id: calendarId, title: 'Our moments', mode, shot_count: mode === 'solo' ? 3 : 4, frame: 'rose', stickers: [] });
async function asUser(id: string) { await db.exec('set local role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]); }
async function upload(user: string, n = 2) { for (const name of paths(user, n)) await db.query("insert into storage.objects(bucket_id,name) values ('our-time-memories',$1)", [name]); }
const save = (user: string, data = metadata(), n = 2) => db.query('select public.save_photo_contribution($1::jsonb,$2::text[])', [JSON.stringify(data), paths(user, n)]);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    create schema realtime; create table realtime.messages(extension text,topic text,payload jsonb,private boolean);
    alter table realtime.messages enable row level security;
    create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
    create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as $$ insert into realtime.messages values('broadcast',topic,payload,private) $$;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated;
    grant select,insert,update,delete on storage.objects to anon,authenticated;`);
  for (const file of ['202609260001_shared_calendar.sql','202610190001_photobooth.sql']) await db.exec(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  await db.query('insert into auth.users values ($1),($2),($3)', [users.deena,users.sarim,outsider]);
  await db.query("insert into public.profiles(id,display_name,person_key,timezone) values ($1,'Deena','deena','Asia/Kuala_Lumpur'),($2,'Sarim','sarim','America/New_York')", [users.deena,users.sarim]);
  await db.query("insert into public.shared_calendars(id,name) values ($1,'Our Time')", [calendarId]);
  await db.query('insert into public.calendar_members(calendar_id,user_id) values ($1,$2),($1,$3)', [calendarId,users.deena,users.sarim]);
}, 30000);
beforeEach(async () => { await db.exec('begin'); });
afterEach(async () => { await db.exec('rollback'); });
afterAll(async () => { await db?.close(); });
describe('photobooth migration and storage RLS in embedded Postgres', () => {
  it('creates a private JPEG-only size-limited bucket and enables metadata RLS', async () => {
    expect((await db.query("select public,file_size_limit,allowed_mime_types from storage.buckets")).rows).toEqual([{ public: false,file_size_limit: 5242880,allowed_mime_types: ['image/jpeg'] }]);
    expect((await db.query("select relrowsecurity from pg_class where relname in ('photo_memories','photo_contributions')")).rows).toEqual([{ relrowsecurity: true },{ relrowsecurity: true }]);
  });
  it('saves separate authenticated contributions and emits private empty notifications', async () => {
    await asUser(users.sarim); await upload(users.sarim); await save(users.sarim);
    await asUser(users.deena); await upload(users.deena); await save(users.deena);
    expect((await db.query('select person_key from public.photo_contributions order by person_key')).rows).toEqual([{ person_key:'deena' },{ person_key:'sarim' }]);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(4);
    await db.exec('reset role');
    const { rows } = await db.query<{ private:boolean; payload:unknown }>('select private,payload from realtime.messages');
    expect(rows).toHaveLength(3); expect(rows.every(r => r.private && JSON.stringify(r.payload)==='{}')).toBe(true);
  });
  it('denies outsider metadata reads, direct writes, and save RPC', async () => {
    await asUser(users.deena); await upload(users.deena); await save(users.deena);
    await asUser(outsider); expect((await db.query('select * from public.photo_memories')).rows).toEqual([]);
    expect((await db.query('select * from public.photo_contributions')).rows).toEqual([]);
    expect((await db.query('select * from storage.objects')).rows).toEqual([]);
    expect((await db.query('select public.load_photo_memories($1) as value',[calendarId])).rows).toEqual([{value:null}]);
    await expect(save(outsider)).rejects.toThrow(/membership required/);
  });
  it('rejects camera-owner spoofing in object paths', async () => {
    await asUser(users.deena); await expect(upload(users.sarim)).rejects.toThrow(/row-level security/);
  });
  it('rejects a contribution referencing partner photos and rolls back the metadata insert', async () => {
    await upload(users.sarim); await asUser(users.deena); await db.exec('savepoint rejected');
    await expect(save(users.sarim)).rejects.toThrow(/another account/);
    await db.exec('rollback to savepoint rejected'); expect((await db.query('select * from public.photo_memories')).rows).toEqual([]);
  });
  it('checks required count and uploaded object existence', async () => {
    await asUser(users.deena); await db.exec('savepoint rejected'); await expect(save(users.deena,metadata(),1)).rejects.toThrow(/Incorrect photo count/);
    await db.exec('rollback to savepoint rejected'); await expect(save(users.deena)).rejects.toThrow(/upload missing/);
  });
  it('prevents overwriting an already saved contribution', async () => {
    await asUser(users.deena); await upload(users.deena); await save(users.deena); await expect(save(users.deena)).rejects.toThrow(/already saved/);
  });
  it('preserves the starter’s frame/caption when the partner joins', async () => {
    await asUser(users.deena); await upload(users.deena); await save(users.deena);
    await asUser(users.sarim); await upload(users.sarim); await save(users.sarim,{ ...metadata(), title:'Changed', frame:'blue' });
    expect((await db.query('select title,frame from public.photo_memories')).rows).toEqual([{ title:'Our moments',frame:'rose' }]);
  });
  it('supports solo strips and refuses a partner contribution to them', async () => {
    await asUser(users.deena); await upload(users.deena,3); await save(users.deena,metadata('solo'),3);
    await asUser(users.sarim); await expect(save(users.sarim)).rejects.toThrow(/cannot accept/);
  });
  it('keeps broad existing storage policies from exposing or overwriting photos', async () => {
    await db.exec('create policy broad_existing on storage.objects for all to authenticated using (true) with check (true)');
    await asUser(users.deena); await upload(users.deena); await save(users.deena);
    expect((await db.query("update storage.objects set name='replaced' returning name")).rows).toEqual([]);
    expect((await db.query('delete from storage.objects returning name')).rows).toEqual([]);
    await asUser(outsider); expect((await db.query('select * from storage.objects')).rows).toEqual([]);
  });
  it('denies browser metadata mutations outside the validated RPC', async () => {
    await asUser(users.deena); await expect(db.query("insert into public.photo_memories(id,calendar_id,title,mode,shot_count,frame) values ($1,$2,'x','solo',3,'rose')",[mid,calendarId])).rejects.toThrow(/permission denied/);
  });
  it('denies anonymous photo access even with a broad legacy storage policy', async () => {
    await upload(users.deena); await db.exec('create policy broad_anon on storage.objects for select to anon using (true); set local role anon');
    expect((await db.query('select * from storage.objects')).rows).toEqual([]);
  });
  it('authorizes the separate private memories topic only for members', async () => {
    await asUser(users.deena); await upload(users.deena); await save(users.deena);
    await db.exec('reset role; grant usage on schema realtime to authenticated; grant select on realtime.messages to authenticated;');
    await db.query("select set_config('realtime.topic',$1,true)",[`memories:${calendarId}`]);
    await asUser(users.sarim); expect((await db.query('select * from realtime.messages')).rows).toHaveLength(2);
    await asUser(outsider); expect((await db.query('select * from realtime.messages')).rows).toEqual([]);
  });
});
