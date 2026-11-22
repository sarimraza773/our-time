import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { CalendarEvent, RecurringRule } from '../types';
import { createRecurringInstances, resolveEventsForRange } from './schedule';

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

describe('date-based repeat schedules', () => {
  function instances(changes: Partial<RecurringRule>, from: string, to: string) {
    const zoned = (date: string) => DateTime.fromISO(date, { zone: rule.timezone });
    return createRecurringInstances([{ ...rule, weekdays: [], startDate: '2026-08-26', ...changes }], zoned(from), zoned(to));
  }
  const dates = (events: CalendarEvent[]) => events.map(event => event.id.slice(-10));

  it.each([
    ['daily', ['2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']],
    ['weekly', ['2026-08-26', '2026-09-02']],
  ] as const)('anchors %s to the selected start date', (pattern, expected) => {
    expect(dates(instances({ pattern }, '2026-08-24', '2026-09-03'))).toEqual(expected);
  });

  it('uses the original monthly date after a shorter month', () => {
    expect(dates(instances({ pattern: 'monthly', startDate: '2026-01-31' }, '2026-01-01', '2026-04-01')))
      .toEqual(['2026-01-31', '2026-03-31']);
  });

  it('repeats annually on the selected month and day', () => {
    expect(dates(instances({ pattern: 'yearly', startDate: '2024-02-29' }, '2025-01-01', '2029-01-01')))
      .toEqual(['2028-02-29']);
  });

  it('supports multiple weekdays in alternate weeks with an inclusive end date', () => {
    expect(dates(instances({ pattern: 'weekly', weekdays: [1, 3, 5], interval: 2, endDate: '2026-09-09' }, '2026-08-24', '2026-10-01')))
      .toEqual(['2026-08-26', '2026-08-28', '2026-09-07', '2026-09-09']);
  });

  it('supports custom daily, monthly and yearly intervals', () => {
    expect(dates(instances({ pattern: 'daily', interval: 3 }, '2026-08-25', '2026-09-01'))).toEqual(['2026-08-26', '2026-08-29']);
    expect(dates(instances({ pattern: 'monthly', interval: 2 }, '2026-08-25', '2027-01-01'))).toEqual(['2026-08-26', '2026-10-26', '2026-12-26']);
    expect(dates(instances({ pattern: 'yearly', interval: 2 }, '2026-08-25', '2029-01-01'))).toEqual(['2026-08-26', '2028-08-26']);
  });

  it('includes the last overnight occurrence on the following day and keeps its color', () => {
    const occurrences = instances({ pattern: 'daily', endDate: '2026-08-26', startTime: '23:45', endTime: '00:30', color: 'peony' },
      '2026-08-27', '2026-08-28');
    expect(dates(occurrences)).toEqual(['2026-08-26']);
    expect(occurrences[0]).toMatchObject({ color: 'peony', startUtc: '2026-08-26T15:45:00.000Z', endUtc: '2026-08-26T16:30:00.000Z' });
  });
});
