import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it } from 'vitest';
import { calendarId, outsider, users } from '../test/calendarFixtures';
let db: PGlite;
const asUser = async (id: string) => { await db.exec('set local role authenticated'); await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id]); };
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    -- Only the Realtime transport is stubbed; table constraints and policies run in Postgres.
    create schema realtime;
    create table realtime.messages(extension text, topic text, payload jsonb, private boolean);
    alter table realtime.messages enable row level security;
    grant usage on schema realtime to authenticated;
    grant select on realtime.messages to authenticated;
    create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
    create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as $$
      insert into realtime.messages(extension,topic,payload,private) values ('broadcast',topic,payload,private) $$;`);
  await db.exec(readFileSync(new URL('../../supabase/migrations/202609260001_shared_calendar.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../../supabase/migrations/202611210001_event_colors_and_repeats.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../../supabase/migrations/202611220001_custom_event_colors.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../../supabase/migrations/202611220002_private_period_tracker.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../../supabase/migrations/202611220003_shared_period_tracker.sql', import.meta.url), 'utf8'));
  await db.query('insert into auth.users values ($1),($2),($3)', [users.deena, users.sarim, outsider]);
  await db.query(`insert into public.profiles(id,display_name,person_key,timezone) values ($1,'Deena','deena','Asia/Kuala_Lumpur'),($2,'Sarim','sarim','America/New_York')`, [users.deena, users.sarim]);
  await db.query("insert into public.shared_calendars(id,name) values ($1,'Our Time')", [calendarId]);
  await db.query('insert into public.calendar_members(calendar_id,user_id) values ($1,$2),($1,$3)', [calendarId, users.deena, users.sarim]);
}, 30000);
beforeEach(async () => { await db.exec('begin'); });
afterEach(async () => { await db.exec('rollback'); });
afterAll(async () => { await db?.close(); });

const periodId='00000000-0000-4000-8000-000000000100';
const log=()=>db.query("insert into public.period_entries(id,user_id,start_date,end_date,notes) values($1,$2,'2026-01-01','2026-01-05','Synthetic shared note') returning user_id",[periodId,users.deena]);
const settings=()=>db.query('insert into public.cycle_settings(user_id) values($1)',[users.deena]);
const rejected=async(action:()=>Promise<unknown>,match:RegExp)=>{await db.exec('savepoint rejected');await expect(action()).rejects.toThrow(match);await db.exec('rollback to savepoint rejected');};
describe('shared tracker policies on embedded PostgreSQL after all tracker migrations',()=>{
 it.each([users.deena,users.sarim])('resolves Deena as the common owner and allows linked editor %s to log, correct and delete',async id=>{
  await asUser(id);
  expect((await db.query('select public.cycle_tracker_owner_id() as id')).rows).toEqual([{id:users.deena}]);
  await log();await settings();
  await db.exec("update public.period_entries set end_date='2026-01-06',notes='Shared correction';update public.cycle_settings set cycle_length=30");
  await asUser(id===users.deena?users.sarim:users.deena);
  expect((await db.query('select notes,end_date::text,user_id from public.period_entries')).rows).toEqual([{notes:'Shared correction',end_date:'2026-01-06',user_id:users.deena}]);
  expect((await db.query('select cycle_length from public.cycle_settings')).rows).toEqual([{cycle_length:30}]);
  expect((await db.query('delete from public.period_entries returning id')).rows).toHaveLength(1);
 });
 it.each([users.deena,users.sarim])('allows confirmed tracker-wide deletion from linked editor %s without a target UUID',async id=>{
  await asUser(users.deena);await log();await settings();await asUser(id);
  await db.exec('select public.delete_cycle_tracker_data()');
  expect((await db.query('select * from public.period_entries')).rows).toEqual([]);
  expect((await db.query('select * from public.cycle_settings')).rows).toEqual([]);
 });
 it('denies an unrelated authenticated caller every direct data operation and deletion RPC',async()=>{
  await asUser(users.deena);await log();await settings();await asUser(outsider);
  expect((await db.query('select public.cycle_tracker_owner_id() as id')).rows).toEqual([{id:null}]);
  for(const table of ['period_entries','cycle_settings']){
   expect((await db.query(`select * from public.${table}`)).rows).toEqual([]);
   expect((await db.query(`delete from public.${table} returning user_id`)).rows).toEqual([]);
  }
  expect((await db.query("update public.period_entries set notes='Attack' returning id")).rows).toEqual([]);
  expect((await db.query('update public.cycle_settings set cycle_length=30 returning user_id')).rows).toEqual([]);
  await rejected(log,/row-level security/);await rejected(settings,/row-level security/);
  await rejected(()=>db.exec('select public.delete_cycle_tracker_data()'),/Linked tracker access/);
 });
 it('revokes Sarim access when the calendar link is removed while preserving Deena ownership',async()=>{
  await asUser(users.deena);await log();await settings();await db.exec('reset role');
  await db.query('delete from public.calendar_members where user_id=$1',[users.sarim]);
  await asUser(users.sarim);
  expect((await db.query('select public.cycle_tracker_owner_id() as id')).rows).toEqual([{id:null}]);
  expect((await db.query('select * from public.period_entries')).rows).toEqual([]);
  expect((await db.query("update public.period_entries set notes='Attack' returning id")).rows).toEqual([]);
  await rejected(()=>db.exec('select public.delete_cycle_tracker_data()'),/Linked tracker access/);
  await asUser(users.deena);expect((await db.query('select id from public.period_entries')).rows).toHaveLength(1);
 });
 it('rejects a separate Sarim-owned record, changed ownership, or an altered profile mapping',async()=>{
  await asUser(users.sarim);
  await rejected(()=>db.exec("insert into public.period_entries(start_date) values('2026-02-01')"),/row-level security/);
  await log();await rejected(()=>db.query('update public.period_entries set user_id=$1',[users.sarim]),/ownership/);
  await rejected(()=>db.exec("update public.profiles set person_key='deena'"),/permission denied/);
 });
 it('keeps date, overlap, duplicate and settings validation active for Sarim writes',async()=>{
  await asUser(users.sarim);await log();await settings();
  await rejected(()=>db.query("insert into public.period_entries(user_id,start_date,end_date) values($1,'2026-01-03','2026-01-04')",[users.deena]),/overlap/);
  await rejected(()=>db.query("insert into public.period_entries(user_id,start_date) values($1,'2190-01-01')",[users.deena]),/future/);
  await rejected(()=>db.exec('update public.cycle_settings set cycle_length=1'),/check constraint/);
 });
 it('denies anonymous access and keeps cycle notes out of shared calendar snapshots/broadcasts',async()=>{
  await asUser(users.deena);await log();await settings();
  expect(JSON.stringify((await db.query('select public.load_shared_calendar()')).rows)).not.toContain('Synthetic shared note');
  expect((await db.query('select * from realtime.messages')).rows).toEqual([]);
  await db.exec('set local role anon');
  for(const sql of ['select * from public.period_entries','select * from public.cycle_settings','select public.cycle_tracker_owner_id()','select public.delete_cycle_tracker_data()']) await rejected(()=>db.exec(sql),/permission denied/);
 });
});
