import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarEvent, RecurringRule } from '../types';
import type { ScheduleSource } from '../lib/schedule';
import type { Database, Json, Snapshot } from './database';
import { eventToWrite, exceptionToWrite, ruleToWrite, type OwnerUsers } from './calendarMapping';
import { CalendarAccessError, CalendarRequestError } from '../lib/calendarErrors';

export { CalendarAccessError } from '../lib/calendarErrors';
function check(error: { code?: string } | null) { if (error) throw new Error('The calendar change was rejected. Refresh and retry, or ask the administrator to check access.'); }
export function createCalendarRepository(client: SupabaseClient<Database>) {
  return {
    async loadCalendar(): Promise<Snapshot> {
      const { data, error, status } = await client.rpc('load_shared_calendar');
      if (error) throw new CalendarRequestError(status, error.code);
      if (!data) throw new CalendarAccessError('Your account is not linked to our shared calendar. Ask the administrator to finish the two-account setup.');
      return data as unknown as Snapshot;
    },
    async createEvent(event: CalendarEvent, calendarId: string, users: OwnerUsers) {
      const { error } = await client.from('calendar_events').insert(eventToWrite(event, calendarId, users)); check(error);
    },
    async updateEvent(event: CalendarEvent, calendarId: string, users: OwnerUsers) {
      const { error } = await client.from('calendar_events').update(eventToWrite(event, calendarId, users)).eq('calendar_id', calendarId).eq('id', event.id).select('id').single(); check(error);
    },
    async deleteEvent(id: string, calendarId: string) {
      const { error } = await client.from('calendar_events').delete().eq('calendar_id', calendarId).eq('id', id); check(error);
    },
    async createRecurringRule(rule: RecurringRule, calendarId: string, users: OwnerUsers) {
      const { error } = await client.from('recurring_rules').insert(ruleToWrite(rule, calendarId, users)); check(error);
    },
    async updateRecurringRule(rule: RecurringRule, calendarId: string, users: OwnerUsers) {
      const { error } = await client.from('recurring_rules').update(ruleToWrite(rule, calendarId, users)).eq('calendar_id', calendarId).eq('id', rule.id).select('id').single(); check(error);
    },
    async deleteRecurringRule(id: string, calendarId: string) {
      const { error } = await client.from('recurring_rules').delete().eq('calendar_id', calendarId).eq('id', id); check(error);
    },
    async createRecurringException(id: string, replacement: CalendarEvent | null, calendarId: string, users: OwnerUsers) {
      const { error } = await client.from('recurring_exceptions').upsert(exceptionToWrite(id, replacement, calendarId, users), { onConflict: 'calendar_id,recurring_rule_id,occurrence_key' }); check(error);
    },
    async deleteRecurringException(id: string, calendarId: string, users: OwnerUsers) {
      const row = exceptionToWrite(id, null, calendarId, users);
      const { error } = await client.from('recurring_exceptions').delete().eq('calendar_id', calendarId).eq('recurring_rule_id', row.recurring_rule_id).eq('occurrence_key', row.occurrence_key); check(error);
    },
    async importLocalCalendar(source: ScheduleSource, calendarId: string, users: OwnerUsers) {
      const hidden = new Set(source.hiddenInstanceIds);
      const exceptions = [
        ...Object.entries(source.overrides).filter(([id]) => !hidden.has(id)).map(([id, event]) => exceptionToWrite(id, event, calendarId, users)),
        ...[...hidden].map(id => exceptionToWrite(id, null, calendarId, users)),
      ];
      const { error } = await client.rpc('import_local_calendar', {
        p_calendar_id: calendarId,
        p_events: source.events.map(event => eventToWrite(event, calendarId, users)) as unknown as Json,
        p_rules: source.rules.map(rule => ruleToWrite(rule, calendarId, users)) as unknown as Json,
        p_exceptions: exceptions as unknown as Json,
      }); check(error);
    },
    subscribeToCalendarChanges(calendarId: string, onChange: () => void, onStatus: (connected: boolean) => void) {
      // Private database broadcasts cover inserts, edits AND deletions without
      // exposing row identities to unrelated Postgres Changes subscribers.
      let active = true;
      const channel = client.channel(`calendar:${calendarId}`, { config: { private: true } })
        .on('broadcast', { event: 'calendar_changed' }, () => { if (active) onChange(); });
      void client.realtime.setAuth().then(() => {
        if (active) channel.subscribe(status => { if (active) onStatus(status === 'SUBSCRIBED'); });
      }).catch(() => { if (active) onStatus(false); });
      return () => { active = false; void client.removeChannel(channel); };
    },
  };
}
export type CalendarRepository = ReturnType<typeof createCalendarRepository>;
