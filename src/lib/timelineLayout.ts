import { DateTime } from 'luxon';
import type { CalendarEvent, TimeSlot } from '../types';
import { dayWindow } from './calendar';
import { EVENT_COLORS, PINK_SHADES } from './eventColors';

export type TimelineSpan = { top: number; bottom: number };
type PositionedEvent = TimelineSpan & { event: CalendarEvent };

export function timelineScale(day: DateTime, zone: string) {
  const { start, end } = dayWindow(day, zone);
  const fraction = (instant: DateTime) => (instant.toMillis() - start.toMillis()) / (end.toMillis() - start.toMillis());
  const clip = (slot: TimeSlot) => {
    const top = Math.max(0, fraction(DateTime.fromISO(slot.startUtc)));
    const bottom = Math.min(1, fraction(DateTime.fromISO(slot.endUtc)));
    return top < bottom ? { top, bottom } : null;
  };
  return { clip, fraction };
}

export function layoutTimelineEvents(events: PositionedEvent[]) {
  const sorted = [...events].sort((a, b) =>
    a.top - b.top || b.bottom - a.bottom || a.event.id.localeCompare(b.event.id));
  const laneEnds: number[] = [];
  const items: (PositionedEvent & { lane: number; laneCount: number; fill?: string })[] = [];
  let groupStart = 0;
  let groupEnd = 0;

  function finishGroup() {
    const group = items.slice(groupStart);
    const manual = new Set(group.flatMap(({ event }) => event.color ? [EVENT_COLORS[event.color].fill] : []));
    const automatic = [...PINK_SHADES.filter(shade => !manual.has(shade)), ...PINK_SHADES.filter(shade => manual.has(shade))];
    const automaticLanes = [...new Set(group.filter(({ event }) => !event.color).map(item => item.lane))].sort((a, b) => a - b);
    for (const item of group) {
      item.laneCount = laneEnds.length;
      item.fill = item.event.color ? EVENT_COLORS[item.event.color].fill
        : item.laneCount > 1 ? automatic[automaticLanes.indexOf(item.lane) % automatic.length] : undefined;
    }
    laneEnds.length = 0;
    groupStart = items.length;
  }

  for (const item of sorted) {
    if (item.top >= groupEnd) finishGroup();
    const available = laneEnds.findIndex(end => end <= item.top);
    const lane = available === -1 ? laneEnds.length : available;
    laneEnds[lane] = item.bottom;
    groupEnd = Math.max(groupEnd, item.bottom);
    items.push({ ...item, lane, laneCount: 1 });
  }
  finishGroup();
  return items;
}
