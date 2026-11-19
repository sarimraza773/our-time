import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { CalendarEvent, RecurringRule } from '../types';
import { answerCalendarQuestion, type BotCalendarContext } from './bot';
import { resolveEventsForRange } from './schedule';
import { getCurrentScheduleStatus } from './status';

const rule: RecurringRule = {
  id: 'class', ownerId: 'deena', title: 'Original Class', category: 'class', timezone: 'Asia/Kuala_Lumpur',
  startTime: '10:00', endTime: '11:00', pattern: 'custom', weekdays: [3], active: true,
  notes: '', openToStudyTogether: false,
};
const instanceId = 'rule:class:2026-08-26';

function context(overrides: Record<string, CalendarEvent> = {}, hiddenInstanceIds: string[] = []): BotCalendarContext {
  return {
    events: [], rules: [rule], overrides, hiddenInstanceIds,
    timezone: 'Asia/Kuala_Lumpur', currentUserId: 'deena',
    now: DateTime.fromISO('2026-08-25T02:00:00Z'),
  };
}

describe('bot schedule consistency', () => {
  it('agrees with the resolver and status when an occurrence is moved', () => {
    const moved: CalendarEvent = {
      id: instanceId, ownerId: 'deena', title: 'Moved Class', category: 'class',
      startUtc: '2026-08-26T06:00:00.000Z', endUtc: '2026-08-26T07:00:00.000Z',
      timezone: 'Asia/Kuala_Lumpur', notes: '', isRecurring: true, recurringRuleId: rule.id,
      openToStudyTogether: false, editable: true, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
    };
    const ctx = context({ [instanceId]: moved });
    const visible = resolveEventsForRange({ ...ctx, rangeStart: '2026-08-26T00:00:00Z', rangeEnd: '2026-08-27T00:00:00Z' });
    const status = getCurrentScheduleStatus({ ...ctx, ownerId: 'deena', nowUtc: '2026-08-26T02:00:00Z' });
    const answer = answerCalendarQuestion('What is Deena doing Wednesday at 10 AM?', ctx);
    expect(visible).toHaveLength(1);
    expect(visible[0].title).toBe('Moved Class');
    expect(status.state).toBe('free');
    expect(answer).toContain('Deena is free');
    expect(answer).not.toContain('Original Class');
  });

  it('agrees that a deleted recurring occurrence is absent', () => {
    const ctx = context({}, [instanceId]);
    const visible = resolveEventsForRange({ ...ctx, rangeStart: '2026-08-26T00:00:00Z', rangeEnd: '2026-08-27T00:00:00Z' });
    const status = getCurrentScheduleStatus({ ...ctx, ownerId: 'deena', nowUtc: '2026-08-26T02:00:00Z' });
    const answer = answerCalendarQuestion('What is Deena doing Wednesday at 10 AM?', ctx);
    expect(visible).toHaveLength(0);
    expect(status.state).toBe('free');
    expect(answer).toContain('Deena is free');
    expect(answer).not.toContain('Original Class');
  });

  it('answers both-free-now from the same empty resolved schedule', () => {
    const ctx = { ...context(), rules: [] };
    expect(answerCalendarQuestion('Are we both free right now?', ctx)).toContain('both free right now');
  });

  it('recognizes overlapping opted-in study events right now', () => {
    const study = (id: string, ownerId: 'deena' | 'sarim'): CalendarEvent => ({
      id, ownerId, title: 'Study Block', category: 'study',
      startUtc: '2026-08-25T01:00:00Z', endUtc: '2026-08-25T03:00:00Z',
      timezone: ownerId === 'deena' ? 'Asia/Kuala_Lumpur' : 'America/New_York',
      notes: '', isRecurring: false, openToStudyTogether: true, editable: true,
      createdAt: '2026-08-25T01:00:00Z', updatedAt: '2026-08-25T01:00:00Z',
    });
    const ctx = { ...context(), events: [study('d', 'deena'), study('s', 'sarim')], rules: [] };
    expect(answerCalendarQuestion('Can we study together right now?', ctx)).toContain('both have opted-in study time');
  });
});
