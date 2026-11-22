import { useCallback, useEffect, useRef, useState } from 'react';
import { CycleAccessError, type PeriodRepository } from '../data/periodRepository';
import type { CycleSnapshot } from '../lib/period';

export function usePeriodTracker(repository: PeriodRepository, userId: string) {
  const [snapshot, setSnapshot] = useState<CycleSnapshot | null>(null);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [error, setError] = useState(''), [denied, setDenied] = useState(false);
  const alive = useRef(true), generation = useRef(0), busy = useRef(false);
  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      const value = await repository.load(userId);
      if (alive.current && request === generation.current) { setSnapshot(value); setDenied(false); setError(''); }
      return true;
    } catch (e) {
      if (alive.current && request === generation.current) {
        setError(e instanceof Error ? e.message : 'The tracker is unavailable.');
        // Clear cached health data on any failed access refresh.
        setSnapshot(null); setDenied(e instanceof CycleAccessError);
      }
      return false;
    } finally { if (alive.current && request === generation.current) setLoading(false); }
  }, [repository, userId]);
  useEffect(() => {
    alive.current = true; void load();
    const refresh = () => { if (!busy.current) void load(); };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    addEventListener('focus', refresh); addEventListener('online', refresh); document.addEventListener('visibilitychange', visible);
    return () => { alive.current = false; ++generation.current; removeEventListener('focus', refresh); removeEventListener('online', refresh); document.removeEventListener('visibilitychange', visible); };
  }, [load]);
  const mutate = async (operation: () => Promise<void>) => {
    if (busy.current || denied) return false;
    busy.current = true; setSaving(true); setError('');
    try { await operation(); return await load(); }
    catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : 'The change could not be saved.');
        if (e instanceof CycleAccessError) { setSnapshot(null); setDenied(true); }
      }
      return false;
    } finally { busy.current = false; if (alive.current) setSaving(false); }
  };
  return { snapshot, loading, saving, error, denied, refresh: load, mutate };
}
