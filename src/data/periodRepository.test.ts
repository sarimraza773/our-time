import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from './database';
import { createPeriodRepository, CycleAccessError } from './periodRepository';
const user = '00000000-0000-4000-8000-000000000001';
const record = { id:'00000000-0000-4000-8000-000000000100',user_id:user,start_date:'2026-01-01',end_date:'2026-01-05',notes:'Synthetic note',updated_at:'2026-01-05T00:00:00Z' };
function fixture(responses: {body: unknown; status?: number}[]) {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {const response=responses.shift(); if (!response) throw new Error('Unexpected request'); return new Response(JSON.stringify(response.body),{status:response.status??200,headers:{'Content-Type':'application/json'}});});
  const client=createClient<Database>('https://example.invalid','synthetic-public-test-key',{global:{fetch},auth:{persistSession:false,autoRefreshToken:false}});
  return {repository:createPeriodRepository(client),fetch};
}
describe('two-account tracker repository through the Supabase SDK with simulated HTTP',()=>{
  it('resolves the tracker owner on the server, filters private reads by that identity and retains date-only strings',async()=>{
    const {repository,fetch}=fixture([{body:user},{body:[record]},{body:null}]);
    const result=await repository.load(user); expect(result.entries[0].start_date).toBe('2026-01-01'); expect(result.settings).toBeNull();
    expect(String(fetch.mock.calls[0][0])).toContain('/rpc/cycle_tracker_owner_id');
    for(const call of fetch.mock.calls.slice(1)) expect(String(call[0])).toContain(`user_id=eq.${user}`);
  });
  it('loads the same server-owned records for Sarim instead of querying a separate tracker',async()=>{
    const sarim='00000000-0000-4000-8000-000000000002';
    const {repository,fetch}=fixture([{body:user},{body:[record]},{body:null}]);
    const result=await repository.load(sarim);
    expect(result.ownerUserId).toBe(user);expect(result.entries[0].user_id).toBe(user);
    for(const call of fetch.mock.calls.slice(1)) {expect(String(call[0])).toContain(`user_id=eq.${user}`);expect(String(call[0])).not.toContain(`user_id=eq.${sarim}`);}
  });
  it('stops before fetching health records when server mapping denies access',async()=>{
    const {repository,fetch}=fixture([{body:null}]); await expect(repository.load(user)).rejects.toBeInstanceOf(CycleAccessError); expect(fetch).toHaveBeenCalledOnce();
  });
  it('uses update timestamps to reject stale edits and never falls back to insert',async()=>{
    const {repository,fetch}=fixture([{body:null}]);
    await expect(repository.saveEntry(user,record,[record],record)).rejects.toThrow(/changed in another session/); expect(fetch).toHaveBeenCalledOnce();
    expect(String(fetch.mock.calls[0][0])).toContain('updated_at=eq.');
  });
  it('does not expose raw backend messages or notes through failure messages',async()=>{
    const {repository}=fixture([{body:{code:'23514',message:'PRIVATE SQL DETAIL Synthetic note'},status:400}]);
    await expect(repository.saveEntry(user,record,[])).rejects.toThrow('These dates conflict with a saved record or cycle setting. Refresh and check the dates.');
  });
  it('uses an authenticated linked-tracker RPC for atomic health-data deletion',async()=>{
    const {repository,fetch}=fixture([{body:null}]); await repository.deleteAll(); expect(String(fetch.mock.calls[0][0])).toContain('/rpc/delete_cycle_tracker_data');
  });
});
