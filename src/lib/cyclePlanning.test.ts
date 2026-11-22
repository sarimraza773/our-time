import { describe,it,expect } from 'vitest';
import { makePhasePlan,resizePhase,validatePhasePlan } from './cyclePlanning';
import { DEFAULT_CYCLE,cycleModel,type PeriodEntry,type CycleSettings } from './period';
const settings:CycleSettings={...DEFAULT_CYCLE,user_id:'synthetic-owner',updated_at:'v1',estimate_mode:'manual'};
const entry=(start:string,end:string):PeriodEntry=>({id:start,user_id:'synthetic-owner',start_date:start,end_date:end,notes:'',updated_at:'v1'});
describe('phase planning and predicted log model',()=>{
 it('creates four date-only phases and shifts later dates when a duration changes',()=>{
  const plan=makePhasePlan('2028-02-26',settings);validatePhasePlan(plan,true);
  expect(plan.phases[0].end_date).toBe('2028-03-01');
  const next=resizePhase(plan,0,6);expect(next.phases[0].end_date).toBe('2028-03-02');expect(next.phases[1].start_date).toBe('2028-03-03');
 });
 it('rejects phase overlaps, reversed dates, missing phases and excessive ranges',()=>{
  const plan=makePhasePlan('2026-03-01',settings);
  expect(()=>validatePhasePlan({...plan,phases:plan.phases.slice(0,3)})).toThrow();
  expect(()=>validatePhasePlan({...plan,phases:plan.phases.map((p,i)=>i===1?{...p,start_date:'2026-03-01'}:p)})).toThrow();
  expect(()=>validatePhasePlan(resizePhase(plan,0,121))).toThrow();
 });
 it('applies manually set dates to inspection and keeps recorded bleeding higher priority',()=>{
  const records=[entry('2026-03-01','2026-03-05')],plan={...makePhasePlan('2026-03-01',settings),user_id:'synthetic-owner',updated_at:'v1'};
  const model=cycleModel(records,settings,'2026-03-08',[plan]);
  expect(model.current).toMatchObject({phase:'follicular',manual:true});expect(model.timeline).toHaveLength(28);expect(model.timeline.find(d=>d.date==='2026-03-08')?.manual).toBe(true);
    expect(cycleModel([],null,'2026-03-08',[plan]).timeline).toHaveLength(28);expect(model.inspect('2026-03-03')).toMatchObject({phase:'menstruation',recorded:true});
 });
 it('displays an active automatic prediction without changing actual history or counting it for estimation',()=>{
  const records=[entry('2026-01-01','2026-01-05'),entry('2026-01-29','2026-02-02'),entry('2026-02-26','2026-03-02')];
  const p={id:'prediction',user_id:'synthetic-owner',anchor_start:'2026-02-26',start_date:'2026-03-26',end_date:'2026-03-30',status:'predicted' as const,confirmed_entry_id:null,updated_at:'v1'};
  const model=cycleModel(records,settings,'2026-03-27',[],[p]);
  expect(model.current).toMatchObject({phase:'menstruation',automatic:true,predicted:true,recorded:false,cycleDay:2});expect(model.timeline[0].date).toBe('2026-03-26');expect(model.timeline.find(d=>d.date==='2026-03-27')?.automatic).toBe(true);expect(model.records).toHaveLength(3);expect(model.lengths).toEqual([28,28]);
  expect(cycleModel(records,{...settings,auto_log_predictions:false},'2026-03-27',[],[p]).current.automatic).toBeUndefined();
  expect(cycleModel(records,settings,'2026-03-27',[],[{...p,status:'dismissed'}]).next).toBeNull();
 });
});
