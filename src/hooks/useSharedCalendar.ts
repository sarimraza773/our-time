import { useCallback, useEffect, useRef, useState } from 'react';
import type { CalendarEvent, RecurringRule } from '../types';
import type { Snapshot } from '../data/database';
import { CalendarAccessError, createCalendarRepository, type CalendarRepository } from '../data/calendarRepository';
import { EMPTY_SCHEDULE, mapSnapshot, ownerUsers } from '../data/calendarMapping';
import { deviceStorage, markMigration, migrationMarker, readLocalCalendar, shouldOfferImport } from '../data/localMigration';
import { supabase } from '../lib/supabase';
import { calendarLoadError } from '../lib/calendarErrors';

const defaultRepository = supabase ? createCalendarRepository(supabase) : null;
export function useSharedCalendar(userId: string, repository: CalendarRepository | null = defaultRepository) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [source, setSource] = useState(EMPTY_SCHEDULE);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [realtime, setRealtime] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [importDismissed, setImportDismissed] = useState(false);
  const [local] = useState(() => readLocalCalendar(deviceStorage));
  const alive = useRef(false), busy = useRef(false);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (!repository) return;
    alive.current = true;
    let disposed = false, dirty = false, running: Promise<void> | null = null;
    const refresh = (): Promise<void> => {
      dirty = true;
      if (running) return running;
      running = (async () => {
        setSyncing(true);
        try {
          do {
            dirty = false;
            const next = await repository.loadCalendar();
            ownerUsers(next.profiles);
            if (!next.profiles.some(p => p.id === userId)) throw new CalendarAccessError('This account no longer has calendar access.');
            if (!disposed && !dirty) {
              const mapped = mapSnapshot(next);
              setSnapshot(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
              setSource(previous => JSON.stringify(previous) === JSON.stringify(mapped) ? previous : mapped);
              setLoadError('');
            }
          } while (dirty && !disposed);
        } catch (e) {
          if (!disposed) {
            if (e instanceof CalendarAccessError) { setSnapshot(null); setSource(EMPTY_SCHEDULE); }
            setLoadError(calendarLoadError(e));
          }
          throw e;
        } finally {
          running = null;
          if (!disposed) { setLoading(false); setSyncing(false); }
        }
      })();
      return running;
    };
    refreshRef.current = refresh;
    const retry = () => { void refresh().catch(() => {}); };
    const onOnline = () => { setOnline(true); retry(); };
    const onOffline = () => { setOnline(false); setRealtime(false); };
    const onVisible = () => { if (document.visibilityState === 'visible') retry(); };
    retry();
    addEventListener('online', onOnline); addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    // Recovery for missed notifications, suspended tabs, and membership revocation.
    const interval = window.setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible') retry(); }, 30_000);
    return () => {
      disposed = true; alive.current = false;
      clearInterval(interval); removeEventListener('online', onOnline); removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [repository, userId]);

  const calendarId = snapshot?.calendar.id;
  useEffect(() => {
    if (!repository || !calendarId) return;
    let active = true, timer = 0;
    const invalidate = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => { void refreshRef.current().catch(() => {}); }, 100);
    };
    const unsubscribe = repository.subscribeToCalendarChanges(calendarId, invalidate, connected => {
      if (!active) return;
      setRealtime(connected);
      // Reconcile the initial-load / subscription gap and every reconnect.
      if (connected) invalidate();
    });
    return () => { active = false; clearTimeout(timer); unsubscribe(); };
  }, [repository, calendarId]);

  const mutate = async (operation: () => Promise<void>) => {
    if (busy.current) return false;
    if (!navigator.onLine) { setError('You are offline. Your changes have not been saved. Reconnect and try again.'); return false; }
    busy.current = true; setSaving(true); setError('');
    try {
      await operation();
      try { await refreshRef.current(); }
      catch { if (alive.current) setError('The database accepted your change, but the latest calendar could not be refreshed. Retry the connection to confirm it.'); }
      return alive.current;
    } catch (e) {
      if (alive.current) setError(`We could not confirm this change was saved. ${e instanceof Error ? e.message : 'Please reconnect and retry.'}`);
      // The server may have committed before a response was lost. Never assume failure means absence.
      await refreshRef.current().catch(() => {});
      return false;
    } finally {
      busy.current = false;
      if (alive.current) setSaving(false);
    }
  };
  const context = () => {
    if (!snapshot || !repository) throw new Error('The shared calendar is not ready yet.');
    return { calendarId: snapshot.calendar.id, users: ownerUsers(snapshot.profiles), repository };
  };
  const saveEvent = (event: CalendarEvent, existing: boolean) => mutate(async () => {
    const c = context();
    if (event.id.startsWith('rule:')) await c.repository.createRecurringException(event.id, event, c.calendarId, c.users);
    else await c.repository[existing || source.events.some(e => e.id === event.id) ? 'updateEvent' : 'createEvent'](event, c.calendarId, c.users);
  });
  const deleteEvent = (event: CalendarEvent) => mutate(async () => {
    const c = context();
    if (event.id.startsWith('rule:')) await c.repository.createRecurringException(event.id, null, c.calendarId, c.users);
    else await c.repository.deleteEvent(event.id, c.calendarId);
  });
  const saveRule = (rule: RecurringRule, existing: boolean) => mutate(async () => {
    const c = context(); await c.repository[existing || source.rules.some(r => r.id === rule.id) ? 'updateRecurringRule' : 'createRecurringRule'](rule, c.calendarId, c.users);
  });
  const deleteRule = (id: string) => mutate(async () => { const c = context(); await c.repository.deleteRecurringRule(id, c.calendarId); });
  const importLocal = () => mutate(async () => {
    const c = context();
    if (!local.source) throw new Error('No readable local calendar was found.');
    await c.repository.importLocalCalendar(local.source, c.calendarId, c.users);
    // A server receipt also prevents repetition if local storage is blocked or cleared.
    markMigration(deviceStorage, c.calendarId, 'imported');
    setImportDismissed(true);
  });
  const startFresh = () => {
    if (calendarId) markMigration(deviceStorage, calendarId, 'fresh');
    setImportDismissed(true);
  };
  const retry = useCallback(() => { void refreshRef.current().catch(() => {}); }, []);
  const offerImport = !!snapshot && !importDismissed && shouldOfferImport(source, local,
    migrationMarker(deviceStorage, snapshot.calendar.id), snapshot.calendar.local_import_completed_at);
  return { snapshot, source, loading, saving, error: error || loadError, localError: local.error,
    connection: !online ? 'Offline' : saving || syncing ? 'Syncing…' : loadError ? 'Connection interrupted' : realtime ? 'Connected' : 'Reconnecting…',
    retry, saveEvent, deleteEvent, saveRule, deleteRule, importLocal, startFresh, offerImport,
    cancelImport: () => setImportDismissed(true), clearError: () => setError('') };
}
