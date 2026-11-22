import { DateTime } from 'luxon';
import type { PhasePlan, CyclePrediction, PhaseLengths } from './cyclePlanning';

export type PeriodEntry = { id: string; user_id: string; start_date: string; end_date: string | null; notes: string; updated_at: string };
export type CycleSettings = {
  auto_log_predictions: boolean; phase_lengths: PhaseLengths | null;
  user_id: string; cycle_length: number; period_duration: number; luteal_length: number;
  estimate_mode: 'history' | 'manual'; expected_next_date: string | null;
  override_anchor: string | null; missed_prediction_on: string | null; updated_at: string;
};
export type PeriodDraft = Pick<PeriodEntry, 'id' | 'start_date' | 'end_date' | 'notes'>;
export type CycleSnapshot = { ownerUserId: string; planningAvailable?: boolean; phasePlans?: PhasePlan[]; predictions?: CyclePrediction[]; entries: PeriodEntry[]; settings: CycleSettings | null };
export const DEFAULT_CYCLE = { auto_log_predictions: true, phase_lengths: null as PhaseLengths | null, cycle_length: 28, period_duration: 5, luteal_length: 14, estimate_mode: 'history' as const,
  expected_next_date: null, override_anchor: null, missed_prediction_on: null };
export const PHASES = {
  menstruation: { label: 'Menstruation', explanation: 'Bleeding days you record stay separate from calendar estimates.' },
  follicular: { label: 'Follicular', explanation: 'The follicular phase begins with menstruation; this view shows its estimated days after bleeding.' },
  ovulation: { label: 'Ovulation', explanation: 'A calendar estimate around a possible ovulation date. Ovulation has not been confirmed.' },
  luteal: { label: 'Luteal', explanation: 'The time after estimated ovulation, leading up to the next expected period.' },
} as const;
export type Phase = keyof typeof PHASES;
export const cycleToday = () => DateTime.now().setZone('Asia/Kuala_Lumpur').toISODate()!;
// Date-only arithmetic deliberately uses a fixed zone; never parse dates with new Date().
export function dateOnly(value: string) {
  const result = DateTime.fromISO(value, { zone: 'utc' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !result.isValid || result.toISODate() !== value || value < '1900-01-01' || value > '2199-12-31') throw new Error('Choose a valid date between 1900 and 2199.');
  return result;
}
export const addDays = (value: string, count: number) => dateOnly(value).plus({ days: count }).toISODate()!;
export const daysBetween = (start: string, end: string) => dateOnly(end).diff(dateOnly(start), 'days').days;
export const prettyDate = (value?: string | null) => value ? dateOnly(value).toFormat('LLL d, yyyy') : 'Not yet known';
export function validatePeriod(draft: PeriodDraft, entries: PeriodEntry[], today = cycleToday()) {
  dateOnly(draft.start_date);
  if (draft.start_date > today) throw new Error('Only log bleeding that has actually started. Use Override for a future prediction.');
  if (draft.end_date) {
    dateOnly(draft.end_date);
    if (draft.end_date < draft.start_date || draft.end_date > today || daysBetween(draft.start_date, draft.end_date) > 120) throw new Error('The end must be on or after the start, no later than today, and within 120 days.');
  }
  if (draft.notes.length > 2000) throw new Error('Keep notes within 2,000 characters.');
  if (entries.some(e => e.id !== draft.id && draft.start_date <= (e.end_date ?? '2199-12-31') && e.start_date <= (draft.end_date ?? '2199-12-31'))) throw new Error('These dates overlap another period. End or correct the earlier entry first.');
}
export function validateCycle(settings: Omit<CycleSettings, 'user_id' | 'updated_at'>) {
  for (const [value, min, max] of [[settings.cycle_length, 10, 120], [settings.period_duration, 1, 30], [settings.luteal_length, 5, 25]]) {
    if (!Number.isInteger(value) || value < min || value > max) throw new Error('Use whole days: cycle 10–120, period 1–30, luteal estimate 5–25.');
  }
  if (settings.period_duration >= settings.cycle_length || settings.luteal_length >= settings.cycle_length) throw new Error('Period duration and luteal estimate must each be shorter than your cycle.');
  if (settings.phase_lengths) {
    const values = ['menstruation','follicular','ovulation','luteal'].map(p => settings.phase_lengths![p as Phase]);
    if (values.some(v => !Number.isInteger(v) || v < 1 || v > 90) || values.reduce((a,b)=>a+b,0) !== settings.cycle_length || settings.phase_lengths.menstruation !== settings.period_duration || settings.estimate_mode !== 'manual') throw new Error('Custom phase durations must match the manual cycle total and period duration. Reset phase durations to use history.');
  }
  if (!['history', 'manual'].includes(settings.estimate_mode)) throw new Error('Choose a valid estimate source.');
  if (settings.expected_next_date) {
    dateOnly(settings.expected_next_date);
    if (!settings.override_anchor || settings.expected_next_date <= settings.override_anchor) throw new Error('The prediction must follow the latest recorded period start.');
  }
  if (settings.override_anchor) dateOnly(settings.override_anchor);
  if (settings.missed_prediction_on) dateOnly(settings.missed_prediction_on);
}
export function cycleModel(entries: PeriodEntry[], saved: CycleSettings | null, today = cycleToday(), phasePlans: PhasePlan[] = [], predictions: CyclePrediction[] = []) {
  const settings = { ...DEFAULT_CYCLE, ...saved };
  const records = [...entries].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const lengths = records.slice(1).map((e, i) => daysBetween(records[i].start_date, e.start_date));
  const recent = lengths.slice(-6);
  const enoughHistory = recent.length >= 2;
  const sorted = [...recent].sort((a, b) => a - b);
  const median = sorted.length ? Math.round((sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2) : null;
  const length = settings.estimate_mode === 'manual' ? settings.cycle_length : enoughHistory ? median : null;
  const latest = records.at(-1);
  const overrideActive = !!latest && settings.override_anchor === latest.start_date;
  const next = latest ? (overrideActive && settings.expected_next_date ? settings.expected_next_date : length ? addDays(latest.start_date, length) : null) : null;
  const missed = overrideActive ? settings.missed_prediction_on : null;
  const suppressed = (!!missed && (!next || next <= missed)) || predictions.some(p => p.anchor_start === latest?.start_date && p.start_date === next && p.status === 'dismissed');
  const overdue = !!next && next < today;
  const irregular = recent.length > 1 && Math.max(...recent) - Math.min(...recent) > 7;
  const source = settings.phase_lengths ? 'Manually configured phase durations' : overrideActive && settings.expected_next_date ? 'Manual prediction' : settings.estimate_mode === 'manual' ? 'Manually configured cycle length' : 'Median of recorded cycles (up to six)';
  const uncertainty = !latest ? 'Log a period to begin. Defaults are starting suggestions, not personal measurements.'
    : !length && !(overrideActive && settings.expected_next_date) ? 'Not enough history for a prediction. Record three period starts or choose a manually configured cycle length.'
    : irregular ? 'Your recorded cycles vary. Dates and phases are especially uncertain.' : 'Calendar estimates can shift; biological phase and ovulation are not confirmed.';
  type DayInfo = { phase: Phase | null; start: string | null; end: string | null; cycleDay: number | null; phaseDay: number | null; recorded: boolean; predicted: boolean; adjusted: boolean; ongoing: boolean; manual?: boolean; automatic?: boolean };
  function inspect(date: string): DayInfo {
    dateOnly(date);
    const anchor = records.filter(e => e.start_date <= date).at(-1);
    const empty: DayInfo = { phase: null, start: null, end: null, cycleDay: null, phaseDay: null, recorded: false, predicted: date > today, adjusted: false, ongoing: false };
    const manualPlan = [...phasePlans].filter(p => p.cycle_start_date <= date && (!anchor || p.cycle_start_date >= anchor.start_date)).sort((a,b) => b.cycle_start_date.localeCompare(a.cycle_start_date))[0];
    const manualPhase = manualPlan?.phases.find(p => p.start_date <= date && date <= p.end_date);
    const manualInfo = manualPhase ? { ...empty, phase: manualPhase.phase, start: manualPhase.start_date, end: manualPhase.end_date, cycleDay: daysBetween(anchor?.start_date ?? manualPlan!.cycle_start_date, date) + 1, phaseDay: daysBetween(manualPhase.start_date, date) + 1, predicted: true, adjusted: true, manual: true } : null;
    if (!anchor) return manualInfo ?? empty;
    const nextRecord = records.find(e => e.start_date > anchor.start_date);
    const isLatest = anchor.id === latest?.id;
    const adjusted = isLatest && overrideActive && !!(settings.expected_next_date || missed);
    const recorded = date <= today && date <= (anchor.end_date ?? today);
    const day = daysBetween(anchor.start_date, date) + 1;
    if (recorded) return { phase: 'menstruation', start: anchor.start_date, end: anchor.end_date, cycleDay: day, phaseDay: day, recorded: true, predicted: false, adjusted, ongoing: !anchor.end_date };
    if (manualInfo) return manualInfo;
    const automatic = settings.auto_log_predictions && records.length >= 3 && !suppressed ? predictions.find(p => p.status === 'predicted' && p.anchor_start === latest?.start_date && p.start_date <= date && date <= p.end_date) : null;
    if (automatic) return { ...empty, phase: 'menstruation', start: automatic.start_date, end: automatic.end_date, cycleDay: daysBetween(automatic.start_date,date)+1, phaseDay: daysBetween(automatic.start_date,date)+1, predicted: true, automatic: true };
    // A late/missed prediction never silently starts a new actual cycle or asserts a late biological phase.
    if (isLatest && (suppressed || overdue) && date >= today) return { ...empty, cycleDay: day, adjusted };
    let boundary = nextRecord?.start_date ?? (isLatest ? next : null);
    if (!boundary) return { ...empty, cycleDay: day, adjusted };
    let start = anchor.start_date;
    if (date >= boundary) {
      // Only project one upcoming period; never synthesize actual records or repeat forever.
      if (!isLatest || date < today || date >= addDays(boundary, settings.period_duration)) return { ...empty, cycleDay: day, adjusted };
      start = boundary;
      return { phase: 'menstruation', start, end: addDays(start, settings.period_duration - 1), cycleDay: daysBetween(start, date) + 1, phaseDay: daysBetween(start, date) + 1, recorded: false, predicted: true, adjusted, ongoing: false };
    }
    if (settings.phase_lengths) {
      let phaseStart = start;
      for (const phase of ['menstruation','follicular','ovulation','luteal'] as Phase[]) {
        const phaseEnd = addDays(phaseStart, settings.phase_lengths[phase] - 1);
        if (phaseStart <= date && date <= phaseEnd) return { ...empty, phase, start: phaseStart, end: phaseEnd, cycleDay: day, phaseDay: daysBetween(phaseStart,date)+1, predicted: true };
        phaseStart = addDays(phaseEnd,1);
      }
      return { ...empty, cycleDay: day };
    }
    const periodEnd = anchor.end_date ?? addDays(start, settings.period_duration - 1);
    const ovulation = addDays(boundary, -settings.luteal_length);
    const ovStart = addDays(ovulation, -1), ovEnd = addDays(ovulation, 1);
    if (periodEnd >= ovStart) return { ...empty, cycleDay: day, adjusted }; // Incompatible estimates: do not force phases.
    let phase: Phase, phaseStart: string, phaseEnd: string;
    if (date <= periodEnd) { phase = 'menstruation'; phaseStart = start; phaseEnd = periodEnd; }
    else if (date < ovStart) { phase = 'follicular'; phaseStart = addDays(periodEnd, 1); phaseEnd = addDays(ovStart, -1); }
    else if (date <= ovEnd) { phase = 'ovulation'; phaseStart = ovStart; phaseEnd = ovEnd; }
    else { phase = 'luteal'; phaseStart = addDays(ovEnd, 1); phaseEnd = addDays(boundary, -1); }
    return { phase, start: phaseStart, end: phaseEnd, cycleDay: day, phaseDay: daysBetween(phaseStart, date) + 1, recorded: false, predicted: true, adjusted, ongoing: false };
  }
  const current = inspect(today);
  const currentPlan = [...phasePlans].sort((a,b)=>b.cycle_start_date.localeCompare(a.cycle_start_date)).find(p => p.cycle_start_date <= today && p.phases.at(-1)!.end_date >= today && (!latest || p.cycle_start_date >= latest.start_date));
  const timelineStart = currentPlan?.cycle_start_date ?? (current.automatic ? current.start : latest?.start_date);
  const timelineDays = currentPlan ? daysBetween(currentPlan.cycle_start_date,currentPlan.phases.at(-1)!.end_date)+1
    : current.automatic && length ? Math.min(120,length)
    : latest && next && !suppressed && !overdue ? Math.min(120,daysBetween(latest.start_date,next)) : 0;
  return { settings, records, lengths, length, latest, next: suppressed ? null : next, nextEnd: next && !suppressed ? addDays(next, settings.period_duration - 1) : null,
    source, uncertainty, irregular, overdue, missed, overrideActive, current, inspect,
    ovulationWindow: !settings.phase_lengths && latest && next && !suppressed && !overdue && addDays(latest.end_date ?? addDays(latest.start_date, settings.period_duration - 1), 1) < addDays(next, -settings.luteal_length - 1)
      ? { start: addDays(next, -settings.luteal_length - 1), end: addDays(next, -settings.luteal_length + 1) } : null,
    daysRemaining: next ? daysBetween(today, next) : null,
    timeline: Array.from({ length: timelineDays }, (_, i) => ({ date: addDays(timelineStart!, i), ...inspect(addDays(timelineStart!, i)) })),
  };
}
