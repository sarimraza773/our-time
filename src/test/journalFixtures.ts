import { vi } from 'vitest';
import type { JournalRepository } from '../data/journalRepository';
import { defaultFormat, type DiaryDraft, type DiaryEntry, type JournalSnapshot } from '../lib/journal';
import { calendarId, stamp, users } from './calendarFixtures';

export const diaryDraft: DiaryDraft = { id: '00000000-0000-4000-8000-000000000100', title: 'A small joy', content: 'We watched the rain together.', formatting: { ...defaultFormat } };
export const diaryEntry: DiaryEntry = { ...diaryDraft, calendar_id: calendarId, created_by: users.deena, created_at: stamp, updated_at: stamp, version: 1 };
export function fakeJournal(initial: JournalSnapshot = { books: [], entries: [] }) {
  let state = structuredClone(initial);
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(fn => fn());
  const repo: JournalRepository = {
    load: vi.fn(async () => structuredClone(state)),
    saveBook: vi.fn(async (id, key, title) => {
      state.books = [...state.books.filter(b => b.book_key !== key), { calendar_id: id, book_key: key, title: title.trim(), updated_at: stamp }]; notify();
    }),
    saveEntry: vi.fn(async (id, draft, original) => {
      state.entries = [{ ...draft, calendar_id: id, created_by: original?.created_by ?? users.deena, created_at: original?.created_at ?? stamp, updated_at: stamp, version: (original?.version ?? 0) + 1 }, ...state.entries.filter(e => e.id !== draft.id)]; notify();
    }),
    deleteEntry: vi.fn(async (_id, entry) => { state.entries = state.entries.filter(e => e.id !== entry.id); notify(); }),
    subscribe: vi.fn((_id, change, status) => { listeners.add(change); status(true); return () => listeners.delete(change); }),
  };
  return { repo, notify, listeners, replace: (next: JournalSnapshot) => { state = next; notify(); } };
}
