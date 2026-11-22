import { describe, expect, it } from 'vitest';
import { addDays, cycleModel, daysBetween, DEFAULT_CYCLE, validatePeriod, validateCycle, type CycleSettings, type PeriodEntry } from './period';
const today = '2026-03-20';
const entry = (start: string, end: string | null = addDays(start, 4)): PeriodEntry => ({ id: start, user_id: 'synthetic-owner', start_date: start, end_date: end, notes: '', updated_at: 'v1' });
const settings = (patch: Partial<CycleSettings> = {}): CycleSettings => ({ ...DEFAULT_CYCLE, user_id: 'synthetic-owner', updated_at: 'v1', estimate_mode: 'manual', ...patch });
describe('private date-only cycle estimates', () => {
  it('does not invent a forecast before logging or without sufficient history', () => {
    expect(cycleModel([], null, today).next).toBeNull();
    const model = cycleModel([entry('2026-03-01')], null, today);
    expect(model.next).toBeNull(); expect(model.current.phase).toBeNull(); expect(model.uncertainty).toMatch(/three period starts/);
  });
  it('counts first bleeding day as one and leaves ongoing end unknown', () => {
    const model = cycleModel([entry('2026-03-18', null)], settings(), today);
    expect(model.current).toMatchObject({ cycleDay: 3, phase: 'menstruation', recorded: true, start: '2026-03-18', end: null, ongoing: true });
    expect(model.records[0].end_date).toBeNull();
  });
  it('keeps all boundaries estimated outside actual records, including ovulation', () => {
    const records = [entry('2026-03-01')];
    expect(cycleModel(records, settings(), '2026-03-08').current).toMatchObject({ phase: 'follicular', recorded: false, predicted: true, phaseDay: 3 });
    expect(cycleModel(records, settings(), '2026-03-15').current.phase).toBe('ovulation');
    expect(cycleModel(records, settings(), today).current).toMatchObject({ phase: 'luteal', start: '2026-03-17', end: '2026-03-28' });
    const model = cycleModel(records, settings(), today);
    expect(model.next).toBe('2026-03-29'); expect(model.nextEnd).toBe('2026-04-02'); expect(model.daysRemaining).toBe(9);
  });
  it('uses a median of history and reports irregularity without clamping actual cycles', () => {
    const model = cycleModel([entry('2026-01-01'), entry('2026-01-21'), entry('2026-03-02')], settings({ estimate_mode: 'history' }), today);
    expect(model.lengths).toEqual([20,40]); expect(model.length).toBe(30); expect(model.irregular).toBe(true); expect(model.next).toBe('2026-04-01');
  });
  it.each([18,28,60,120])('supports %i-day cycles', cycle_length => {
    const model = cycleModel([entry('2026-03-01')], settings({ cycle_length, luteal_length: 10 }), '2026-03-02');
    expect(model.next).toBe(addDays('2026-03-01', cycle_length));
  });
  it('reanchors early arrivals and ignores a stale override without altering history', () => {
    const records = [entry('2026-02-01'), entry('2026-03-01')]; const before = JSON.stringify(records);
    const saved = settings({ expected_next_date: '2026-04-02', override_anchor: '2026-03-01' });
    expect(cycleModel(records, saved, today).next).toBe('2026-04-02');
    const after = cycleModel([...records, entry('2026-03-21', null)], saved, '2026-03-21');
    expect(after.current.cycleDay).toBe(1); expect(after.next).toBe('2026-04-18'); expect(after.overrideActive).toBe(false); expect(JSON.stringify(records)).toBe(before);
  });
  it('does not roll a late cycle or record missed predictions', () => {
    const records = [entry('2026-02-01')];
    const model = cycleModel(records, settings(), today);
    expect(model.overdue).toBe(true); expect(model.current.cycleDay).toBe(48); expect(model.current.phase).toBeNull(); expect(model.records).toHaveLength(1);
    const missed = settings({ override_anchor: '2026-02-01', missed_prediction_on: '2026-03-01' });
    expect(cycleModel(records, missed, today).next).toBeNull();
    const adjusted = cycleModel(records, { ...missed, expected_next_date: '2026-03-28' }, today);
    expect(adjusted.next).toBe('2026-03-28'); expect(adjusted.inspect('2026-03-28')).toMatchObject({ predicted: true, recorded: false, adjusted: true });
  });
  it('never replaces historical bleeding when settings or forecasts change', () => {
    const records = [entry('2026-02-01','2026-02-09'),entry('2026-03-01')];
    expect(cycleModel(records,settings({ period_duration: 3 }),today).inspect('2026-02-08')).toMatchObject({ phase: 'menstruation', recorded: true });
  });
  it('rejects duplicate/overlapping/future records and invalid boundaries', () => {
    const records = [entry('2026-03-01')];
    expect(() => validatePeriod({ ...records[0], id: 'other' },records,today)).toThrow(/overlap/);
    expect(() => validatePeriod({ ...entry('2026-03-21') },[],today)).toThrow(/actually started/);
    expect(() => validatePeriod({ ...entry('2026-03-02','2026-03-01') },[],today)).toThrow(/end must/);
    expect(() => validatePeriod({ ...records[0], start_date: '2026-02-30' },[],today)).toThrow();
    expect(() => validateCycle({ ...DEFAULT_CYCLE, cycle_length: 10 })).toThrow(/shorter/);
  });
  it('handles leap years, month/year boundaries and DST without UTC date shifts', () => {
    expect(addDays('2028-02-28',1)).toBe('2028-02-29'); expect(addDays('2028-02-29',1)).toBe('2028-03-01');
    expect(addDays('2026-12-31',1)).toBe('2027-01-01'); expect(daysBetween('2026-03-07','2026-03-10')).toBe(3);
    expect(daysBetween('2026-10-31','2026-11-02')).toBe(2);
  });
});
