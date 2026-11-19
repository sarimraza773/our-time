import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import type { CalendarEvent, RecurringRule } from '../types';
import { calculateMutualFreeSlots, calculateStudyTogetherSlots, convertTimezone, createRecurringInstances } from './calendar';

const rule:RecurringRule = {id:'dst',ownerId:'sarim',title:'Class',category:'class',timezone:'America/New_York',startTime:'09:00',endTime:'10:00',pattern:'custom',weekdays:[1],active:true,notes:'',openToStudyTogether:false};

function event(id:string,ownerId:'deena'|'sarim',startUtc:string,endUtc:string,open=false):CalendarEvent {
  return {id,ownerId,title:'Study',category:'study',startUtc,endUtc,timezone:ownerId==='deena'?'Asia/Kuala_Lumpur':'America/New_York',notes:'',isRecurring:false,openToStudyTogether:open,editable:true,createdAt:startUtc,updatedAt:startUtc};
}

describe('calendar timezone and availability utilities',()=>{
  it('keeps recurring New York wall-clock time stable across DST',()=>{
    const winter=createRecurringInstances([rule],DateTime.fromISO('2026-02-01T00:00Z'),DateTime.fromISO('2026-02-03T00:00Z'))[0];
    const summer=createRecurringInstances([rule],DateTime.fromISO('2026-08-02T00:00Z'),DateTime.fromISO('2026-08-04T00:00Z'))[0];
    expect(convertTimezone(winter.startUtc,'America/New_York').toFormat('HH:mm')).toBe('09:00');
    expect(convertTimezone(summer.startUtc,'America/New_York').toFormat('HH:mm')).toBe('09:00');
    expect(DateTime.fromISO(winter.startUtc).toUTC().hour).not.toBe(DateTime.fromISO(summer.startUtc).toUTC().hour);
  });

  it('calculates study-together overlap only when both opt in',()=>{
    const events=[event('d','deena','2026-08-26T12:00:00Z','2026-08-26T14:00:00Z',true),event('s','sarim','2026-08-26T13:00:00Z','2026-08-26T15:00:00Z',true)];
    const overlap=calculateStudyTogetherSlots(events)[0];
    expect(DateTime.fromISO(overlap.startUtc).toUTC().toISO()).toBe('2026-08-26T13:00:00.000Z');
    expect(DateTime.fromISO(overlap.endUtc).toUTC().toISO()).toBe('2026-08-26T14:00:00.000Z');
    events[1].openToStudyTogether=false;
    expect(calculateStudyTogetherSlots(events)).toHaveLength(0);
  });

  it('removes an explicit commitment from a study-together overlap',()=>{
    const events=[event('d','deena','2026-08-26T12:00:00Z','2026-08-26T14:00:00Z',true),event('s','sarim','2026-08-26T12:00:00Z','2026-08-26T14:00:00Z',true),{...event('class','sarim','2026-08-26T12:30:00Z','2026-08-26T13:30:00Z'),category:'class' as const}];
    expect(calculateStudyTogetherSlots(events,30)).toHaveLength(2);
  });

  it('finds mutual gaps from each person’s commitments',()=>{
    const day=DateTime.fromISO('2026-08-26',{zone:'Asia/Kuala_Lumpur'});
    const events=[event('d','deena','2026-08-26T00:00:00Z','2026-08-26T01:00:00Z'),event('s','sarim','2026-08-26T01:00:00Z','2026-08-26T02:00:00Z')];
    const slots=calculateMutualFreeSlots(events,day,'Asia/Kuala_Lumpur',30);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((slot)=>DateTime.fromISO(slot.endUtc)>DateTime.fromISO(slot.startUtc))).toBe(true);
  });
});
