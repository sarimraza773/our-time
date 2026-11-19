import { DateTime, Interval } from 'luxon';
import type { CalendarEvent, OwnerId, TimeSlot } from '../types';
export { createRecurringInstances } from './schedule';

const BUSY_CATEGORIES = new Set(['class','study','sleep','friends','food','personal','dateNight','call','sharedTime']);

export const convertTimezone = (isoUtc: string, timezone: string) => DateTime.fromISO(isoUtc, { zone: 'utc' }).setZone(timezone);

export function dayWindow(day: DateTime, zone: string, startHour = 6, endHour = 25) {
  const local = day.setZone(zone).startOf('day');
  return {
    start: local.plus({ hours: startHour }).toUTC(),
    end: local.plus({ hours: endHour }).toUTC(),
  };
}

export function getEventsForDay(events: CalendarEvent[], day: DateTime, timezone: string): CalendarEvent[] {
  const localStart = day.setZone(timezone).startOf('day');
  const start = localStart.toUTC();
  const end = localStart.plus({ days: 1, hours: 2 }).toUTC();
  return events.filter((event) => DateTime.fromISO(event.endUtc) > start && DateTime.fromISO(event.startUtc) < end);
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.isValid).sort((a,b) => a.start!.toMillis() - b.start!.toMillis());
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged.at(-1);
    if (!last || interval.start! > last.end!) merged.push(interval);
    else merged[merged.length - 1] = Interval.fromDateTimes(last.start!, DateTime.max(last.end!, interval.end!));
  }
  return merged;
}

export function calculateFreeSlots(events: CalendarEvent[], ownerId: OwnerId, day: DateTime, zone: string, minMinutes = 30): TimeSlot[] {
  const window = dayWindow(day, zone);
  const bounds = Interval.fromDateTimes(window.start, window.end);
  const busy = mergeIntervals(events
    .filter((e) => e.ownerId === ownerId && BUSY_CATEGORIES.has(e.category))
    .map((e) => Interval.fromDateTimes(DateTime.fromISO(e.startUtc), DateTime.fromISO(e.endUtc)).intersection(bounds))
    .filter((i): i is Interval => Boolean(i)));
  const slots: TimeSlot[] = [];
  let cursor = window.start;
  for (const interval of busy) {
    if (interval.start! > cursor && interval.start!.diff(cursor, 'minutes').minutes >= minMinutes) slots.push({ startUtc:cursor.toUTC().toISO()!, endUtc:interval.start!.toUTC().toISO()! });
    if (interval.end! > cursor) cursor = interval.end!;
  }
  if (window.end > cursor && window.end.diff(cursor, 'minutes').minutes >= minMinutes) slots.push({ startUtc:cursor.toUTC().toISO()!, endUtc:window.end.toUTC().toISO()! });
  return slots;
}

function intersectSlots(a: TimeSlot[], b: TimeSlot[], minMinutes: number, kind: TimeSlot['kind']): TimeSlot[] {
  const output: TimeSlot[] = [];
  for (const left of a) for (const right of b) {
    const intersection = Interval.fromDateTimes(DateTime.fromISO(left.startUtc),DateTime.fromISO(left.endUtc)).intersection(Interval.fromDateTimes(DateTime.fromISO(right.startUtc),DateTime.fromISO(right.endUtc)));
    if (intersection?.isValid && intersection.length('minutes') >= minMinutes) output.push({startUtc:intersection.start!.toUTC().toISO()!,endUtc:intersection.end!.toUTC().toISO()!,kind});
  }
  return output;
}

export function calculateMutualFreeSlots(events: CalendarEvent[], day: DateTime, zone: string, minMinutes = 45): TimeSlot[] {
  return intersectSlots(calculateFreeSlots(events,'deena',day,zone,minMinutes), calculateFreeSlots(events,'sarim',day,zone,minMinutes), minMinutes, 'mutual');
}

export function calculateStudyTogetherSlots(events: CalendarEvent[], minMinutes = 30): TimeSlot[] {
  const toSlots = (ownerId: OwnerId) => events.filter((e) => e.ownerId === ownerId && e.category === 'study' && e.openToStudyTogether).map((e) => ({startUtc:e.startUtc,endUtc:e.endUtc}));
  const candidates = intersectSlots(toSlots('deena'), toSlots('sarim'), minMinutes, 'study');
  const blockers = events.filter((event) => BUSY_CATEGORIES.has(event.category) && !(event.category === 'study' && event.openToStudyTogether));
  const output: TimeSlot[] = [];
  for (const candidate of candidates) {
    let pieces = [Interval.fromDateTimes(DateTime.fromISO(candidate.startUtc),DateTime.fromISO(candidate.endUtc))];
    for (const blocker of blockers) {
      const blocked = Interval.fromDateTimes(DateTime.fromISO(blocker.startUtc),DateTime.fromISO(blocker.endUtc));
      pieces = pieces.flatMap((piece) => piece.overlaps(blocked) ? piece.difference(blocked) : [piece]);
    }
    for (const piece of pieces) if (piece.isValid && piece.length('minutes') >= minMinutes) output.push({startUtc:piece.start!.toUTC().toISO()!,endUtc:piece.end!.toUTC().toISO()!,kind:'study'});
  }
  return output;
}

export function formatRange(slot: TimeSlot, zone: string) {
  const start = convertTimezone(slot.startUtc, zone);
  const end = convertTimezone(slot.endUtc, zone);
  return `${start.toFormat('h:mm a')}–${end.toFormat('h:mm a')}`;
}
