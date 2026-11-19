import { DateTime } from 'luxon';
import { CalendarAccessError } from '../lib/calendarErrors';
import type { CalendarEvent, OwnerId, RecurringRule } from '../types';
import type { ScheduleSource } from '../lib/schedule';
import type { EventContent, EventRow, EventWrite, ExceptionRow, ExceptionWrite, ProfileRow, RuleRow, RuleWrite, Snapshot } from './database';

export type OwnerUsers = Record<OwnerId, string>;
export const EMPTY_SCHEDULE: ScheduleSource = { events: [], rules: [], overrides: {}, hiddenInstanceIds: [] };
export function ownerUsers(profiles: ProfileRow[]): OwnerUsers {
  const deena = profiles.find(p => p.person_key === 'deena');
  const sarim = profiles.find(p => p.person_key === 'sarim');
  if (!deena || !sarim) throw new CalendarAccessError('Both calendar accounts need to be linked to the same calendar. Ask the administrator to finish the two-account setup.');
  return { deena: deena.id, sarim: sarim.id };
}
const utc = (value: string) => {
  const date = DateTime.fromISO(value, { setZone: true });
  if (!date.isValid) throw new Error('Please choose a valid event date and time.');
  return date.toUTC().toISO()!;
};
export function mapEventRow(row: EventRow): CalendarEvent {
  return { id: row.id, ownerId: row.owner_person_key, title: row.title, category: row.category,
    startUtc: utc(row.start_utc), endUtc: utc(row.end_utc), timezone: row.timezone, notes: row.notes,
    openToStudyTogether: row.open_to_study_together, isRecurring: false, editable: true,
    createdAt: utc(row.created_at), updatedAt: utc(row.updated_at) };
}
export function eventContent(event: CalendarEvent, users: OwnerUsers): EventContent {
  if (!users[event.ownerId]) throw new Error('This event owner is not a linked calendar member.');
  const start = utc(event.startUtc), end = utc(event.endUtc);
  if (end <= start) throw new Error('The event end must be after its start.');
  return { owner_user_id: users[event.ownerId], owner_person_key: event.ownerId, title: event.title,
    category: event.category, start_utc: start, end_utc: end, timezone: event.timezone, notes: event.notes,
    open_to_study_together: event.openToStudyTogether };
}
export function eventToWrite(event: CalendarEvent, calendarId: string, users: OwnerUsers): EventWrite {
  return { ...eventContent(event, users), id: event.id, calendar_id: calendarId };
}
export function mapRuleRow(row: RuleRow): RecurringRule {
  return { id: row.id, ownerId: row.owner_person_key, title: row.title, category: row.category,
    timezone: row.timezone, startTime: row.local_start_time.slice(0, 5), endTime: row.local_end_time.slice(0, 5),
    pattern: row.pattern, weekdays: row.weekdays, active: row.enabled, notes: row.notes,
    openToStudyTogether: row.open_to_study_together };
}
export function ruleToWrite(rule: RecurringRule, calendarId: string, users: OwnerUsers): RuleWrite {
  return { id: rule.id, calendar_id: calendarId, owner_user_id: users[rule.ownerId], owner_person_key: rule.ownerId,
    title: rule.title, category: rule.category, timezone: rule.timezone, local_start_time: rule.startTime,
    local_end_time: rule.endTime, pattern: rule.pattern, weekdays: rule.weekdays, enabled: rule.active,
    notes: rule.notes, open_to_study_together: rule.openToStudyTogether };
}
export function parseOccurrenceId(id: string) {
  const match = /^rule:(.+):(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (!match || !DateTime.fromISO(match[2]).isValid) throw new Error('This recurring occurrence has an invalid identity.');
  return { ruleId: match[1], localDate: match[2] };
}
export function exceptionToWrite(id: string, replacement: CalendarEvent | null, calendarId: string, users: OwnerUsers): ExceptionWrite {
  const { ruleId, localDate } = parseOccurrenceId(id);
  return { calendar_id: calendarId, recurring_rule_id: ruleId, occurrence_key: localDate,
    exception_type: replacement ? 'override' : 'deleted', replacement_event: replacement ? eventContent(replacement, users) : null };
}
export function mapExceptionRow(row: ExceptionRow) {
  const id = `rule:${row.recurring_rule_id}:${row.occurrence_key}`;
  if (row.exception_type === 'deleted') return { id, event: null };
  if (!row.replacement_event) throw new Error('The saved recurring exception is incomplete.');
  return { id, event: { ...mapEventRow({ ...row.replacement_event, id, calendar_id: row.calendar_id,
    created_at: row.created_at, updated_at: row.updated_at }), isRecurring: true, recurringRuleId: row.recurring_rule_id } };
}
/** A refetch replaces collections, never appends realtime payloads to them. */
export function mapSnapshot(snapshot: Snapshot): ScheduleSource {
  const unique = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map(row => [row.id, row])).values()];
  const overrides: Record<string, CalendarEvent> = {}, hidden = new Set<string>();
  const exceptions = new Map(snapshot.exceptions.map(row => [`${row.recurring_rule_id}:${row.occurrence_key}`, row]));
  for (const row of exceptions.values()) {
    const { id, event } = mapExceptionRow(row);
    if (event) overrides[id] = event; else hidden.add(id);
  }
  return { events: unique(snapshot.events).map(mapEventRow), rules: unique(snapshot.rules).map(mapRuleRow),
    overrides, hiddenInstanceIds: [...hidden] };
}
