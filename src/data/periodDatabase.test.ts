import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it } from 'vitest';
import { calendarId, event, outsider, rule, users } from '../test/calendarFixtures';
import { eventToWrite, exceptionToWrite, mapSnapshot, ruleToWrite } from './calendarMapping';
import type { Snapshot } from './database';
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
  await db.query('insert into auth.users values ($1),($2),($3)', [users.deena, users.sarim, outsider]);
  await db.query(`insert into public.profiles(id,display_name,person_key,timezone) values ($1,'Deena','deena','Asia/Kuala_Lumpur'),($2,'Sarim','sarim','America/New_York')`, [users.deena, users.sarim]);
  await db.query("insert into public.shared_calendars(id,name) values ($1,'Our Time')", [calendarId]);
  await db.query('insert into public.calendar_members(calendar_id,user_id) values ($1,$2),($1,$3)', [calendarId, users.deena, users.sarim]);
}, 30000);
beforeEach(async () => { await db.exec('begin'); });
afterEach(async () => { await db.exec('rollback'); });
afterAll(async () => { await db?.close(); });

const periodId = '00000000-0000-4000-8000-000000000100';
const log = (start = '2026-01-01', end: string | null = '2026-01-05', user = users.deena, id = periodId) =>
  db.query('insert into public.period_entries(id,user_id,start_date,end_date,notes) values($1,$2,$3,$4,$5) returning *',[id,user,start,end,'Synthetic test note']);
const config = () => db.exec("insert into public.cycle_settings(cycle_length) values(28)");
// Keep a rejected statement from aborting subsequent assertions in the transaction.
const rejected = async (action: () => Promise<unknown>, match: RegExp) => {
  await db.exec('savepoint rejected');
  await expect(action()).rejects.toThrow(match);
  await db.exec('rollback to savepoint rejected');
};
describe('new migrations: private tracker RLS and custom colors on real embedded Postgres', () => {
  it('enables RLS and permits the mapped owner to persist, correct and delete her records/settings', async () => {
    await asUser(users.deena); await log(); await config();
    await db.exec("update public.period_entries set end_date='2026-01-06',notes='Corrected'; update public.cycle_settings set period_duration=6");
    expect((await db.query('select end_date::text,notes from public.period_entries')).rows).toEqual([{end_date:'2026-01-06',notes:'Corrected'}]);
    await db.exec('select public.delete_my_cycle_data()');
    expect((await db.query('select * from public.period_entries')).rows).toEqual([]);
    expect((await db.query('select * from public.cycle_settings')).rows).toEqual([]);
  });
  it.each([users.sarim,outsider])('denies peer and unrelated direct SELECT/INSERT/UPDATE/DELETE and RPC for %s', async id => {
    await asUser(users.deena); await log(); await config();
    await asUser(id);
    for (const table of ['period_entries','cycle_settings']) {
      expect((await db.query(`select * from public.${table}`)).rows).toEqual([]);
      expect((await db.query(`delete from public.${table} returning user_id`)).rows).toEqual([]);
    }
    expect((await db.query("update public.period_entries set notes='attacker' returning id")).rows).toEqual([]);
    expect((await db.query('update public.cycle_settings set cycle_length=30 returning user_id')).rows).toEqual([]);
    await rejected(() => log('2026-02-01','2026-02-05',id,'00000000-0000-4000-8000-000000000101'), /row-level security/);
    await rejected(() => db.query('insert into public.cycle_settings(user_id) values($1)',[id]), /row-level security/);
    await rejected(() => log('2026-02-01','2026-02-05',users.deena,'00000000-0000-4000-8000-000000000101'), /row-level security/);
    await rejected(() => db.exec('select public.delete_my_cycle_data()'), /Private tracker access/);
    await asUser(users.deena); expect((await db.query('select notes from public.period_entries')).rows).toEqual([{notes:'Synthetic test note'}]);
  });
  it('denies anonymous table and helper access', async () => {
    await db.exec('set local role anon');
    await rejected(() => db.exec('select * from public.period_entries'),/permission denied/);
    await rejected(() => db.exec('select * from public.cycle_settings'),/permission denied/);
    await rejected(() => db.exec('select public.is_private_cycle_owner()'),/permission denied/);
  });
  it('prevents frontend identity spoofing and ownership reassignment', async () => {
    await asUser(users.sarim);
    await rejected(() => db.exec("update public.profiles set person_key='deena'"),/permission denied/);
    await asUser(users.deena); await log();
    await rejected(() => db.query('update public.period_entries set user_id=$1',[users.sarim]),/ownership/);
  });
  it('accepts an ongoing record then ending it, rejects duplicate and overlapping dates', async () => {
    await asUser(users.deena); await log('2026-01-01',null);
    await rejected(() => log('2026-02-01','2026-02-05',users.deena,'00000000-0000-4000-8000-000000000101'),/overlap/);
    await db.exec("update public.period_entries set end_date='2026-01-05'");
    await log('2026-02-01',null,users.deena,'00000000-0000-4000-8000-000000000101');
    await rejected(() => log(),/overlap|duplicate/);
  });
  it('rejects future periods, reverse ranges, invalid settings and mismatched override anchors', async () => {
    await asUser(users.deena);
    await rejected(() => log('2190-01-01',null),/future/);
    await rejected(() => log('2026-01-05','2026-01-01'),/check constraint/);
    await rejected(() => db.exec('insert into public.cycle_settings(cycle_length) values(2)'),/check constraint/);
    await log(); await config();
    await rejected(() => db.exec("update public.cycle_settings set expected_next_date='2026-02-01',override_anchor='2025-12-01'"),/Refresh/);
    await db.exec("update public.cycle_settings set expected_next_date='2026-02-03',override_anchor='2026-01-01',missed_prediction_on='2026-01-29'");
    expect((await db.query('select start_date::text from public.period_entries')).rows).toEqual([{start_date:'2026-01-01'}]);
  });
  it('keeps sensitive records out of shared snapshots and broadcasts', async () => {
    await asUser(users.deena); await log(); await config();
    const result = JSON.stringify((await db.query('select public.load_shared_calendar()')).rows);
    expect(result).not.toContain('Synthetic test note'); expect(result).not.toContain('period_entries');
    expect((await db.query('select * from realtime.messages')).rows).toEqual([]);
  });
  it('roundtrips custom colors for both members, series and individual occurrence overrides', async () => {
    const colored = {...event,color:'#143254' as const}; const recurring = {...rule,color:'#abcdef' as const};
    await asUser(users.deena);
    await db.query('select public.import_local_calendar($1,$2::jsonb,$3::jsonb,$4::jsonb)',[calendarId,JSON.stringify([eventToWrite(colored,calendarId,users)]),JSON.stringify([ruleToWrite(recurring,calendarId,users)]),JSON.stringify([exceptionToWrite(`rule:${rule.id}:2026-08-26`,colored,calendarId,users)])]);
    await asUser(users.sarim);
    const {rows} = await db.query<{value: Snapshot}>('select public.load_shared_calendar() as value');
    const source=mapSnapshot(rows[0].value);
    expect(source.events[0].color).toBe('#143254'); expect(source.rules[0].color).toBe('#abcdef'); expect(Object.values(source.overrides)[0].color).toBe('#143254');
    await rejected(() => db.exec("update public.calendar_events set color='url(evil)'"),/check constraint/);
  });
});
