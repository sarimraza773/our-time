import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from './database';
import { createJournalRepository, JournalAccessError } from './journalRepository';
import { diaryDraft, diaryEntry } from '../test/journalFixtures';
import { calendarId } from '../test/calendarFixtures';

function clientWith(data: unknown, error: unknown = null) {
  const query = { eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn(async () => ({ data, error })), maybeSingle: vi.fn(async () => ({ data, error })) };
  const table = { update: vi.fn((_write: unknown) => query), delete: vi.fn(() => query), insert: vi.fn((_write: unknown) => query), upsert: vi.fn((_write: unknown) => query) };
  const client = { from: vi.fn(() => table), rpc: vi.fn(async () => ({ data, error })) };
  return { client: client as unknown as SupabaseClient<Database>, query, table };
}
describe('Supabase journal query boundaries', () => {
  it('scopes edits and deletes to calendar, entry and expected version', async () => {
    const { client, query, table } = clientWith({ id: diaryDraft.id }); const repo = createJournalRepository(client);
    await repo.saveEntry(calendarId, diaryDraft, diaryEntry);
    expect(query.eq.mock.calls).toEqual([['calendar_id', calendarId], ['id', diaryDraft.id], ['version', 1]]);
    expect(table.update.mock.calls[0][0]).toEqual({ title: diaryDraft.title, content: diaryDraft.content, formatting: diaryDraft.formatting });
    query.eq.mockClear(); await repo.deleteEntry(calendarId, diaryEntry);
    expect(query.eq.mock.calls).toEqual([['calendar_id', calendarId], ['id', diaryDraft.id], ['version', 1]]);
  });
  it('treats zero matching rows as a conflict and preserves the caller draft', async () => {
    const { client } = clientWith(null); const repo = createJournalRepository(client);
    await expect(repo.saveEntry(calendarId, diaryDraft, diaryEntry)).rejects.toThrow(/draft is still here/);
    await expect(repo.deleteEntry(calendarId, diaryEntry)).rejects.toThrow(/changed/);
    expect(diaryDraft.content).toBe('We watched the rain together.');
  });
  it('maps membership errors separately from transport errors', async () => {
    const { client } = clientWith(null, { code: '42501', message: 'Denied' });
    await expect(createJournalRepository(client).load(calendarId)).rejects.toBeInstanceOf(JournalAccessError);
  });
});
