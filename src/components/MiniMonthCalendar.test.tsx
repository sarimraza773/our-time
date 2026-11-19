// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';
import { MiniMonthCalendar } from './MiniMonthCalendar';

afterEach(cleanup);
describe('mini-month control access', () => {
  it.each(['2026-11-18', '2028-02-29'])('selects every one of the 42 visible dates, including outside-month dates (%s)', date => {
    const selected = DateTime.fromISO(date, { zone: 'Asia/Kuala_Lumpur' }), select = vi.fn<(day: DateTime) => void>();
    const view = render(<MiniMonthCalendar selected={selected} today={selected} onSelect={select} />);
    const buttons = [...view.container.querySelectorAll<HTMLButtonElement>('.mini-dates button')];
    expect(buttons).toHaveLength(42);
    for (const button of buttons) fireEvent.click(button);
    const dates = select.mock.calls.map(([day]: [DateTime]) => day.toISODate());
    expect(new Set(dates).size).toBe(42);
    expect(select.mock.calls.every(([day]: [DateTime], i) => buttons[i].getAttribute('aria-label') === day.toFormat('cccc, LLLL d'))).toBe(true);
    expect(select.mock.calls.some(([day]: [DateTime]) => day.month !== selected.month)).toBe(true);
  });
  it('supports both month arrows and keeps their accessible labels', () => {
    const selected = DateTime.fromISO('2026-11-18'), select = vi.fn<(day: DateTime) => void>();
    render(<MiniMonthCalendar selected={selected} today={selected} onSelect={select} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(select.mock.calls.map(([day]: [DateTime]) => day.toISODate())).toEqual(['2026-10-18', '2026-12-18']);
  });
});
