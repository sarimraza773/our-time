import { DateTime } from 'luxon';
import type { CalendarEvent, RecurringRule } from '../types';

export interface ScheduleSource {
  events: CalendarEvent[];
  rules: RecurringRule[];
  overrides: Record<string, CalendarEvent>;
  hiddenInstanceIds: readonly string[];
}

export interface ResolveEventsForRangeInput extends ScheduleSource {
  rangeStart: DateTime | string;
  rangeEnd: DateTime | string;
}

const toUtc = (value: DateTime | string) =>
  (typeof value === 'string' ? DateTime.fromISO(value, { setZone: true }) : value).toUTC();

const intersects = (event: CalendarEvent, start: DateTime, end: DateTime) => {
  const eventStart = DateTime.fromISO(event.startUtc, { setZone: true }).toUTC();
  const eventEnd = DateTime.fromISO(event.endUtc, { setZone: true }).toUTC();
  return eventStart.isValid && eventEnd.isValid && eventEnd > start && eventStart < end;
};

function occursOn(rule: RecurringRule, localDate: DateTime) {
  if (!rule.active) return false;
  if (rule.startDate) {
    const date = localDate.toISODate()!;
    if (date < rule.startDate || (rule.endDate && date > rule.endDate)) return false;
    // Compare calendar dates independently of the timezone's DST transitions.
    const anchor = DateTime.fromISO(rule.startDate, { zone: 'utc' });
    const day = DateTime.fromISO(date, { zone: 'utc' });
    const interval = rule.interval ?? 1;
    switch (rule.pattern) {
      case 'daily':
        return day.diff(anchor, 'days').days % interval === 0;
      case 'weekly':
        return day.startOf('week').diff(anchor.startOf('week'), 'weeks').weeks % interval === 0
          && (rule.weekdays.length ? rule.weekdays.includes(day.weekday) : anchor.weekday === day.weekday);
      case 'monthly':
        return ((day.year - anchor.year) * 12 + day.month - anchor.month) % interval === 0 && day.day === anchor.day;
      case 'yearly':
        return (day.year - anchor.year) % interval === 0 && day.month === anchor.month && day.day === anchor.day;
    }
  }
  if (rule.pattern === 'daily') return true;
  if (rule.pattern === 'weekdays') return localDate.weekday <= 5;
  if (rule.pattern === 'weekly') return localDate.weekday === (rule.weekdays[0] ?? 1);
  return rule.weekdays.includes(localDate.weekday);
}

export function createRecurringInstances(
  rules: RecurringRule[],
  rangeStart: DateTime,
  rangeEnd: DateTime,
): CalendarEvent[] {
  const startUtc = rangeStart.toUTC();
  const endUtc = rangeEnd.toUTC();
  const generated: CalendarEvent[] = [];

  for (const rule of rules) {
    let cursor = startUtc.setZone(rule.timezone).startOf('day').minus({ days: 1 });
    const localEnd = endUtc.setZone(rule.timezone).endOf('day');

    while (cursor <= localEnd) {
      if (occursOn(rule, cursor)) {
        const localDate = cursor.toISODate()!;
        const start = DateTime.fromISO(`${localDate}T${rule.startTime}`, { zone: rule.timezone });
        // Build the next day's time in its own zone so an overnight recurrence
        // retains its intended wall time across a clock change.
        const endDate = rule.endTime <= rule.startTime ? cursor.plus({ days: 1 }).toISODate() : localDate;
        const end = DateTime.fromISO(`${endDate}T${rule.endTime}`, { zone: rule.timezone });

        if (start.isValid && end.isValid && end > start && end > startUtc && start < endUtc) {
          const stamp = start.toUTC().toISO()!;
          generated.push({
            id: `rule:${rule.id}:${localDate}`,
            ownerId: rule.ownerId,
            title: rule.title,
            category: rule.category,
            startUtc: stamp,
            endUtc: end.toUTC().toISO()!,
            timezone: rule.timezone,
            notes: rule.notes,
            color: rule.color,
            isRecurring: true,
            recurrenceRule: rule.pattern,
            recurringRuleId: rule.id,
            openToStudyTogether: rule.openToStudyTogether,
            editable: true,
            createdAt: stamp,
            updatedAt: stamp,
          });
        }
      }
      cursor = cursor.plus({ days: 1 });
    }
  }

  return generated;
}

/** Resolves every schedule input through the same deterministic exception pipeline. */
export function resolveEventsForRange(input: ResolveEventsForRangeInput): CalendarEvent[] {
  const rangeStart = toUtc(input.rangeStart);
  const rangeEnd = toUtc(input.rangeEnd);
  if (!rangeStart.isValid || !rangeEnd.isValid || rangeEnd <= rangeStart) return [];

  const hidden = new Set(input.hiddenInstanceIds);
  const resolved = new Map<string, CalendarEvent>();

  for (const event of input.events) {
    if (!hidden.has(event.id) && intersects(event, rangeStart, rangeEnd)) resolved.set(event.id, event);
  }

  for (const generated of createRecurringInstances(input.rules, rangeStart, rangeEnd)) {
    if (hidden.has(generated.id)) continue;
    const replacement = input.overrides[generated.id] ?? generated;
    if (intersects(replacement, rangeStart, rangeEnd)) resolved.set(generated.id, replacement);
  }

  // An edited instance can move into this range even when its original date is outside it.
  for (const [instanceId, override] of Object.entries(input.overrides)) {
    if (!hidden.has(instanceId) && intersects(override, rangeStart, rangeEnd)) resolved.set(instanceId, override);
  }

  return [...resolved.values()].sort((left, right) =>
    left.startUtc.localeCompare(right.startUtc)
      || left.endUtc.localeCompare(right.endUtc)
      || left.ownerId.localeCompare(right.ownerId)
      || left.id.localeCompare(right.id));
}
