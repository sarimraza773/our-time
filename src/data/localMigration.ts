import { DateTime } from 'luxon';
import type { CalendarEvent, RecurringRule } from '../types';
import type { ScheduleSource } from '../lib/schedule';
import { parseOccurrenceId } from './calendarMapping';
import { EVENT_COLORS } from '../lib/eventColors';

type StorageReader = Pick<Storage, 'getItem'>;
// Defer access to the storage property itself so blocked-storage getters are caught.
export const deviceStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
};
export type LocalCalendar = { source: ScheduleSource | null; error: string };
const categories = new Set(['class','study','sleep','friends','food','freeTime','personal','dateNight','call','sharedTime']);
const validBase = (v: CalendarEvent | RecurringRule) => v && typeof v.id === 'string' && !!v.id
  && ['deena', 'sarim'].includes(v.ownerId) && typeof v.title === 'string' && !!v.title.trim()
  && categories.has(v.category) && ['Asia/Kuala_Lumpur', 'America/New_York'].includes(v.timezone)
  && (v.color === undefined || Object.hasOwn(EVENT_COLORS, v.color))
  && typeof v.notes === 'string' && typeof v.openToStudyTogether === 'boolean';
const validEvent = (v: CalendarEvent) => validBase(v) && typeof v.startUtc === 'string' && typeof v.endUtc === 'string'
  && /(?:Z|[+-]\d{2}:\d{2})$/.test(v.startUtc) && /(?:Z|[+-]\d{2}:\d{2})$/.test(v.endUtc)
  && DateTime.fromISO(v.startUtc).isValid && DateTime.fromISO(v.endUtc) > DateTime.fromISO(v.startUtc);
const validDate = (date: string) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && DateTime.fromISO(date).isValid;
const validRule = (v: RecurringRule) => validBase(v) && typeof v.active === 'boolean'
  && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v.startTime) && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v.endTime)
  && (v.startDate
    ? validDate(v.startDate) && ['daily', 'weekly', 'monthly', 'yearly'].includes(v.pattern)
      && (!v.endDate || (validDate(v.endDate) && v.endDate >= v.startDate))
      && Number.isInteger(v.interval ?? 1) && (v.interval ?? 1) >= 1 && (v.interval ?? 1) <= 999
    : ['daily','weekdays','weekly','custom'].includes(v.pattern) && !v.endDate && (v.interval ?? 1) === 1)
  && Array.isArray(v.weekdays)
  && v.weekdays.every(d => Number.isInteger(d) && d >= 1 && d <= 7);

export function readLocalCalendar(storage: StorageReader): LocalCalendar {
  try {
    const read = (key: string, fallback: unknown) => {
      const raw = storage.getItem(key); return raw === null ? fallback : JSON.parse(raw);
    };
    const source: ScheduleSource = { events: read('our-time.events', []), rules: read('our-time.rules', []),
      overrides: read('our-time.overrides', {}), hiddenInstanceIds: read('our-time.hidden-instances', []) };
    if (!Array.isArray(source.events) || !source.events.every(validEvent) || !Array.isArray(source.rules) || !source.rules.every(validRule)
      || !source.overrides || typeof source.overrides !== 'object' || Array.isArray(source.overrides)
      || !Object.values(source.overrides).every(validEvent) || !Array.isArray(source.hiddenInstanceIds)) throw new Error('invalid');
    const ruleIds = new Set(source.rules.map(rule => rule.id));
    // Preserve visible orphaned overrides from older versions as standalone events.
    for (const [id, event] of Object.entries(source.overrides)) {
      const { ruleId } = parseOccurrenceId(id);
      if (event.id !== id) throw new Error('invalid identity');
      if (!ruleIds.has(ruleId)) {
        if (!source.hiddenInstanceIds.includes(id)) source.events.push({ ...event, id: `imported-${id}`, isRecurring: false, recurringRuleId: undefined, recurrenceRule: undefined });
        delete source.overrides[id];
      }
    }
    source.hiddenInstanceIds = [...new Set(source.hiddenInstanceIds)].filter(id => ruleIds.has(parseOccurrenceId(id).ruleId));
    if (new Set(source.events.map(e => e.id)).size !== source.events.length || new Set(source.rules.map(r => r.id)).size !== source.rules.length) throw new Error('duplicate IDs');
    return { source: hasScheduleData(source) ? source : null, error: '' };
  } catch {
    return { source: null, error: 'The calendar saved on this device could not be read safely. It has been left untouched.' };
  }
}
export function hasScheduleData(source: ScheduleSource) {
  return !!(source.events.length || source.rules.length || Object.keys(source.overrides).length || source.hiddenInstanceIds.length);
}
export const migrationKey = (calendarId: string) => `our-time.cloud-migration.v1:${calendarId}`;
export function shouldOfferImport(source: ScheduleSource, local: LocalCalendar, marker: string | null, serverReceipt: string | null) {
  return !hasScheduleData(source) && !!local.source && !marker && !serverReceipt;
}
export function migrationMarker(storage: StorageReader, calendarId: string) {
  try { return storage.getItem(migrationKey(calendarId)); } catch { return null; }
}
export function markMigration(storage: Pick<Storage, 'setItem'>, calendarId: string, choice: 'imported' | 'fresh') {
  try { storage.setItem(migrationKey(calendarId), choice); return true; } catch { return false; }
}
