import type { CalendarEvent, RecurringRule } from '../types';
import type { Snapshot } from '../data/database';
export const users = { deena: '00000000-0000-4000-8000-000000000001', sarim: '00000000-0000-4000-8000-000000000002' };
export const outsider = '00000000-0000-4000-8000-000000000003';
export const calendarId = '00000000-0000-4000-8000-000000000010';
export const stamp = '2026-08-26T00:00:00.000Z';
export const event: CalendarEvent = { id: 'local-event', ownerId: 'sarim', title: 'Cloud class', category: 'class',
  startUtc: '2026-08-26T14:00:00.000Z', endUtc: '2026-08-26T15:00:00.000Z', timezone: 'America/New_York',
  notes: 'Bring a book', openToStudyTogether: false, isRecurring: false, editable: true, createdAt: stamp, updatedAt: stamp };
export const rule: RecurringRule = { id: 'legacy-rule', ownerId: 'sarim', title: 'Weekly class', category: 'class', timezone: 'America/New_York',
  startTime: '10:00', endTime: '11:00', pattern: 'weekly', weekdays: [1], active: true, notes: '', openToStudyTogether: false };
export const emptySnapshot = (): Snapshot => ({ calendar: { id: calendarId, name: 'Our Time', created_at: stamp, local_import_completed_at: null },
  profiles: [ { id: users.deena, person_key: 'deena', display_name: 'Deena', timezone: 'Asia/Kuala_Lumpur', created_at: stamp },
    { id: users.sarim, person_key: 'sarim', display_name: 'Sarim', timezone: 'America/New_York', created_at: stamp } ], events: [], rules: [], exceptions: [] });
