// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database';
import { createMemoryRepository } from './memoryRepository';
import type { Memory } from '../lib/photobooth';

const memory:Memory={id:'memory',calendar_id:'calendar',title:'Moments',mode:'solo',shot_count:3,frame:'cream',stickers:[],created_at:'2026-10-19T12:00Z'};
beforeEach(()=>{URL.createObjectURL=vi.fn(()=> 'blob:photo');URL.revokeObjectURL=vi.fn();});
describe('private memory transport',()=>{
  it('uploads immutable JPEGs before committing metadata and surfaces a rejected commit',async()=>{
    const order:string[]=[];const upload=vi.fn(async()=>{order.push('upload');return{error:null};});
    const rpc=vi.fn(async()=>{order.push('commit');return{error:{message:'Membership revoked'}};});
    const client={rpc,storage:{from:vi.fn(()=>({upload}))}} as unknown as SupabaseClient<Database>;
    const repository=createMemoryRepository(client);
    await expect(repository.save(memory,'authenticated-user',[new Blob(),new Blob(),new Blob()])).rejects.toThrow(/Membership revoked/);
    expect(order).toEqual(['upload','upload','upload','commit']);
    expect(upload.mock.calls[0]).toEqual([expect.stringMatching(/^calendar\/authenticated-user\/.+\.jpg$/),expect.any(Blob),{contentType:'image/jpeg',upsert:false}]);
  });
  it('releases successful downloads if another photo fails',async()=>{
    const rpc=vi.fn(async()=>({error:null,data:{memories:[memory],contributions:[{memory_id:memory.id,person_key:'deena',paths:['good','bad']}]}}));
    const download=vi.fn(async(path:string)=>path==='bad'?{error:{message:'Denied'},data:null}:{error:null,data:new Blob()});
    const client={rpc,storage:{from:()=>({download})}} as unknown as SupabaseClient<Database>;
    await expect(createMemoryRepository(client).load('calendar')).rejects.toThrow('Denied');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo');
  });
  it('waits for channel teardown before a rapid reopen and never uses the calendar topic',async()=>{
    let finish!:()=>void;const channel={on:vi.fn().mockReturnThis(),subscribe:vi.fn()};
    const client={channel:vi.fn(()=>channel),realtime:{setAuth:vi.fn(async()=>{})},removeChannel:vi.fn(()=>new Promise<void>(r=>{finish=r;}))} as unknown as SupabaseClient<Database>;
    const repository=createMemoryRepository(client);const unsubscribe=repository.subscribe('calendar',()=>{},()=>{});
    await Promise.resolve();await Promise.resolve();unsubscribe();
    const closeAgain=repository.subscribe('calendar',()=>{},()=>{});await Promise.resolve();
    expect(client.channel).toHaveBeenCalledTimes(1);finish();await Promise.resolve();await Promise.resolve();await Promise.resolve();
    expect(client.channel).toHaveBeenCalledTimes(2);expect(client.channel).toHaveBeenLastCalledWith('memories:calendar',{config:{private:true}});closeAgain();
  });
});
