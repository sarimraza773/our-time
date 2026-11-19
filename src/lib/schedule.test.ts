import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { CalendarEvent, RecurringRule } from '../types';
import { resolveEventsForRange } from './schedule';

const rule: RecurringRule = {
  id: 'lecture', ownerId: 'deena', title: 'Psychology Lecture', category: 'class',
  timezone: 'Asia/Kuala_Lumpur', startTime: '10:00', endTime: '11:00', pattern: 'custom',
  weekdays: [3], active: true, notes: '', openToStudyTogether: false,
};

function oneTime(id = 'one-time'): CalendarEvent {
  return {
    id, ownerId: 'sarim', title: 'Dinner', category: 'food',
    startUtc: '2026-08-26T12:00:00.000Z', endUtc: '2026-08-26T13:00:00.000Z',
    timezone: 'America/New_York', notes: '', isRecurring: false,
    openToStudyTogether: false, editable: true,
    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

const range = {
  rangeStart: DateTime.fromISO('2026-08-26T00:00:00Z'),
  rangeEnd: DateTime.fromISO('2026-08-27T00:00:00Z'),
};

describe('resolveEventsForRange', () => {
  it('includes generated recurring instances and one-time events in sorted order', () => {
    const result = resolveEventsForRange({ events: [oneTime()], rules: [rule], overrides: {}, hiddenInstanceIds: [], ...range });
    expect(result.map((event) => event.id)).toEqual(['rule:lecture:2026-08-26', 'one-time']);
  });

  it('removes a hidden recurring instance', () => {
    const result = resolveEventsForRange({ events: [], rules: [rule], overrides: {}, hiddenInstanceIds: ['rule:lecture:2026-08-26'], ...range });
    expect(result).toHaveLength(0);
  });

  it('replaces a generated instance with its override without duplicating it', () => {
    const instanceId = 'rule:lecture:2026-08-26';
    const override: CalendarEvent = {
      ...oneTime(instanceId), ownerId: 'deena', title: 'Moved Psychology Lecture', category: 'class',
      timezone: 'Asia/Kuala_Lumpur', startUtc: '2026-08-26T06:00:00.000Z', endUtc: '2026-08-26T07:00:00.000Z',
      isRecurring: true, recurringRuleId: rule.id,
    };
    const result = resolveEventsForRange({ events: [], rules: [rule], overrides: { [instanceId]: override }, hiddenInstanceIds: [], ...range });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: instanceId, title: 'Moved Psychology Lecture', startUtc: '2026-08-26T06:00:00.000Z' });
  });

  it('includes an override moved into the range from an original date outside it', () => {
    const instanceId = 'rule:lecture:2026-09-02';
    const moved = { ...oneTime(instanceId), ownerId: 'deena' as const, category: 'class' as const, startUtc: '2026-08-26T15:00:00.000Z', endUtc: '2026-08-26T16:00:00.000Z', isRecurring: true };
    const result = resolveEventsForRange({ events: [], rules: [], overrides: { [instanceId]: moved }, hiddenInstanceIds: [], ...range });
    expect(result.map((event) => event.id)).toEqual([instanceId]);
  });
});
