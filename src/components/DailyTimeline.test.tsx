// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';
import { DailyTimeline } from './DailyTimeline';
import { event } from '../test/calendarFixtures';
import { EVENT_COLORS } from '../lib/eventColors';
import { timelineScale } from '../lib/timelineLayout';
import type { CalendarEvent } from '../types';

const zone = 'Asia/Kuala_Lumpur';
const day = DateTime.fromISO('2026-08-26', { zone });
const onEdit = vi.fn();
const localSlot = (id: string, start: string, end: string, changes: Partial<CalendarEvent> = {}): CalendarEvent => ({
  ...event, id, title: id, ownerId: 'deena', timezone: zone,
  startUtc: DateTime.fromISO(start, { zone }).toUTC().toISO()!,
  endUtc: DateTime.fromISO(end, { zone }).toUTC().toISO()!, ...changes,
});
const at = (time: string) => `2026-08-26T${time}`;
const show = (events: CalendarEvent[]) => render(<DailyTimeline day={day} nowUtc={day.plus({ hours: 4, minutes: 30 })}
  events={events} mutualSlots={[]} studySlots={[]} zone={zone} onEdit={onEdit} onAdd={() => {}} />);
afterEach(() => { cleanup(); onEdit.mockClear(); });

describe('daily timeline', () => {
  it('keeps partial, simultaneous, and recurring overlaps separately clickable and preserves manual color', () => {
    const first = localSlot('First', at('09:15'), at('10:30'));
    const second = localSlot('Second', at('09:15'), at('10:00'), { isRecurring: true });
    const third = localSlot('Third', at('09:45'), at('10:15'), { color: 'mauve' });
    const adjacent = localSlot('Adjacent', at('10:30'), at('11:00'));
    show([third, adjacent, second, first]);
    const buttons = [first, second, third, adjacent].map(event =>
      screen.getByRole<HTMLButtonElement>('button', { name: new RegExp(`Edit ${event.title},`) }));
    const values = (property: string) => buttons.map(button => button.style.getPropertyValue(property));
    expect(new Set(values('--lane-start').slice(0, 3)).size).toBe(3);
    const fills = values('--event-fill');
    expect(new Set(fills.slice(0, 3)).size).toBe(3);
    expect(fills[2]).toBe(EVENT_COLORS.mauve.fill);
    expect(fills[3]).toBe('');
    buttons.forEach(button => fireEvent.click(button));
    expect(onEdit.mock.calls.map(([picked]) => picked.id)).toEqual([first.id, second.id, third.id, adjacent.id]);
    expect(parseFloat(buttons[0].style.top)).toBeCloseTo(925 / 24);
    expect(parseFloat(buttons[0].style.height)).toBeCloseTo((75 / 1440) * 100);
  });

  it('renders 24 hourly labels, early events and an accurate Now marker', () => {
    const { container } = show(['01:00','02:30','03:00','04:00','05:00','06:00'].map((start, index) =>
      localSlot(`Early ${index}`, at(start), at(DateTime.fromISO(at(start)).plus({minutes:15}).toFormat('HH:mm')))));
    const labels = [...container.querySelectorAll('.hour-labels span')].map(label => label.textContent);
    expect(labels).toHaveLength(24);
    expect(labels.slice(0, 7)).toEqual(['12 AM', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM', '6 AM']);
    expect(labels.at(-1)).toBe('11 PM');
    expect(container.querySelector<HTMLElement>('.now-line')?.style.top).toBe('18.75%');
    expect(screen.getAllByRole('button', { name: /Edit Early/ })).toHaveLength(6);
  });

  it('clips a long event at midnight and keeps a five-minute duration exact', () => {
    const clip = timelineScale(day, zone).clip;
    const long = localSlot('Long', '2026-08-25T23:45', '2026-08-27T00:30');
    const short = localSlot('Short', at('23:55'), '2026-08-27T00:00');
    expect(clip(long)).toEqual({ top: 0, bottom: 1 });
    expect(clip(short)?.bottom).toBe(1);
    expect(clip(short)!.bottom - clip(short)!.top).toBeCloseTo(5 / 1440);
    const nextDay = timelineScale(day.plus({ days: 1 }), zone).clip;
    expect(nextDay(long)).toEqual({ top: 0, bottom: 30 / 1440 });
    expect(nextDay(short)).toBeNull();
  });

  it('keeps both entries of a paired shared event actionable in Together', () => {
    const deena = localSlot('Date night', at('19:00'), at('20:00'), { category: 'dateNight' });
    const sarim = { ...deena, ownerId: 'sarim' as const, id: 'date-sarim' };
    const { container } = show([deena, sarim]);
    const buttons = [...container.querySelectorAll('.together-col .timeline-event')];
    expect(buttons).toHaveLength(2);
    buttons.forEach(button => fireEvent.click(button));
    expect(new Set(onEdit.mock.calls.map(([picked]) => picked.id))).toEqual(new Set([sarim.id, deena.id]));
  });
});
