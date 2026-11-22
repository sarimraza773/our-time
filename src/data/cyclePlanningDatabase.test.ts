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
  await db.exec(readFileSync(new URL('../../supabase/migrations/202611220004_phase_plans_and_predictions.sql', import.meta.url), 'utf8'));
  await db.query('insert into auth.users values ($1),($2),($3)', [users.deena, users.sarim, outsider]);
  await db.query(`insert into public.profiles(id,display_name,person_key,timezone) values ($1,'Deena','deena','Asia/Kuala_Lumpur'),($2,'Sarim','sarim','America/New_York')`, [users.deena, users.sarim]);
  await db.query("insert into public.shared_calendars(id,name) values ($1,'Our Time')", [calendarId]);
  await db.query('insert into public.calendar_members(calendar_id,user_id) values ($1,$2),($1,$3)', [calendarId, users.deena, users.sarim]);
}, 30000);
beforeEach(async () => { await db.exec('begin'); });
afterEach(async () => { await db.exec('rollback'); });
afterAll(async () => { await db?.close(); });

const rejected=async(action:()=>Promise<unknown>,match:RegExp)=>{await db.exec('savepoint rejected');await expect(action()).rejects.toThrow(match);await db.exec('rollback to savepoint rejected');};
const log=(start:string,end:string)=>db.query('insert into public.period_entries(user_id,start_date,end_date) values($1,$2,$3)',[users.deena,start,end]);
const history=async()=>{await log('2026-01-01','2026-01-05');await log('2026-01-29','2026-02-02');await log('2026-02-26','2026-03-02');};
const forecast=async()=> (await db.query<{id:string;start_date:string;end_date:string;status:string;updated_at:string}>('select id,start_date::text,end_date::text,status,updated_at::text from public.cycle_predictions order by anchor_start desc limit 1')).rows[0];
const phases=[{phase:'menstruation',start_date:'2026-02-26',end_date:'2026-03-02'},{phase:'follicular',start_date:'2026-03-03',end_date:'2026-03-10'},{phase:'ovulation',start_date:'2026-03-11',end_date:'2026-03-13'},{phase:'luteal',start_date:'2026-03-14',end_date:'2026-03-25'}];
const savePlan=(value=phases,future=false,stamp:string|null=null)=>db.query('select public.save_cycle_phase_plan($1,$2::jsonb,$3,$4)', ['2026-02-26',JSON.stringify(value),future,stamp]);
describe('phase plans and automatic predicted logs on embedded PostgreSQL',()=>{
 it('starts automatically at exactly three actual starts, never fabricates an actual period',async()=>{
  await asUser(users.deena);await log('2026-01-01','2026-01-05');await log('2026-01-29','2026-02-02');
  expect((await db.query('select * from public.cycle_predictions')).rows).toHaveLength(0);
  await log('2026-02-26','2026-03-02');
  expect(await forecast()).toMatchObject({start_date:'2026-03-26',end_date:'2026-03-30',status:'predicted'});
  expect((await db.query('select * from public.period_entries')).rows).toHaveLength(3);
 });
 it('rounds a half-day historical median consistently with the client model',async()=>{
  await asUser(users.deena);await log('2026-01-01','2026-01-05');await log('2026-01-29','2026-02-02');await log('2026-02-27','2026-03-03');
  expect((await forecast()).start_date).toBe('2026-03-28');
 });
 it('is idempotent across refreshes and both accounts and leaves training history unchanged',async()=>{
  await asUser(users.deena);await history();const before=await forecast();
  await asUser(users.sarim);await db.exec('select public.sync_cycle_predictions();select public.sync_cycle_predictions()');
  expect(await forecast()).toEqual(before);expect((await db.query('select * from public.cycle_predictions')).rows).toHaveLength(1);
  expect((await db.query('select * from public.period_entries')).rows).toHaveLength(3);
 });
 it('pauses and resumes without creating actuals or duplicates',async()=>{
  await asUser(users.deena);await history();await db.query('insert into public.cycle_settings(user_id,auto_log_predictions) values($1,false)',[users.deena]);
  expect((await forecast()).status).toBe('superseded');await db.exec('update public.cycle_settings set auto_log_predictions=true');
  expect((await forecast()).status).toBe('predicted');expect((await db.query('select * from public.cycle_predictions')).rows).toHaveLength(1);
 });
 it('dismisses a forecast durably and recalculates when its date is explicitly adjusted',async()=>{
  await asUser(users.deena);await history();const p=await forecast();
  await db.query('select public.dismiss_cycle_prediction($1,$2)',[p.id,p.updated_at]);await db.exec('select public.sync_cycle_predictions()');
  expect((await forecast()).status).toBe('dismissed');
  await db.query("insert into public.cycle_settings(user_id,override_anchor,expected_next_date) values($1,'2026-02-26','2026-04-01')",[users.deena]);
  expect(await forecast()).toMatchObject({start_date:'2026-04-01',status:'predicted'});
 });
 it('confirms corrected actual dates atomically and then generates the next forecast from actual starts',async()=>{
  await asUser(users.deena);await history();const p=await forecast();await asUser(users.sarim);
  await db.query("select public.confirm_cycle_prediction($1,'2026-03-24','2026-03-28','Synthetic confirmation',$2)",[p.id,p.updated_at]);
  expect((await db.query("select status,confirmed_entry_id is not null as linked from public.cycle_predictions where id=$1",[p.id])).rows).toEqual([{status:'confirmed',linked:true}]);
  expect((await db.query('select * from public.period_entries')).rows).toHaveLength(4);
  expect((await forecast()).start_date).toBe('2026-04-21');
 });
 it('refuses future actual confirmation and stale prediction actions without losing the forecast',async()=>{
  await asUser(users.deena);await history();const p=await forecast();
  await rejected(()=>db.query("select public.confirm_cycle_prediction($1,'2190-01-01',null,'',$2)",[p.id,p.updated_at]),/future/);
  await rejected(()=>db.query("select public.dismiss_cycle_prediction($1,'2000-01-01')",[p.id]),/changed/);
  expect((await forecast()).status).toBe('predicted');
 });
 it.each([users.deena,users.sarim])('lets linked editor %s save all four phases and their future durations',async id=>{
  await asUser(id);await savePlan(phases,true);
  expect((await db.query('select phases from public.cycle_phase_plans')).rows).toHaveLength(1);
  expect((await db.query('select cycle_length,period_duration,phase_lengths from public.cycle_settings')).rows).toEqual([{cycle_length:28,period_duration:5,phase_lengths:{menstruation:5,follicular:8,ovulation:3,luteal:12}}]);
  await asUser(id===users.deena?users.sarim:users.deena);expect((await db.query('select phases from public.cycle_phase_plans')).rows).toHaveLength(1);
 });
 it('rejects overlapping, missing, invalid and stale manual phase dates',async()=>{
  await asUser(users.deena);
  await rejected(()=>savePlan(phases.map((p,i)=>i===1?{...p,start_date:'2026-03-01'}:p)),/Invalid phase/);
  await rejected(()=>savePlan(phases.slice(0,3)),/Invalid phase/);
  await rejected(()=>savePlan(phases.map((p,i)=>i===0?{...p,start_date:'2026-02-30'}:p)),/Invalid phase/);
  await savePlan();await rejected(()=>savePlan(),/changed/);
 });
 it('denies outsiders/anonymous users all new reads and RPC mutations, including forged statuses',async()=>{
  await asUser(users.deena);await history();await savePlan();await asUser(outsider);
  for(const table of ['cycle_predictions','cycle_phase_plans']) expect((await db.query(`select * from public.${table}`)).rows).toHaveLength(0);
  await rejected(()=>db.exec('select public.sync_cycle_predictions()'),/Linked tracker/);
  await rejected(()=>savePlan(),/Linked tracker/);
  await asUser(users.sarim);await rejected(()=>db.exec("update public.cycle_predictions set status='confirmed'"),/permission denied/);
  await rejected(()=>db.exec("select public.sync_cycle_predictions_for('00000000-0000-4000-8000-000000000001')"),/permission denied/);
  await db.exec('set local role anon');await rejected(()=>db.exec('select * from public.cycle_predictions'),/permission denied/);
  await rejected(()=>db.exec('select public.sync_cycle_predictions()'),/permission denied/);
 });
 it('removes all actuals, plans, predictions and settings through the existing delete-all action',async()=>{
  await asUser(users.deena);await history();await savePlan(phases,true);await db.exec('select public.delete_cycle_tracker_data()');
  for(const table of ['period_entries','cycle_settings','cycle_phase_plans','cycle_predictions']) expect((await db.query(`select * from public.${table}`)).rows).toHaveLength(0);
 });
});
