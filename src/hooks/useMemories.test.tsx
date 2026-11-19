// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMemories } from './useMemories';
import type { MemoryRepository } from '../data/memoryRepository';
import { arrangePhotos, type MemoryView } from '../lib/photobooth';

const memory: MemoryView = { id:'strip',calendar_id:'calendar',title:'Together',mode:'together',shot_count:4,frame:'rose',stickers:[],created_at:'2026-10-19T12:00Z',contributions:[],photos:[null,null,null,null] };
beforeEach(() => { URL.revokeObjectURL = vi.fn(); });
afterEach(cleanup);
describe('memory convergence with simulated transport (no live Supabase)', () => {
  it('converges two open scrapbooks on the partner’s asynchronous contribution', async () => {
    let rows: MemoryView[] = []; const listeners = new Set<()=>void>();
    const repository: MemoryRepository = { load:vi.fn(async()=>structuredClone(rows)), save:vi.fn(),subscribe:(_cal,change,status)=>{listeners.add(change);status(true);return()=>{listeners.delete(change);};} };
    const a = renderHook(()=>useMemories(repository,'calendar')); const b = renderHook(()=>useMemories(repository,'calendar'));
    await waitFor(()=>expect(a.result.current.loading || b.result.current.loading).toBe(false));
    const parts = [{person_key:'sarim' as const,photos:['s1','s2']}];
    rows = [{...memory,photos:arrangePhotos(memory,parts)}]; act(()=>listeners.forEach(fn=>fn()));
    await waitFor(()=>expect(a.result.current.memories[0]?.photos).toEqual([null,'s1',null,'s2']));
    rows = [{...memory,photos:arrangePhotos(memory,[...parts,{person_key:'deena',photos:['d1','d2']}])}]; act(()=>listeners.forEach(fn=>fn()));
    await waitFor(()=>expect(b.result.current.memories[0]?.photos).toEqual(['d1','s1','d2','s2']));
    expect(a.result.current.memories[0].photos).toEqual(b.result.current.memories[0].photos);
    a.unmount();b.unmount();expect(listeners.size).toBe(0);
  });
  it('discards an in-flight stale snapshot after a newer notification', async () => {
    let notify = ()=>{}; let resolve!: (rows:MemoryView[])=>void;
    const load = vi.fn<MemoryRepository['load']>().mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValue([{...memory,title:'Latest'}]);
    const repository:MemoryRepository = {load,save:vi.fn(),subscribe:(_id,fn)=>{notify=fn;return()=>{};}};
    const view=renderHook(()=>useMemories(repository,'calendar'));
    act(()=>notify()); await act(async()=>resolve([{...memory,title:'Old',photos:['blob:stale',null,null,null]}]));
    await waitFor(()=>expect(view.result.current.memories[0]?.title).toBe('Latest'));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:stale');expect(load).toHaveBeenCalledTimes(2);
  });
  it('clears downloaded URLs and reports a failed authoritative reload', async () => {
    const load=vi.fn<MemoryRepository['load']>().mockResolvedValueOnce([{...memory,photos:['blob:private',null,null,null]}]).mockRejectedValue(new Error('Access revoked'));
    const repository:MemoryRepository={load,save:vi.fn(),subscribe:()=>()=>{}};
    const view=renderHook(()=>useMemories(repository,'calendar'));await waitFor(()=>expect(view.result.current.memories).toHaveLength(1));
    act(()=>view.result.current.refresh());await waitFor(()=>expect(view.result.current.error).toBe('Access revoked'));
    expect(view.result.current.memories).toEqual([]);expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private');
  });
});
