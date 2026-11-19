import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { eventToWrite, mapEventRow, mapRuleRow, ruleToWrite, exceptionToWrite, mapExceptionRow, mapSnapshot } from './calendarMapping';
import { createRecurringInstances, resolveEventsForRange } from '../lib/schedule';
import { getCurrentScheduleStatus } from '../lib/status';
import { answerCalendarQuestion } from '../lib/bot';
import { calendarId, emptySnapshot, event, rule, stamp, users } from '../test/calendarFixtures';

describe('cloud schedule mappings', () => {
  it('roundtrips event ownership, UTC instants, timezone and study flags', () => {
    const row = { ...eventToWrite({ ...event, openToStudyTogether: true }, calendarId, users), created_at: stamp, updated_at: stamp };
    expect(row.owner_user_id).toBe(users.sarim);
    expect(row).not.toHaveProperty('isRecurring');
    expect(mapEventRow(row)).toEqual({ ...event, openToStudyTogether: true });
  });
  it('normalizes offset database timestamps to UTC and excludes client timestamps from writes', () => {
    const payload = eventToWrite({ ...event, startUtc: '2026-08-26T10:00:00-04:00' }, calendarId, users);
    expect(payload.start_utc).toBe(event.startUtc);
    expect(payload).not.toHaveProperty('updated_at');
    expect(() => eventToWrite({ ...event, endUtc: event.startUtc }, calendarId, users)).toThrow();
  });
  it('roundtrips recurring local time and preserves Pennsylvania DST', () => {
    const mapped = mapRuleRow({ ...ruleToWrite(rule, calendarId, users), local_start_time: '10:00:00', created_at: stamp, updated_at: stamp });
    expect(mapped).toEqual(rule);
    const winter = createRecurringInstances([mapped], DateTime.fromISO('2026-02-02'), DateTime.fromISO('2026-02-03'))[0];
    const summer = createRecurringInstances([mapped], DateTime.fromISO('2026-08-03'), DateTime.fromISO('2026-08-04'))[0];
    expect(DateTime.fromISO(winter.startUtc).toUTC().hour).toBe(15);
    expect(DateTime.fromISO(summer.startUtc).toUTC().hour).toBe(14);
  });
  it('preserves occurrence identity through JSON serialization even after moving its time', () => {
    const id = `rule:${rule.id}:2026-08-26`;
    const row = JSON.parse(JSON.stringify({ ...exceptionToWrite(id, event, calendarId, users), id: 'exception-id', created_at: stamp, updated_at: stamp }));
    expect(mapExceptionRow(row)).toMatchObject({ id, event: { id, startUtc: event.startUtc, timezone: event.timezone, recurringRuleId: rule.id, isRecurring: true } });
    expect(mapExceptionRow({ ...row, exception_type: 'deleted', replacement_event: null })).toEqual({ id, event: null });
  });
  it('replaces duplicate snapshot records without duplicating resolved occurrences', () => {
    const snapshot = emptySnapshot();
    const row = { ...eventToWrite(event, calendarId, users), created_at: stamp, updated_at: stamp };
    snapshot.events = [row, row];
    snapshot.rules = [{ ...ruleToWrite(rule, calendarId, users), created_at: stamp, updated_at: stamp }];
    const exception = { ...exceptionToWrite(`rule:${rule.id}:2026-08-26`, event, calendarId, users), id: 'x', created_at: stamp, updated_at: stamp };
    snapshot.exceptions = [exception, exception];
    const source = mapSnapshot(snapshot);
    expect(source.events).toHaveLength(1);
    expect(Object.keys(source.overrides)).toHaveLength(1);
    expect(mapSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(source);
    const resolved = resolveEventsForRange({ ...source, rangeStart: '2026-08-26', rangeEnd: '2026-08-27' });
    expect(new Set(resolved.map(e => e.id)).size).toBe(resolved.length);
  });
  it('feeds changed cloud state to the unchanged resolver, current status and bot', () => {
    const snapshot = emptySnapshot();
    snapshot.events = [{ ...eventToWrite(event, calendarId, users), created_at: stamp, updated_at: stamp }];
    const busy = mapSnapshot(snapshot), now = DateTime.fromISO('2026-08-26T14:30Z');
    expect(getCurrentScheduleStatus({ ...busy, ownerId: 'sarim', nowUtc: now }).currentEvent?.title).toBe(event.title);
    expect(answerCalendarQuestion('What is Sarim doing right now?', { ...busy, currentUserId: 'deena', timezone: 'Asia/Kuala_Lumpur', now })).toContain(event.title);
    snapshot.events = [];
    expect(getCurrentScheduleStatus({ ...mapSnapshot(snapshot), ownerId: 'sarim', nowUtc: now }).state).toBe('free');
  });
});
