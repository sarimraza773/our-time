import type { CycleSettings, Phase } from './period';
import { addDays, dateOnly, daysBetween } from './period';

export const PHASE_ORDER: Phase[] = ['menstruation', 'follicular', 'ovulation', 'luteal'];
export type PhaseLengths = Record<Phase, number>;
export type PhaseDates = { phase: Phase; start_date: string; end_date: string };
export type PhasePlan = { user_id: string; cycle_start_date: string; phases: PhaseDates[]; updated_at: string };
export type PhasePlanDraft = Pick<PhasePlan, 'cycle_start_date' | 'phases'>;
export type CyclePrediction = {
  id: string; user_id: string; anchor_start: string; start_date: string; end_date: string;
  status: 'predicted' | 'dismissed' | 'confirmed' | 'superseded'; confirmed_entry_id: string | null; updated_at: string;
};
export const phaseDurations = (phases: PhaseDates[]): PhaseLengths => Object.fromEntries(phases.map(p => [p.phase, daysBetween(p.start_date, p.end_date) + 1])) as PhaseLengths;
export function makePhasePlan(anchor: string, settings: Pick<CycleSettings, 'period_duration' | 'cycle_length' | 'luteal_length' | 'phase_lengths'>): PhasePlanDraft {
  const total = settings.cycle_length;
  const lengths = settings.phase_lengths ?? { menstruation: settings.period_duration, follicular: Math.max(1, total - settings.period_duration - settings.luteal_length - 1), ovulation: 3, luteal: Math.max(1, settings.luteal_length - 2) };
  let cursor = anchor;
  return { cycle_start_date: anchor, phases: PHASE_ORDER.map(phase => {
    const start_date = cursor, end_date = addDays(cursor, lengths[phase] - 1); cursor = addDays(end_date, 1);
    return { phase, start_date, end_date };
  }) };
}
export function validatePhasePlan(plan: PhasePlanDraft, useForFuture = false) {
  dateOnly(plan.cycle_start_date);
  if (plan.phases.length !== 4) throw new Error('Set all four phases.');
  let previousEnd: string | null = null;
  plan.phases.forEach((phase, i) => {
    dateOnly(phase.start_date); dateOnly(phase.end_date);
    if (phase.phase !== PHASE_ORDER[i] || phase.start_date < plan.cycle_start_date || phase.end_date < phase.start_date
      || (i === 0 && phase.start_date !== plan.cycle_start_date) || (previousEnd && phase.start_date <= previousEnd)
      || daysBetween(plan.cycle_start_date, phase.end_date) > 119) throw new Error('Use the four phases in order with no overlapping dates, within 120 days of the cycle start.');
    previousEnd = phase.end_date;
  });
  if (useForFuture) {
    const lengths = phaseDurations(plan.phases), sum = Object.values(lengths).reduce((a,b) => a+b,0);
    if (sum < 10 || sum > 120 || lengths.menstruation > 30) throw new Error('For future cycles use a 10–120 day total and a 1–30 day period.');
  }
}
export function resizePhase(plan: PhasePlanDraft, index: number, days: number): PhasePlanDraft {
  const phases = plan.phases.map(p => ({...p}));
  phases[index].end_date = addDays(phases[index].start_date, days - 1);
  for (let i = index + 1; i < phases.length; i++) {
    const duration = daysBetween(phases[i].start_date, phases[i].end_date) + 1;
    phases[i].start_date = addDays(phases[i-1].end_date, 1);
    phases[i].end_date = addDays(phases[i].start_date, duration - 1);
  }
  return {...plan, phases};
}
