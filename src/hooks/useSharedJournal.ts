import { useCallback, useEffect, useRef, useState } from 'react';
import { JournalAccessError, type JournalRepository } from '../data/journalRepository';
import type { BookKey, DiaryDraft, DiaryEntry, JournalSnapshot } from '../lib/journal';

export function useSharedJournal(repository: JournalRepository | null, calendarId: string | undefined) {
  const [snapshot, setSnapshot] = useState<JournalSnapshot>({ books: [], entries: [] });
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [connected, setConnected] = useState(false);
  const [loadError, setLoadError] = useState(''), [saveError, setSaveError] = useState('');
  const [accessDenied, setAccessDenied] = useState(false);
  const session = useRef<{ refresh: () => Promise<void>; active: boolean; busy: boolean } | null>(null);
  useEffect(() => {
    setSnapshot({ books: [], entries: [] }); setLoading(true); setConnected(false); setLoadError(''); setSaveError(''); setSaving(false); setAccessDenied(false);
    if (!repository || !calendarId) { setLoading(false); return; }
    let dirty = false, running: Promise<void> | null = null;
    const scope = { active: true, busy: false, refresh: async (): Promise<void> => {} };
    scope.refresh = () => {
      dirty = true;
      if (running) return running;
      running = (async () => {
        try {
          do {
            dirty = false;
            const next = await repository.load(calendarId);
            if (scope.active && !dirty) { setSnapshot(next); setLoadError(''); setAccessDenied(false); }
          } while (scope.active && dirty);
        } catch (error) {
          if (scope.active) {
            if (error instanceof JournalAccessError) { setSnapshot({ books: [], entries: [] }); setAccessDenied(true); setConnected(false); }
            setLoadError(error instanceof JournalAccessError ? error.message : 'Our bookshelf could not be refreshed. Check the connection and shared diary setup, then retry.');
          }
          throw error;
        } finally { running = null; if (scope.active) setLoading(false); }
      })();
      return running;
    };
    session.current = scope;
    const refresh = () => { void scope.refresh().catch(() => {}); };
    const unsubscribe = repository.subscribe(calendarId, refresh, online => {
      if (!scope.active) return;
      setConnected(online);
      if (online) refresh(); // Reconcile initial subscription gap and reconnects.
    });
    const recover = () => { if (navigator.onLine && document.visibilityState === 'visible') refresh(); };
    const offline = () => setConnected(false);
    addEventListener('online', recover); addEventListener('offline', offline); document.addEventListener('visibilitychange', recover);
    const timer = setInterval(recover, 30_000); refresh();
    return () => { scope.active = false; unsubscribe(); clearInterval(timer); removeEventListener('online', recover); removeEventListener('offline', offline); document.removeEventListener('visibilitychange', recover); };
  }, [repository, calendarId]);
  const mutate = async (operation: (repo: JournalRepository, id: string) => Promise<void>) => {
    const scope = session.current;
    if (!scope?.active || !repository || !calendarId || scope.busy) return false;
    if (accessDenied) { setSaveError('This account no longer has access to the shared diary.'); return false; }
    if (!navigator.onLine) { setSaveError('You are offline. Your changes have not been saved. Keep this page open and retry after reconnecting.'); return false; }
    scope.busy = true; setSaving(true); setSaveError('');
    try {
      await operation(repository, calendarId);
      try { await scope.refresh(); } catch { /* A confirmed write remains successful; show the separate refresh error. */ }
      return scope.active;
    } catch (error) {
      if (scope.active) setSaveError(error instanceof Error ? error.message : 'We could not confirm this change was saved. Keep your draft and retry.');
      await scope.refresh().catch(() => {});
      return false;
    } finally { scope.busy = false; if (scope.active) setSaving(false); }
  };
  const refresh = useCallback(() => { void session.current?.refresh().catch(() => {}); }, []);
  return { ...snapshot, loading, saving, connected, loadError, saveError, accessDenied, refresh,
    clearSaveError: () => setSaveError(''),
    saveBook: (key: BookKey, title: string) => mutate((repo, id) => repo.saveBook(id, key, title)),
    saveEntry: (draft: DiaryDraft, existing?: DiaryEntry) => mutate((repo, id) => repo.saveEntry(id, draft, existing)),
    deleteEntry: (entry: DiaryEntry) => mutate((repo, id) => repo.deleteEntry(id, entry)),
  };
}
export type SharedJournal = ReturnType<typeof useSharedJournal>;
