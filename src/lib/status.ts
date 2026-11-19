import { DateTime } from 'luxon';
import type { CalendarEvent, EventCategory, OwnerId } from '../types';
import { resolveEventsForRange, type ScheduleSource } from './schedule';

export const OWNER_DETAILS: Record<OwnerId, { name: string; location: string; timezone: string }> = {
  deena: { name: 'Deena', location: 'Kuala Lumpur', timezone: 'Asia/Kuala_Lumpur' },
  sarim: { name: 'Sarim', location: 'Pennsylvania', timezone: 'America/New_York' },
};

const BUSY_CATEGORIES = new Set<EventCategory>(['class', 'study', 'sleep', 'friends', 'food', 'personal', 'dateNight', 'call', 'sharedTime']);
const CATEGORY_PRIORITY: Record<EventCategory, number> = {
  sleep: 1,
  class: 2,
  call: 3,
  dateNight: 3,
  sharedTime: 3,
  friends: 4,
  study: 5,
  food: 6,
  personal: 7,
  freeTime: 8,
};

export interface CurrentScheduleStatus {
  ownerId: OwnerId;
  nowUtc: string;
  localTime: DateTime;
  state: 'busy' | 'free' | 'sleeping';
  currentEvent?: CalendarEvent;
  activeEvents: CalendarEvent[];
  nextEvent?: CalendarEvent;
}

export const isBusyEvent = (event: CalendarEvent) => BUSY_CATEGORIES.has(event.category);

export function compareStatusEvents(left: CalendarEvent, right: CalendarEvent) {
  return CATEGORY_PRIORITY[left.category] - CATEGORY_PRIORITY[right.category]
    || left.startUtc.localeCompare(right.startUtc)
    || left.id.localeCompare(right.id);
}

export function getCurrentScheduleStatus(input: ScheduleSource & {
  ownerId: OwnerId;
  nowUtc?: DateTime | string;
  searchHours?: number;
}): CurrentScheduleStatus {
  const now = (input.nowUtc
    ? (typeof input.nowUtc === 'string' ? DateTime.fromISO(input.nowUtc, { setZone: true }) : input.nowUtc)
    : DateTime.utc()).toUTC();
  const searchHours = input.searchHours ?? 48;
  const events = resolveEventsForRange({
    ...input,
    rangeStart: now.minus({ days: 1 }),
    rangeEnd: now.plus({ hours: searchHours }),
  }).filter((event) => event.ownerId === input.ownerId);

  const activeEvents = events
    .filter((event) => isBusyEvent(event)
      && DateTime.fromISO(event.startUtc, { setZone: true }).toUTC() <= now
      && DateTime.fromISO(event.endUtc, { setZone: true }).toUTC() > now)
    .sort(compareStatusEvents);
  const currentEvent = activeEvents[0];
  const nextEvent = events
    .filter((event) => isBusyEvent(event) && DateTime.fromISO(event.startUtc, { setZone: true }).toUTC() > now)
    .sort((left, right) => left.startUtc.localeCompare(right.startUtc) || compareStatusEvents(left, right))[0];

  return {
    ownerId: input.ownerId,
    nowUtc: now.toISO()!,
    localTime: now.setZone(OWNER_DETAILS[input.ownerId].timezone),
    state: currentEvent?.category === 'sleep' ? 'sleeping' : currentEvent ? 'busy' : 'free',
    currentEvent,
    activeEvents,
    nextEvent,
  };
}

/** Returns the first instant with no busy commitment, merging adjacent overlaps safely. */
export function getNextFreeInstant(input: ScheduleSource & { ownerId: OwnerId; nowUtc?: DateTime | string; searchHours?: number }) {
  const now = (input.nowUtc
    ? (typeof input.nowUtc === 'string' ? DateTime.fromISO(input.nowUtc, { setZone: true }) : input.nowUtc)
    : DateTime.utc()).toUTC();
  const end = now.plus({ hours: input.searchHours ?? 48 });
  const busy = resolveEventsForRange({ ...input, rangeStart: now, rangeEnd: end })
    .filter((event) => event.ownerId === input.ownerId && isBusyEvent(event))
    .sort((left, right) => left.startUtc.localeCompare(right.startUtc) || left.endUtc.localeCompare(right.endUtc));

  let cursor = now;
  for (const event of busy) {
    const start = DateTime.fromISO(event.startUtc, { setZone: true }).toUTC();
    const eventEnd = DateTime.fromISO(event.endUtc, { setZone: true }).toUTC();
    if (start > cursor) return cursor;
    if (eventEnd > cursor) cursor = eventEnd;
  }
  return cursor < end ? cursor : null;
}
