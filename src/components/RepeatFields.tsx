import { DateTime } from 'luxon';
import type { RepeatFrequency } from '../types';

export const FREQUENCIES = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' } as const;
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const UNITS = { daily: 'day(s)', weekly: 'week(s)', monthly: 'month(s)', yearly: 'year(s)' };

export type RepeatChoice = RepeatFrequency | 'none' | 'custom';
export type CustomRepeat = { frequency: RepeatFrequency; interval: number; weekdays: number[]; endDate: string };
export const DEFAULT_CUSTOM: CustomRepeat = { frequency: 'weekly', interval: 1, weekdays: [], endDate: '' };

export function WeekdayPicker({ days, onChange, requireDay = false }: { days: number[]; onChange: (days: number[]) => void; requireDay?: boolean }) {
  return <fieldset className="weekday-picker"><legend>Days</legend>
    {WEEKDAYS.map((label, index) => {
      const day = index + 1;
      const selected = days.includes(day);
      return <button key={day} type="button" aria-label={label} aria-pressed={selected} className={selected ? 'selected' : ''}
        disabled={requireDay && selected && days.length === 1}
        onClick={() => onChange(selected ? days.filter(value => value !== day) : [...days, day].sort())}>{label[0]}</button>;
    })}
  </fieldset>;
}

export function RepeatFields({ choice, onChoose, custom, onCustom, date, oneTime = false }: {
  choice: RepeatChoice; onChoose: (choice: RepeatChoice) => void; custom: CustomRepeat; onCustom: (custom: CustomRepeat) => void;
  date: string; oneTime?: boolean;
}) {
  const weekday = DateTime.fromISO(date).weekday;
  return <>
    <label>Repeat<select value={choice} onChange={event => onChoose(event.target.value as RepeatChoice)}>
      {oneTime && <option value="none">Does not repeat</option>}
      {Object.entries(FREQUENCIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      <option value="custom">Custom</option>
    </select></label>
    {choice === 'custom' && <>
      <div className="field-pair">
        <label>Repeat every<input type="number" min="1" max="999" step="1" required value={custom.interval || ''}
          onChange={event => onCustom({ ...custom, interval: Number(event.target.value) })} /></label>
        <label>Frequency<select value={custom.frequency} onChange={event => onCustom({ ...custom, frequency: event.target.value as RepeatFrequency })}>
          {Object.entries(UNITS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      </div>
      {custom.frequency === 'weekly' && <WeekdayPicker days={custom.weekdays.length || !weekday ? custom.weekdays : [weekday]}
        onChange={weekdays => onCustom({ ...custom, weekdays })} requireDay />}
      {(custom.frequency === 'monthly' || custom.frequency === 'yearly') && <p className="repeat-hint">The start date sets the day of the month for each occurrence.</p>}
      <label>Ends on (optional)<input type="date" min={date || undefined} value={custom.endDate}
        onChange={event => onCustom({ ...custom, endDate: event.target.value })} /></label>
    </>}
  </>;
}

export function repeatSettings(choice: Exclude<RepeatChoice, 'none'>, custom: CustomRepeat, startDate: string) {
  const pattern = choice === 'custom' ? custom.frequency : choice;
  return {
    pattern, startDate,
    weekdays: choice === 'custom' && pattern === 'weekly' ? custom.weekdays : [],
    interval: choice === 'custom' ? custom.interval : 1,
    endDate: choice === 'custom' ? custom.endDate || undefined : undefined,
  };
}
