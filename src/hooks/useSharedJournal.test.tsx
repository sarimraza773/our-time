// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSharedJournal } from './useSharedJournal';
import { JournalAccessError } from '../data/journalRepository';
import { diaryDraft, diaryEntry, fakeJournal } from '../test/journalFixtures';
import { calendarId } from '../test/calendarFixtures';
import type { JournalSnapshot } from '../lib/journal';

beforeEach(() => Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('shared journal refresh lifecycle (simulated transport)', () => {
  it('persists titles and diary CRUD through the repository, remounts and shares across two consumers', async () => {
    const { repo, listeners } = fakeJournal();
    const a = renderHook(() => useSharedJournal(repo, calendarId)), b = renderHook(() => useSharedJournal(repo, calendarId));
    await waitFor(() => expect(a.result.current.loading || b.result.current.loading).toBe(false));
    await act(async () => { expect(await a.result.current.saveBook('botany', 'Our diary')).toBe(true); });
    await waitFor(() => expect(b.result.current.books[0].title).toBe('Our diary'));
    await act(async () => { await a.result.current.saveEntry(diaryDraft); });
    await waitFor(() => expect(b.result.current.entries[0].content).toBe(diaryDraft.content));
    const original = b.result.current.entries[0];
    await act(async () => { await b.result.current.saveEntry({ ...diaryDraft, content: 'A letter back.' }, original); });
    await waitFor(() => expect(a.result.current.entries[0].content).toBe('A letter back.'));
    a.unmount();
    const reloaded = renderHook(() => useSharedJournal(repo, calendarId));
    await waitFor(() => expect(reloaded.result.current.books[0]?.title).toBe('Our diary'));
    expect(reloaded.result.current.entries[0].content).toBe('A letter back.');
    await act(async () => { await b.result.current.deleteEntry(b.result.current.entries[0]); });
    await waitFor(() => expect(reloaded.result.current.entries).toEqual([]));
    b.unmount(); reloaded.unmount(); expect(listeners.size).toBe(0);
  });
  it('discards a stale in-flight read when a new invalidation arrives', async () => {
    const { repo, notify } = fakeJournal(); let resolve!: (snapshot: JournalSnapshot) => void;
    vi.mocked(repo.load).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const view = renderHook(() => useSharedJournal(repo, calendarId));
    vi.mocked(repo.load).mockResolvedValue({ books: [], entries: [diaryEntry] });
    act(notify);
    await act(async () => resolve({ books: [], entries: [] }));
    await waitFor(() => expect(view.result.current.entries).toHaveLength(1));
  });
  it('rejects offline writes and keeps errors/drafts available after failed saves', async () => {
    const { repo } = fakeJournal(); const view = renderHook(() => useSharedJournal(repo, calendarId));
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await act(async () => { expect(await view.result.current.saveEntry(diaryDraft)).toBe(false); });
    expect(repo.saveEntry).not.toHaveBeenCalled(); expect(view.result.current.saveError).toMatch(/offline/);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.mocked(repo.saveEntry).mockRejectedValue(new Error('Conflict; keep draft'));
    await act(async () => { expect(await view.result.current.saveEntry(diaryDraft)).toBe(false); });
    expect(view.result.current.saveError).toContain('keep draft'); expect(view.result.current.entries).toEqual([]);
  });
  it('clears private content on membership revocation and ignores completions after unmount', async () => {
    const { repo, notify, listeners } = fakeJournal({ books: [], entries: [diaryEntry] });
    const view = renderHook(() => useSharedJournal(repo, calendarId));
    await waitFor(() => expect(view.result.current.entries).toHaveLength(1));
    vi.mocked(repo.load).mockRejectedValue(new JournalAccessError('Membership required'));
    act(notify);
    await waitFor(() => expect(view.result.current.entries).toEqual([]));
    expect(view.result.current.accessDenied).toBe(true);
    expect(view.result.current.loadError).toContain('Membership');
    view.unmount(); expect(listeners.size).toBe(0);
  });
  it('recovers missed broadcasts on visibility and online events', async () => {
    const { repo } = fakeJournal(); const view = renderHook(() => useSharedJournal(repo, calendarId));
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    vi.mocked(repo.load).mockResolvedValue({ books: [], entries: [diaryEntry] });
    act(() => { window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(view.result.current.entries).toHaveLength(1));
  });
});
