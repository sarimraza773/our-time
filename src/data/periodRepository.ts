import type { SupabaseClient } from '@supabase/supabase-js';
import { validatePhasePlan, type PhasePlan, type PhasePlanDraft, type CyclePrediction } from '../lib/cyclePlanning';
import type { Database, Json } from './database';
import { validateCycle, validatePeriod, type CycleSettings, type CycleSnapshot, type PeriodDraft, type PeriodEntry } from '../lib/period';

export class CycleAccessError extends Error {}
function check(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === '42501' || error.code === 'PGRST301') throw new CycleAccessError('This tracker is available only to Deena and Sarim’s linked accounts.');
  if (['42P01', 'PGRST205', 'PGRST202'].includes(error.code ?? '')) throw new Error('The private tracker database update has not been installed. Your existing calendar is safe.');
  if (error.code === '40001') throw new Error('This phase plan or prediction changed in another session. Refresh before saving.');
  if (['23505', '23514', '23P01'].includes(error.code ?? '')) throw new Error('These dates conflict with a saved record or cycle setting. Refresh and check the dates.');
  throw new Error('The private tracker could not save or load. Check your connection and retry.');
}
export function createPeriodRepository(client: SupabaseClient<Database>) {
  let planningReady = true;
  return {
    async load(_userId: string): Promise<CycleSnapshot> {
      const access = await client.rpc('cycle_tracker_owner_id'); check(access.error);
      if (!access.data) throw new CycleAccessError('This tracker is available only to Deena and Sarim’s linked accounts.');
      const sync = await client.rpc('sync_cycle_predictions');
      const planningAvailable = !['PGRST202','42P01','PGRST205'].includes(sync.error?.code ?? '');
      if (planningAvailable) check(sync.error);
      planningReady = planningAvailable;
      const [periods, settings, plans, predictions] = await Promise.all([
        client.from('period_entries').select('*').eq('user_id', access.data).order('start_date'),
        client.from('cycle_settings').select('*').eq('user_id', access.data).maybeSingle(),
        planningAvailable ? client.from('cycle_phase_plans').select('*').eq('user_id',access.data).order('cycle_start_date') : Promise.resolve({data:[],error:null}),
        planningAvailable ? client.from('cycle_predictions').select('*').eq('user_id',access.data).order('start_date') : Promise.resolve({data:[],error:null}),
      ]);
      check(periods.error); check(settings.error); check(plans.error); check(predictions.error);
      return { ownerUserId: access.data, planningAvailable, phasePlans: plans.data ?? [], predictions: predictions.data ?? [], entries: periods.data ?? [], settings: settings.data };
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
      const write = {...value};
      if (!planningReady) { delete (write as Partial<typeof write>).auto_log_predictions; delete (write as Partial<typeof write>).phase_lengths; }
      if (original) {
        const { data, error } = await client.from('cycle_settings').update(write).eq('user_id', userId).eq('updated_at', original.updated_at).select('user_id').maybeSingle(); check(error);
        if (!data) throw new Error('Settings changed in another session. Refresh before saving.');
      } else {
        const { error } = await client.from('cycle_settings').insert({ ...write, user_id: userId }).select('user_id').single(); check(error);
      }
    },
    async savePhasePlan(plan: PhasePlanDraft, useForFuture: boolean, original?: PhasePlan) {
      validatePhasePlan(plan, useForFuture);
      const { error } = await client.rpc('save_cycle_phase_plan', { p_cycle_start: plan.cycle_start_date, p_phases: plan.phases as unknown as Json, p_use_for_future: useForFuture, p_expected_updated_at: original?.updated_at ?? null }); check(error);
    },
    async deletePhasePlan(plan: PhasePlan) {
      const { error } = await client.rpc('delete_cycle_phase_plan', { p_cycle_start: plan.cycle_start_date, p_expected_updated_at: plan.updated_at }); check(error);
    },
    async dismissPrediction(prediction: CyclePrediction) {
      const { error } = await client.rpc('dismiss_cycle_prediction', { p_id: prediction.id, p_expected_updated_at: prediction.updated_at }); check(error);
    },
    async confirmPrediction(prediction: CyclePrediction, draft: PeriodDraft, entries: PeriodEntry[]) {
      validatePeriod(draft, entries);
      if (draft.start_date <= prediction.anchor_start) throw new Error('The actual start must follow the previous recorded period start.');
      const { error } = await client.rpc('confirm_cycle_prediction', { p_id: prediction.id, p_start: draft.start_date, p_end: draft.end_date, p_notes: draft.notes, p_expected_updated_at: prediction.updated_at }); check(error);
    },
    async deleteAll() { const { error } = await client.rpc('delete_cycle_tracker_data'); check(error); },
  };
}
export type PeriodRepository = ReturnType<typeof createPeriodRepository>;
