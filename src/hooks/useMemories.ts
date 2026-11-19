import { useEffect, useRef, useState } from 'react';
import type { MemoryView } from '../lib/photobooth';
import { releaseMemories, type MemoryRepository } from '../data/memoryRepository';

export function useMemories(repository: MemoryRepository, calendarId: string) {
  const [memories, setMemories] = useState<MemoryView[]>([]);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false); const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    let active = true, running = false, dirty = false; let current: MemoryView[] = [];
    const load = async () => {
      dirty = true; if (running) return; running = true;
      try {
        while (dirty && active) {
          dirty = false;
          const next = await repository.load(calendarId);
          if (!active || dirty) { releaseMemories(next); continue; }
          releaseMemories(current); current = next; setMemories(next); setError('');
        }
      } catch (e) { if (active) { setError(e instanceof Error ? e.message : 'Memories could not be loaded.'); releaseMemories(current); current = []; setMemories([]); } }
      finally { running = false; if (active) setLoading(false); }
    };
    refresh.current = () => { void load(); };
    const unsubscribe = repository.subscribe(calendarId, refresh.current, setConnected);
    const recover = () => { if (document.visibilityState === 'visible') void load(); };
    const offline = () => setConnected(false);
    addEventListener('online', recover); addEventListener('offline', offline); document.addEventListener('visibilitychange', recover);
    const interval = setInterval(recover, 30000); void load();
    return () => { active = false; unsubscribe(); clearInterval(interval); releaseMemories(current); removeEventListener('online', recover); removeEventListener('offline', offline); document.removeEventListener('visibilitychange', recover); };
  }, [repository, calendarId]);
  return { memories, error, loading, connected, refresh: () => refresh.current() };
}
