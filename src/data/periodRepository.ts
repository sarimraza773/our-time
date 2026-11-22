import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database';
import { validateCycle, validatePeriod, type CycleSettings, type CycleSnapshot, type PeriodDraft, type PeriodEntry } from '../lib/period';

export class CycleAccessError extends Error {}
function check(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === '42501' || error.code === 'PGRST301') throw new CycleAccessError('This tracker is available only to Deena and Sarim’s linked accounts.');
  if (['42P01', 'PGRST205', 'PGRST202'].includes(error.code ?? '')) throw new Error('The private tracker database update has not been installed. Your existing calendar is safe.');
  if (['23505', '23514', '23P01'].includes(error.code ?? '')) throw new Error('These dates conflict with a saved record or cycle setting. Refresh and check the dates.');
  throw new Error('The private tracker could not save or load. Check your connection and retry.');
}
export function createPeriodRepository(client: SupabaseClient<Database>) {
  return {
    async load(_userId: string): Promise<CycleSnapshot> {
      const access = await client.rpc('cycle_tracker_owner_id'); check(access.error);
      if (!access.data) throw new CycleAccessError('This tracker is available only to Deena and Sarim’s linked accounts.');
      const [periods, settings] = await Promise.all([
        client.from('period_entries').select('*').eq('user_id', access.data).order('start_date'),
        client.from('cycle_settings').select('*').eq('user_id', access.data).maybeSingle(),
      ]);
      check(periods.error); check(settings.error);
      return { ownerUserId: access.data, entries: periods.data ?? [], settings: settings.data };
    },
    async saveEntry(userId: string, draft: PeriodDraft, entries: PeriodEntry[], original?: PeriodEntry) {
      validatePeriod(draft, entries);
      if (original) {
        const { data, error } = await client.from('period_entries').update(draft).eq('user_id', userId).eq('id', original.id).eq('updated_at', original.updated_at).select('id').maybeSingle(); check(error);
        if (!data) throw new Error('This record changed in another session. Refresh before editing it.');
      } else {
        const { error } = await client.from('period_entries').insert({ ...draft, user_id: userId }).select('id').single(); check(error);
      }
    },
    async deleteEntry(userId: string, entry: PeriodEntry) {
      const { data, error } = await client.from('period_entries').delete().eq('user_id', userId).eq('id', entry.id).eq('updated_at', entry.updated_at).select('id').maybeSingle(); check(error);
      if (!data) throw new Error('This record changed in another session. Refresh before deleting it.');
    },
    async saveSettings(userId: string, value: Omit<CycleSettings, 'user_id' | 'updated_at'>, original: CycleSettings | null) {
      validateCycle(value);
      if (original) {
        const { data, error } = await client.from('cycle_settings').update(value).eq('user_id', userId).eq('updated_at', original.updated_at).select('user_id').maybeSingle(); check(error);
        if (!data) throw new Error('Settings changed in another session. Refresh before saving.');
      } else {
        const { error } = await client.from('cycle_settings').insert({ ...value, user_id: userId }).select('user_id').single(); check(error);
      }
    },
    async deleteAll() { const { error } = await client.rpc('delete_cycle_tracker_data'); check(error); },
  };
}
export type PeriodRepository = ReturnType<typeof createPeriodRepository>;
