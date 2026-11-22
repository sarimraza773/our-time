// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSharedCalendar } from './useSharedCalendar';
import { CalendarAccessError, type CalendarRepository } from '../data/calendarRepository';
import { eventToWrite, exceptionToWrite, ruleToWrite } from '../data/calendarMapping';
import { calendarId, emptySnapshot, event, rule, stamp, users } from '../test/calendarFixtures';

function fakeRepository() {
  let state = emptySnapshot();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(fn => fn());
  const repo: CalendarRepository = {
    loadCalendar: vi.fn(async () => structuredClone(state)),
    createEvent: vi.fn(async e => { state.events.push({ ...eventToWrite(e, calendarId, users), created_at: stamp, updated_at: stamp }); notify(); }),
    updateEvent: vi.fn(async e => { state.events = state.events.map(row => row.id === e.id ? { ...eventToWrite(e, calendarId, users), created_at: stamp, updated_at: stamp } : row); notify(); }),
    deleteEvent: vi.fn(async id => { state.events = state.events.filter(row => row.id !== id); notify(); }),
    createRecurringRule: vi.fn(async r => { state.rules.push({ ...ruleToWrite(r, calendarId, users), created_at: stamp, updated_at: stamp }); notify(); }),
    updateRecurringRule: vi.fn(async r => { state.rules = state.rules.map(row => row.id === r.id ? { ...ruleToWrite(r, calendarId, users), created_at: stamp, updated_at: stamp } : row); notify(); }),
    deleteRecurringRule: vi.fn(async id => { state.rules = state.rules.filter(row => row.id !== id); state.exceptions = state.exceptions.filter(row => row.recurring_rule_id !== id); notify(); }),
    createRecurringException: vi.fn(async (id, replacement) => {
      const row = { ...exceptionToWrite(id, replacement, calendarId, users), id, created_at: stamp, updated_at: stamp };
      state.exceptions = [...state.exceptions.filter(e => e.id !== id), row]; notify();
    }),
    deleteRecurringException: vi.fn(async id => { state.exceptions = state.exceptions.filter(e => e.id !== id); notify(); }),
    importLocalCalendar: vi.fn(async () => { state.calendar.local_import_completed_at = stamp; notify(); }),
    subscribeToCalendarChanges: vi.fn((_id, onChange, onStatus) => { listeners.add(onChange); onStatus(true); return () => { listeners.delete(onChange); }; }),
  };
  return { repo, notify, listeners, replace: (next: typeof state) => { state = next; notify(); } };
}
beforeEach(() => { localStorage.clear(); Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }); });
afterEach(cleanup);

