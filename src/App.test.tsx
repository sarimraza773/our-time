// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';
import type { CalendarEvent } from './types';
import { EMPTY_SCHEDULE } from './data/calendarMapping';
import { emptySnapshot, event, users } from './test/calendarFixtures';
import type { ScheduleSource } from './lib/schedule';

const controls = vi.hoisted(() => ({ auth: { session: null as null | { user: { id: string } }, loading: false, pending: false, error: '', signIn: vi.fn(), signOut: vi.fn() }, cloud: {} as Record<string, unknown> }));
vi.mock('./hooks/useAuth', () => ({ useAuth: () => controls.auth }));
vi.mock('./hooks/useSharedCalendar', () => ({ useSharedCalendar: () => controls.cloud }));
vi.mock('./lib/supabase', () => ({ cloudConfigurationError: '', supabase: null }));
import App from './App';

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }) });
  vi.clearAllMocks();
  controls.auth.session = { user: { id: users.sarim } }; controls.auth.loading = false;
  controls.cloud = { snapshot: emptySnapshot(), source: EMPTY_SCHEDULE, loading: false, saving: false, error: '', localError: '', connection: 'Connected',
    retry: vi.fn(), saveEvent: vi.fn(async () => true), deleteEvent: vi.fn(async () => true), saveRule: vi.fn(async () => true), deleteRule: vi.fn(async () => true),
    importLocal: vi.fn(), startFresh: vi.fn(), cancelImport: vi.fn(), clearError: vi.fn(), offerImport: false };
});
afterEach(cleanup);
describe('existing UI with the cloud hook boundary mocked', () => {
  it('keeps the blue scene sticker outside the clipping paper and preserves all four decorative artworks', () => {
    const view = render(<App />);
    const blue = view.container.querySelector<HTMLImageElement>('.sticker-rupert')!;
    expect(blue.closest('.calendar-paper')).toBeNull();
    expect(blue.closest('.calendar-mascot')?.parentElement?.classList.contains('calendar-wrap')).toBe(true);
    expect(blue.getAttribute('src')).toBe('/assets/sticker-rupert.jpeg');
    expect([...view.container.querySelectorAll('.sticker')].every(image => image.classList.contains('sticker-decorative'))).toBe(true);
    expect(view.container.querySelectorAll('.sticker')).toHaveLength(4);
  });
  it('opens the top book, makes the room inert, and restores it on close', () => {
    const view = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open shared diary' }));
    expect(screen.getByRole('dialog', { name: 'Our shared diary' })).toBeDefined();
    expect(view.container.querySelector('[inert]')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'f' }); expect(view.container.querySelector('.is-fullscreen')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close diary ✕' }));
    expect(screen.queryByRole('dialog')).toBeNull(); expect(view.container.querySelector('[inert]')).toBeNull();
  });
  it('does not flash the planner during auth or initial cloud loading', () => {
    controls.auth.loading = true;
    const view = render(<App />);
    expect(screen.getByRole('status').textContent).toBe('Opening our calendar…');
    expect(screen.queryByLabelText('Daily schedule')).toBeNull();
    controls.auth.loading = false; controls.cloud.loading = true; view.rerender(<App />);
    expect(screen.queryByLabelText('Daily schedule')).toBeNull();
  });
  it('renders email/password login without registration or name-based mock login', () => {
    controls.auth.session = null; render(<App />);
    expect(screen.getByLabelText('Password').getAttribute('type')).toBe('password');
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Sarim' })).toBeNull();
  });
  it('keeps Deena perspective while identifying Sarim, and preserves F/Escape/Today', () => {
    const view = render(<App />);
    expect(screen.getByText(/signed in as Sarim/).textContent).toContain('Viewing as Deena');
    fireEvent.click(screen.getByRole('button', { name: 'SARIM' }));
    expect(screen.getByText('Sarim’s perspective is coming next 💙')).toBeDefined();
    fireEvent.keyDown(window, { key: 'f' }); expect(view.container.querySelector('.is-fullscreen')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' }); expect(view.container.querySelector('.is-fullscreen')).toBeNull();
    fireEvent.click(screen.getByLabelText('Next day'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Today' })[0]);
    expect(screen.getByRole('heading', { name: /Today/ })).toBeDefined();
  });
  it('keeps an unsaved editor open on failure and closes only after confirmed save', async () => {
    const save = vi.fn(async () => false); controls.cloud.saveEvent = save;
    render(<App />); fireEvent.click(screen.getByRole('button', { name: '＋ New event' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New class' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save event ✦' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('Title')).toBeDefined();
    save.mockResolvedValue(true); fireEvent.click(screen.getByRole('button', { name: 'Save event ✦' }));
    await waitFor(() => expect(screen.queryByLabelText('Title')).toBeNull());
  });
  it('uses the selected day for Sarim and persists a changed local date', async () => {
    const save = vi.fn(async (_event: CalendarEvent, _existing: boolean) => true); controls.cloud.saveEvent = save;
    render(<App />); fireEvent.click(screen.getByRole('button', { name: '＋ New event' }));
    const selectedDate = DateTime.utc().setZone('Asia/Kuala_Lumpur').toISODate()!;
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe(selectedDate);
    const changedDate = DateTime.fromISO(selectedDate).plus({ days: 1 }).toISODate()!;
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: changedDate } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Next day class' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save event ✦' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const saved = save.mock.calls[0][0];
    expect(DateTime.fromISO(saved.startUtc).setZone('America/New_York').toISODate()).toBe(changedDate);
    expect(DateTime.fromISO(saved.endUtc).setZone('America/New_York').toISODate()).toBe(changedDate);
  });
  it('updates current status and the timeline from the same new cloud source', async () => {
    const now = DateTime.utc();
    const current = { ...event, startUtc: now.minus({ minutes: 10 }).toISO()!, endUtc: now.plus({ minutes: 30 }).toISO()! };
    controls.cloud.source = { ...EMPTY_SCHEDULE, events: [current] } satisfies ScheduleSource;
    const view = render(<App />);
    expect(view.container.querySelector('.live-card.sarim .live-activity strong')?.textContent).toBe(event.title);
    controls.cloud.source = EMPTY_SCHEDULE; view.rerender(<App />);
    await waitFor(() => expect(view.container.querySelector('.live-card.sarim .live-activity strong')?.textContent).toBe('Free'));
  });

  it.each(['01:00','02:00','03:00','04:00','05:00','06:00'])('creates a one-time event at %s with the selected color', async start => {
    controls.auth.session = { user: { id: users.deena } };
    const save = vi.fn(async (_event: CalendarEvent, _existing: boolean) => true);
    controls.cloud.saveEvent = save;
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '＋ New event' }));
    expect((screen.getByLabelText('Recurring event') as HTMLInputElement).checked).toBe(false);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Early appointment' } });
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: start } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: start.replace(':00', ':15') } });
    fireEvent.click(screen.getByRole('button', { name: 'Dusty pink' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save event ✦' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ color: 'berry', isRecurring: false }), false));
    const saved = save.mock.calls[0][0];
    expect(DateTime.fromISO(saved.startUtc).setZone(saved.timezone).toFormat('HH:mm')).toBe(start);
    expect(DateTime.fromISO(saved.endUtc).diff(DateTime.fromISO(saved.startUtc), 'minutes').minutes).toBe(15);
    expect(controls.cloud.saveRule).not.toHaveBeenCalled();
  });

  it.each(['daily', 'weekly', 'monthly', 'yearly', 'custom'])('creates a %s series from the event editor', async pattern => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '＋ New event' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Recurring appointment' } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-08-26' } });
    fireEvent.click(screen.getByLabelText('Recurring event'));
    fireEvent.change(screen.getByLabelText('Repeat every'), { target: { value: pattern } });
    if (pattern === 'custom') {
      fireEvent.change(screen.getByLabelText('Repeat interval'), { target: { value: '2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Friday' }));
      fireEvent.click(screen.getByLabelText('No end date'));
      fireEvent.change(screen.getByLabelText('Ends on'), { target: { value: '2026-09-30' } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Rose pink' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save event ✦' }));
    await waitFor(() => expect(controls.cloud.saveRule).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Recurring appointment', startDate: '2026-08-26', color: 'rose', timezone: 'America/New_York',
      ...(pattern === 'custom'
        ? { pattern: 'weekly', interval: 2, weekdays: [3, 5], endDate: '2026-09-30' }
        : { pattern, interval: 1 }),
    }), false));
    expect(controls.cloud.saveEvent).not.toHaveBeenCalled();
  });

  it('shows the tracker for both authenticated linked profiles, not an unknown perspective', () => {
    const view = render(<App />);
    expect(screen.getByRole('button', {name: '✿ Period Tracker'})).toBeTruthy();
    controls.auth.session = {user: {id: users.deena}}; view.rerender(<App />);
    expect(screen.getByRole('button', {name: '✿ Period Tracker'})).toBeTruthy();
    controls.auth.session = {user: {id: 'unknown-user'}}; view.rerender(<App />);
    expect(screen.queryByRole('button', {name: '✿ Period Tracker'})).toBeNull();
  });

  it('opens the series editor from an occurrence and preserves its repeat settings', async () => {
    controls.auth.session = { user: { id: users.deena } };
    const startDate = DateTime.utc().setZone('Asia/Kuala_Lumpur').toISODate()!;
    controls.cloud.source = { ...EMPTY_SCHEDULE, rules: [{
      id: 'daily-series', ownerId: 'deena', title: 'Early series', category: 'personal', timezone: 'Asia/Kuala_Lumpur',
      startTime: '04:15', endTime: '04:30', pattern: 'daily', weekdays: [], interval: 2, startDate, active: true,
      notes: 'Original series notes', openToStudyTogether: false, color: 'peony',
    }] } satisfies ScheduleSource;
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^Edit Early series,/ }));
    expect((screen.getByLabelText('Start') as HTMLInputElement).value).toBe('04:15');
    fireEvent.click(screen.getByRole('button', { name: 'Edit series' }));
    await screen.findByRole('heading', { name: 'Edit schedule' });
    expect((screen.getByLabelText('Repeat interval') as HTMLInputElement).value).toBe('2');
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Event details' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Lavender pink' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await waitFor(() => expect(controls.cloud.saveRule).toHaveBeenCalledWith(expect.objectContaining({
      id: 'daily-series', pattern: 'daily', interval: 2, startDate, color: 'peony',
    }), true));
  });
});

