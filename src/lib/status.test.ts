import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { CalendarEvent, EventCategory, OwnerId, RecurringRule } from '../types';
import { getCurrentScheduleStatus } from './status';

function event(id: string, ownerId: OwnerId, category: EventCategory, startUtc: string, endUtc: string): CalendarEvent {
  return {
    id, ownerId, title: id, category, startUtc, endUtc,
    timezone: ownerId === 'deena' ? 'Asia/Kuala_Lumpur' : 'America/New_York',
    notes: '', isRecurring: false, openToStudyTogether: false, editable: true,
    createdAt: startUtc, updatedAt: startUtc,
  };
}

const source = (events: CalendarEvent[] = [], rules: RecurringRule[] = []) => ({ events, rules, overrides: {}, hiddenInstanceIds: [] });

describe('getCurrentScheduleStatus', () => {
  it('detects a class beginning exactly now', () => {
    const status = getCurrentScheduleStatus({ ...source([event('Class', 'deena', 'class', '2026-08-26T12:00:00Z', '2026-08-26T13:00:00Z')]), ownerId: 'deena', nowUtc: '2026-08-26T12:00:00Z' });
    expect(status.state).toBe('busy');
    expect(status.currentEvent?.title).toBe('Class');
  });

  it('treats an event ending exactly now as inactive and returns the next event while free', () => {
    const events = [
      event('Ending', 'deena', 'class', '2026-08-26T11:00:00Z', '2026-08-26T12:00:00Z'),
      event('Next class', 'deena', 'class', '2026-08-26T14:00:00Z', '2026-08-26T15:00:00Z'),
    ];
    const status = getCurrentScheduleStatus({ ...source(events), ownerId: 'deena', nowUtc: '2026-08-26T12:00:00Z' });
    expect(status.state).toBe('free');
    expect(status.currentEvent).toBeUndefined();
    expect(status.nextEvent?.title).toBe('Next class');
  });

  it('detects an overnight sleep occurrence after midnight', () => {
    const sleep: RecurringRule = {
      id: 'sleep', ownerId: 'sarim', title: 'Sleep', category: 'sleep', timezone: 'America/New_York',
      startTime: '23:30', endTime: '07:00', pattern: 'daily', weekdays: [], active: true,
      notes: '', openToStudyTogether: false,
    };
    const status = getCurrentScheduleStatus({ ...source([], [sleep]), ownerId: 'sarim', nowUtc: '2026-08-27T08:00:00Z' });
    expect(status.localTime.toFormat('yyyy-LL-dd HH:mm')).toBe('2026-08-27 04:00');
    expect(status.state).toBe('sleeping');
    expect(status.currentEvent?.category).toBe('sleep');
  });

  it('uses deterministic category, start, and ID priority for overlapping events', () => {
    const events = [
      event('study', 'deena', 'study', '2026-08-26T11:00:00Z', '2026-08-26T14:00:00Z'),
      event('class-b', 'deena', 'class', '2026-08-26T11:30:00Z', '2026-08-26T13:30:00Z'),
      event('class-a', 'deena', 'class', '2026-08-26T11:30:00Z', '2026-08-26T13:00:00Z'),
      event('sleep', 'deena', 'sleep', '2026-08-26T10:00:00Z', '2026-08-26T12:30:00Z'),
    ];
    const status = getCurrentScheduleStatus({ ...source(events), ownerId: 'deena', nowUtc: '2026-08-26T12:00:00Z' });
    expect(status.activeEvents.map((item) => item.id)).toEqual(['sleep', 'class-a', 'class-b', 'study']);
    expect(status.currentEvent?.id).toBe('sleep');
  });

  it('derives Kuala Lumpur and New York offsets for summer and winter with Luxon', () => {
    const summer = DateTime.fromISO('2026-08-26T12:00:00Z');
    const winter = DateTime.fromISO('2026-01-26T12:00:00Z');
    expect(summer.setZone('Asia/Kuala_Lumpur').offset).toBe(winter.setZone('Asia/Kuala_Lumpur').offset);
    expect(summer.setZone('America/New_York').offset).not.toBe(winter.setZone('America/New_York').offset);
    expect(summer.setZone('Asia/Kuala_Lumpur').isValid).toBe(true);
    expect(winter.setZone('America/New_York').isValid).toBe(true);
  });
});
