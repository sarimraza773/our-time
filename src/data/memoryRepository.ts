import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './database';
import { arrangePhotos, type Contribution, type Memory, type MemoryView } from '../lib/photobooth';

const bucket = 'our-time-memories';
function check(error: { message: string } | null) { if (error) throw new Error(error.message); }
export function createMemoryRepository(client: SupabaseClient<Database>) {
  // React StrictMode and quick close/reopen must finish removing the old channel
  // before asking Supabase for that same topic again (the client reuses topics).
  let teardown: Promise<unknown> = Promise.resolve();
  // Blobs live only in this signed-in planner's memory, never localStorage.
  // RLS is rechecked on every snapshot; immutable paths need downloading only once.
  const photoCache = new Map<string, Blob>();
  return {
    async load(calendarId: string): Promise<MemoryView[]> {
      const allocated: string[] = [];
      try {
      const { data, error } = await client.rpc('load_photo_memories', { p_calendar_id: calendarId }); check(error);
      if (!data) throw new Error('This account no longer has access to these memories.');
      const snapshot = data as unknown as { memories: Memory[]; contributions: Contribution[] };
      const visiblePaths = new Set(snapshot.contributions.flatMap(c => c.paths));
      for (const path of photoCache.keys()) if (!visiblePaths.has(path)) photoCache.delete(path);
      const downloads = await Promise.allSettled([...visiblePaths].map(async path => {
        let blob = photoCache.get(path);
        if (!blob) {
          const result = await client.storage.from(bucket).download(path); check(result.error);
          if (!result.data) throw new Error('A saved photo is unavailable.');
          blob = result.data; photoCache.set(path, blob);
        }
        const url = URL.createObjectURL(blob); allocated.push(url); return [path, url] as const;
      }));
      const failure = downloads.find(r => r.status === 'rejected'); if (failure?.status === 'rejected') throw failure.reason;
      const urls = new Map(downloads.flatMap(r => r.status === 'fulfilled' ? [r.value] : []));
      return snapshot.memories.map(row => {
        const memory = { ...row, stickers: row.stickers as unknown as Memory['stickers'] };
        const parts = snapshot.contributions.filter(c => c.memory_id === memory.id);
        const resolved = parts.map(c => ({ person_key: c.person_key, photos: c.paths.map(path => urls.get(path)!) }));
        return { ...memory, contributions: parts, photos: arrangePhotos(memory, resolved) };
      });
      } catch (error) { allocated.forEach(url => URL.revokeObjectURL(url)); photoCache.clear(); throw error; }
    },
    async save(memory: Memory, userId: string, photos: Blob[]) {
      const paths: string[] = [];
      try {
        for (const photo of photos) {
          const path = `${memory.calendar_id}/${userId}/${crypto.randomUUID()}.jpg`;
          const result = await client.storage.from(bucket).upload(path, photo, { contentType: 'image/jpeg', upsert: false }); check(result.error); paths.push(path);
        }
        const result = await client.rpc('save_photo_contribution', { p_memory: memory as unknown as Json, p_paths: paths });
        check(result.error);
      } catch (error) {
        // A lost RPC response may have committed. Never remove possibly referenced photos.
        // The server receipt is the contribution row; a later refresh resolves uncertainty.
        throw new Error(`${error instanceof Error ? error.message : 'Save failed'}. Your preview is still here. Refresh Memories before retrying if the connection was interrupted.`);
      }
    },
    subscribe(calendarId: string, onChange: () => void, onStatus: (connected: boolean) => void) {
      let active = true;
      let channel: RealtimeChannel | undefined;
      void (async () => {
        await teardown; if (!active) return;
        channel = client.channel(`memories:${calendarId}`, { config: { private: true } }).on('broadcast', { event: 'memories_changed' }, () => { if (active) onChange(); });
        await client.realtime.setAuth();
        if (active) channel.subscribe(status => { if (active) { onStatus(status === 'SUBSCRIBED'); if (status === 'SUBSCRIBED') onChange(); } });
      })().catch(() => { if (active) onStatus(false); });
      return () => { active = false; if (channel) teardown = client.removeChannel(channel).catch(() => {}); };
    },
  };
}
export type MemoryRepository = ReturnType<typeof createMemoryRepository>;
export function releaseMemories(memories: MemoryView[]) { for (const memory of memories) for (const url of memory.photos) if (url) URL.revokeObjectURL(url); }