describe('shared calendar hook with a simulated transport (no live Supabase)', () => {
  it('explains an incomplete two-account setup instead of hiding it as a connection error', async () => {
    const { repo } = fakeRepository();
    const partial = emptySnapshot();
    partial.profiles = partial.profiles.filter(p => p.person_key === 'sarim');
    vi.mocked(repo.loadCalendar).mockResolvedValue(partial);
    const view = renderHook(() => useSharedCalendar(users.sarim, repo));
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    expect(view.result.current.error).toContain('Both calendar accounts need to be linked');
    expect(view.result.current.snapshot).toBeNull();
    expect(repo.subscribeToCalendarChanges).not.toHaveBeenCalled();
  });
  it('converges two clients after create, edit, delete, override and occurrence deletion', async () => {
    const { repo, notify, listeners } = fakeRepository();
    const a = renderHook(() => useSharedCalendar(users.deena, repo));
    const b = renderHook(() => useSharedCalendar(users.sarim, repo));
    await waitFor(() => expect(a.result.current.loading || b.result.current.loading).toBe(false));
    await act(async () => { await a.result.current.saveEvent({ ...event, color: 'blush' }, false); });
    await waitFor(() => expect(b.result.current.source.events[0]?.color).toBe('blush'));
    await act(async () => { await b.result.current.saveEvent({ ...event, title: 'Changed by Sarim' }, true); });
    await waitFor(() => expect(a.result.current.source.events[0].title).toBe('Changed by Sarim'));
    act(() => { notify(); notify(); notify(); });
    await waitFor(() => expect(a.result.current.connection).toBe('Connected'));
    expect(a.result.current.source.events).toHaveLength(1);
    const series = { ...rule, pattern: 'yearly' as const, startDate: '2026-08-26', interval: 2, endDate: '2030-08-26', color: 'berry' as const };
    await act(async () => { await a.result.current.deleteEvent(event); await a.result.current.saveRule(series, false); });
    await waitFor(() => expect(b.result.current.source.events).toEqual([]));
    await waitFor(() => expect(b.result.current.source.rules[0]).toEqual(series));
    const occurrence = { ...event, id: `rule:${rule.id}:2026-08-26`, isRecurring: true, recurringRuleId: rule.id, color: 'mauve' as const };
    await act(async () => { await a.result.current.saveEvent(occurrence, true); });
    await waitFor(() => expect(b.result.current.source.overrides[occurrence.id]?.color).toBe('mauve'));
    await act(async () => { await b.result.current.deleteEvent(occurrence); });
    await waitFor(() => expect(a.result.current.source.hiddenInstanceIds).toEqual([occurrence.id]));
    expect(a.result.current.source.overrides).toEqual({});
    b.unmount();
    const reloaded = renderHook(() => useSharedCalendar(users.sarim, repo));
    await waitFor(() => expect(reloaded.result.current.source.rules).toEqual([series]));
    expect(reloaded.result.current.source.hiddenInstanceIds).toEqual([occurrence.id]);
    a.unmount(); reloaded.unmount(); expect(listeners.size).toBe(0);
  });
  it('does not publish an obsolete in-flight snapshot after a newer invalidation', async () => {
    const { repo, notify } = fakeRepository();
    const stale = emptySnapshot();
    let resolve!: (value: ReturnType<typeof emptySnapshot>) => void;
    vi.mocked(repo.loadCalendar).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const view = renderHook(() => useSharedCalendar(users.deena, repo));
    act(() => { view.result.current.retry(); });
    const fresh = emptySnapshot(); fresh.events = [{ ...eventToWrite(event, calendarId, users), created_at: stamp, updated_at: stamp }];
    vi.mocked(repo.loadCalendar).mockResolvedValue(fresh);
    await act(async () => { resolve(stale); });
    await waitFor(() => expect(view.result.current.source.events).toHaveLength(1));
    act(notify);
    expect(view.result.current.source.events[0].id).toBe(event.id);
  });
  it('preserves authoritative data and reports a rejected save', async () => {
    const { repo } = fakeRepository();
    vi.mocked(repo.createEvent).mockRejectedValue(new Error('Database rejected the event'));
    const view = renderHook(() => useSharedCalendar(users.deena, repo));
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    await act(async () => { expect(await view.result.current.saveEvent(event, false)).toBe(false); });
    expect(view.result.current.source.events).toEqual([]);
    expect(view.result.current.error).toContain('could not confirm');
  });
  it('prevents duplicate pending writes and makes offline attempts explicit', async () => {
    const { repo } = fakeRepository();
    let finish!: () => void;
    vi.mocked(repo.createEvent).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const view = renderHook(() => useSharedCalendar(users.deena, repo));
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    let pending!: Promise<boolean>;
    act(() => { pending = view.result.current.saveEvent(event, false); });
    await act(async () => { expect(await view.result.current.saveEvent(event, false)).toBe(false); });
    expect(repo.createEvent).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); await pending; });
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    act(() => { window.dispatchEvent(new Event('offline')); });
    await act(async () => { expect(await view.result.current.saveEvent(event, false)).toBe(false); });
    expect(view.result.current.connection).toBe('Offline'); expect(view.result.current.error).toContain('not been saved');
  });
  it('clears calendar data after membership is revoked', async () => {
    const { repo } = fakeRepository();
    const view = renderHook(() => useSharedCalendar(users.deena, repo));
    await waitFor(() => expect(view.result.current.snapshot).not.toBeNull());
    vi.mocked(repo.loadCalendar).mockRejectedValue(new CalendarAccessError('Access removed'));
    act(() => { view.result.current.retry(); });
    await waitFor(() => expect(view.result.current.snapshot).toBeNull());
    expect(view.result.current.source.events).toEqual([]);
  });
  it('keeps import retryable after failure and writes a marker only after success', async () => {
    localStorage.setItem('our-time.events', JSON.stringify([event]));
    const { repo } = fakeRepository();
    vi.mocked(repo.importLocalCalendar).mockRejectedValueOnce(new Error('Network failed'));
    const view = renderHook(() => useSharedCalendar(users.deena, repo));
    await waitFor(() => expect(view.result.current.offerImport).toBe(true));
    await act(async () => { await view.result.current.importLocal(); });
    expect(view.result.current.offerImport).toBe(true);
    expect(localStorage.getItem(`our-time.cloud-migration.v1:${calendarId}`)).toBeNull();
    await act(async () => { await view.result.current.importLocal(); });
    expect(view.result.current.offerImport).toBe(false);
    expect(localStorage.getItem(`our-time.cloud-migration.v1:${calendarId}`)).toBe('imported');
    expect(localStorage.getItem('our-time.events')).toBe(JSON.stringify([event]));
  });
});
