import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './database';
import { BOOKS, diaryWrite, readFormat, type BookKey, type DiaryDraft, type DiaryEntry, type JournalSnapshot } from '../lib/journal';

export class JournalAccessError extends Error {}
function check(error: { message: string; code?: string } | null) {
  if (error?.code === '42501') throw new JournalAccessError('This account no longer has access to the shared diary.');
  if (error) throw new Error(error.message);
}
export function createJournalRepository(client: SupabaseClient<Database>) {
  return {
    async load(calendarId: string): Promise<JournalSnapshot> {
      const { data, error } = await client.rpc('load_shared_journal', { p_calendar_id: calendarId }); check(error);
      if (!data) throw new JournalAccessError('The shared diary is unavailable.');
      const snapshot = data as unknown as JournalSnapshot;
      return { books: snapshot.books, entries: snapshot.entries.map(entry => ({ ...entry, formatting: readFormat(entry.formatting) })) };
    },
    async saveBook(calendarId: string, bookKey: BookKey, value: string) {
      const title = value.trim();
      if (!BOOKS.some(b => b.key === bookKey) || !title || title.length > 48) throw new Error('Book titles need 1–48 characters.');
      const { error } = await client.from('bookshelf_titles').upsert({ calendar_id: calendarId, book_key: bookKey, title }, { onConflict: 'calendar_id,book_key' }).select('book_key').single(); check(error);
    },
    async saveEntry(calendarId: string, draft: DiaryDraft, existing?: DiaryEntry) {
      const content = diaryWrite(draft);
      const write = { ...content, formatting: content.formatting as unknown as Json };
      if (existing) {
        const { data, error } = await client.from('diary_entries').update(write).eq('calendar_id', calendarId).eq('id', draft.id).eq('version', existing.version).select('id').maybeSingle(); check(error);
        if (!data) throw new Error('This page changed or was removed while you were writing. Your draft is still here. Copy it, then cancel and reopen the latest page.');
      } else {
        const { error } = await client.from('diary_entries').insert({ id: draft.id, calendar_id: calendarId, ...write }).select('id').single(); check(error);
      }
    },
    async deleteEntry(calendarId: string, entry: DiaryEntry) {
      const { data, error } = await client.from('diary_entries').delete().eq('calendar_id', calendarId).eq('id', entry.id).eq('version', entry.version).select('id').maybeSingle(); check(error);
      if (!data) throw new Error('This page changed or was already removed. Refresh and review it before deleting.');
    },
    subscribe(calendarId: string, onChange: () => void, onStatus: (connected: boolean) => void) {
      let active = true;
      const channel = client.channel(`journal:${calendarId}`, { config: { private: true } })
        .on('broadcast', { event: 'journal_changed' }, () => { if (active) onChange(); });
      void client.realtime.setAuth().then(() => {
        if (active) channel.subscribe(status => { if (active) onStatus(status === 'SUBSCRIBED'); });
      }).catch(() => { if (active) onStatus(false); });
      return () => { active = false; void client.removeChannel(channel); };
    },
  };
}
export type JournalRepository = ReturnType<typeof createJournalRepository>;
