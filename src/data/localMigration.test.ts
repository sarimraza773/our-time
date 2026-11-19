import { describe, expect, it } from 'vitest';
import { EMPTY_SCHEDULE } from './calendarMapping';
import { markMigration, readLocalCalendar, shouldOfferImport } from './localMigration';
import { event, rule } from '../test/calendarFixtures';

const storage = (items: Record<string, unknown>) => ({ getItem: (key: string) => key in items ? JSON.stringify(items[key]) : null });
describe('safe device migration', () => {
  const local = readLocalCalendar(storage({ 'our-time.events': [event], 'our-time.rules': [rule] }));
  it('offers only for an empty cloud calendar, readable local data, and no prior decision or receipt', () => {
    expect(shouldOfferImport(EMPTY_SCHEDULE, local, null, null)).toBe(true);
    expect(shouldOfferImport({ ...EMPTY_SCHEDULE, events: [event] }, local, null, null)).toBe(false);
    expect(shouldOfferImport(EMPTY_SCHEDULE, local, 'imported', null)).toBe(false);
    expect(shouldOfferImport(EMPTY_SCHEDULE, local, 'fresh', null)).toBe(false);
    expect(shouldOfferImport(EMPTY_SCHEDULE, local, null, 'server-receipt')).toBe(false);
    expect(shouldOfferImport(EMPTY_SCHEDULE, readLocalCalendar(storage({})), null, null)).toBe(false);
  });
  it('leaves malformed data untouched and refuses partial import', () => {
    expect(readLocalCalendar({ getItem: () => '{broken' })).toMatchObject({ source: null, error: expect.any(String) });
    expect(readLocalCalendar(storage({ 'our-time.events': [event, {}] })).source).toBeNull();
    expect(readLocalCalendar(storage({ 'our-time.events': [event, event] })).source).toBeNull();
  });
  it('handles unavailable storage without crashing', () => {
    expect(readLocalCalendar({ getItem: () => { throw new Error('blocked'); } }).source).toBeNull();
    expect(markMigration({ setItem: () => { throw new Error('full'); } }, 'calendar', 'imported')).toBe(false);
  });
  it('preserves live overrides whose legacy rule was removed as standalone events', () => {
    const id = 'rule:removed:2026-08-26';
    const migrated = readLocalCalendar(storage({ 'our-time.overrides': { [id]: { ...event, id } } }));
    expect(migrated.source?.events[0]).toMatchObject({ title: event.title, isRecurring: false, id: `imported-${id}` });
    expect(migrated.source?.overrides).toEqual({});
  });
  it('preserves IDs for overrides and tombstones with an existing rule', () => {
    const id = `rule:${rule.id}:2026-08-26`;
    const source = readLocalCalendar(storage({ 'our-time.rules': [rule], 'our-time.overrides': { [id]: { ...event, id } }, 'our-time.hidden-instances': [id, id] })).source;
    expect(source?.hiddenInstanceIds).toEqual([id]);
    expect(source?.overrides[id].id).toBe(id);
  });
});
