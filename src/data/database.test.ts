import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it } from 'vitest';
import { calendarId, event, outsider, rule, users } from '../test/calendarFixtures';
import { eventToWrite, exceptionToWrite, ruleToWrite } from './calendarMapping';

let db: PGlite;
const asUser = async (id: string) => { await db.exec('set local role authenticated'); await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id]); };
const insertEvent = async (owner = users.sarim, person = 'sarim') => db.query(`insert into public.calendar_events
  (id,calendar_id,owner_user_id,owner_person_key,title,category,start_utc,end_utc,timezone)
  values ('event',$1,$2,$3,'Class','class','2026-08-26T14:00Z','2026-08-26T15:00Z','America/New_York')`, [calendarId, owner, person]);
const importData = (events: unknown[], rules: unknown[] = [], exceptions: unknown[] = []) => db.query('select public.import_local_calendar($1,$2::jsonb,$3::jsonb,$4::jsonb)', [calendarId, JSON.stringify(events), JSON.stringify(rules), JSON.stringify(exceptions)]);

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
  await db.query('insert into auth.users values ($1),($2),($3)', [users.deena, users.sarim, outsider]);
  await db.query(`insert into public.profiles(id,display_name,person_key,timezone) values ($1,'Deena','deena','Asia/Kuala_Lumpur'),($2,'Sarim','sarim','America/New_York')`, [users.deena, users.sarim]);
  await db.query("insert into public.shared_calendars(id,name) values ($1,'Our Time')", [calendarId]);
  await db.query('insert into public.calendar_members(calendar_id,user_id) values ($1,$2),($1,$3)', [calendarId, users.deena, users.sarim]);
}, 30000);
beforeEach(async () => { await db.exec('begin'); });
afterEach(async () => { await db.exec('rollback'); });
afterAll(async () => { await db?.close(); });

describe('actual migration on local Postgres (PGlite)', () => {
  it('enables RLS on all six tables', async () => {
    const { rows } = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r'");
    expect(rows).toHaveLength(6); expect(rows.every(r => r.relrowsecurity)).toBe(true);
  });
  it('allows Deena to create and Sarim to edit/delete a Sarim-owned entry', async () => {
    await asUser(users.deena); await insertEvent();
    await asUser(users.sarim);
    expect((await db.query("update public.calendar_events set title='Changed' returning title")).rows).toEqual([{ title: 'Changed' }]);
    expect((await db.query('delete from public.calendar_events returning id')).rows).toHaveLength(1);
  });
  it('denies unrelated-user reads across all tables and snapshot', async () => {
    await insertEvent(); await asUser(outsider);
    for (const table of ['profiles','shared_calendars','calendar_members','calendar_events','recurring_rules','recurring_exceptions']) expect((await db.query(`select * from public.${table}`)).rows).toEqual([]);
    expect((await db.query('select public.load_shared_calendar() as value')).rows).toEqual([{ value: null }]);
  });
  it('denies unrelated-user creation', async () => { await asUser(outsider); await expect(insertEvent()).rejects.toThrow(/row-level security/); });
  it('hides rows from unrelated updates and deletes', async () => {
    await insertEvent(); await asUser(outsider);
    expect((await db.query("update public.calendar_events set title='Intruder' returning id")).rows).toEqual([]);
    expect((await db.query('delete from public.calendar_events returning id')).rows).toEqual([]);
  });
  it('denies anonymous table access', async () => { await db.exec('set local role anon'); await expect(db.query('select * from public.calendar_events')).rejects.toThrow(/permission denied/); });
  it('denies client membership escalation', async () => {
    await asUser(users.deena); await expect(db.query('insert into public.calendar_members values ($1,$2,$3)', [calendarId, outsider, 'editor'])).rejects.toThrow(/permission denied/);
  });
  it('denies client profile relabeling', async () => { await asUser(users.deena); await expect(db.query("update public.profiles set person_key='sarim'")).rejects.toThrow(/permission denied/); });
  it('rejects mismatched owner UUID and person label', async () => { await asUser(users.deena); await expect(insertEvent(users.deena, 'sarim')).rejects.toThrow(/foreign key/); });
  it('rejects an owner outside the calendar', async () => { await asUser(users.deena); await expect(insertEvent(outsider)).rejects.toThrow(/foreign key/); });
  it('atomically imports legacy IDs and prevents a second import even after all rows are deleted', async () => {
    await asUser(users.deena);
    const id = `rule:${rule.id}:2026-08-26`;
    await importData([eventToWrite(event, calendarId, users)], [ruleToWrite(rule, calendarId, users)], [exceptionToWrite(id, event, calendarId, users)]);
    const { rows } = await db.query<{ value: { events: unknown[]; rules: unknown[]; exceptions: { occurrence_key: string }[] } }>('select public.load_shared_calendar() as value');
    expect(rows[0].value.events).toHaveLength(1); expect(rows[0].value.rules).toHaveLength(1);
    expect(rows[0].value.exceptions[0].occurrence_key).toBe('2026-08-26');
    await db.exec('delete from public.calendar_events; delete from public.recurring_rules;');
    expect((await db.query('select * from public.recurring_exceptions')).rows).toEqual([]);
    await expect(importData([])).rejects.toThrow(/no longer empty/);
  });
  it('rolls back the whole import when an exception is invalid', async () => {
    await asUser(users.deena); await db.exec('savepoint bad_import');
    await expect(importData([eventToWrite(event, calendarId, users)], [ruleToWrite(rule, calendarId, users)], [{ recurring_rule_id: rule.id, occurrence_key: '2026-08-26', exception_type: 'override', replacement_event: {} }])).rejects.toThrow();
    await db.exec('rollback to savepoint bad_import');
    expect((await db.query('select * from public.calendar_events')).rows).toEqual([]);
    expect((await db.query('select * from public.recurring_rules')).rows).toEqual([]);
    expect((await db.query('select local_import_completed_at from public.shared_calendars')).rows).toEqual([{ local_import_completed_at: null }]);
  });
  it('denies unrelated access to the privileged import function', async () => { await asUser(outsider); await expect(importData([])).rejects.toThrow(/membership required/); });
  it('emits content-free private notifications and denies unrelated topic access', async () => {
    await insertEvent();
    expect((await db.query('select payload,private from realtime.messages')).rows).toEqual([{ payload: {}, private: true }]);
    await db.query("select set_config('realtime.topic',$1,true)", [`calendar:${calendarId}`]);
    await asUser(users.deena);
    expect((await db.query('select * from realtime.messages')).rows).toHaveLength(1);
    await asUser(outsider);
    expect((await db.query('select * from realtime.messages')).rows).toEqual([]);
  });
  it('refuses import when an ordinary event already exists', async () => { await asUser(users.sarim); await insertEvent(); await expect(importData([])).rejects.toThrow(/no longer empty/); });
  it('uses server timestamps and prevents changing stable event IDs', async () => {
    await asUser(users.deena); await insertEvent();
    const result = await db.query<{ updated_at: string }>("update public.calendar_events set updated_at='2000-01-01' returning updated_at");
    expect(new Date(result.rows[0].updated_at).getUTCFullYear()).toBeGreaterThan(2000);
    await expect(db.query("update public.calendar_events set id='different'")).rejects.toThrow(/identity cannot change/);
  });
});
