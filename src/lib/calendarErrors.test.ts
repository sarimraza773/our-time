import { describe, expect, it, vi } from 'vitest';
import { CalendarRequestError, calendarLoadError } from './calendarErrors';
import { createCalendarRepository } from '../data/calendarRepository';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../data/database';

describe('safe calendar request diagnostics', () => {
  it.each([
    [404, 'PGRST202', 'migration history'],
    [403, '42501', 'membership'],
    [401, 'PGRST301', 'Sign out'],
    [0, '', 'connection'],
  ])('keeps status/code and actionable advice for %s/%s', (status, code, advice) => {
    const message = calendarLoadError(new CalendarRequestError(status, code));
    expect(message).toContain(advice);
    expect(message).toContain(status ? `HTTP ${status}` : 'network unavailable');
    if (code) expect(message).toContain(code);
  });

  it('preserves the RPC diagnostic without exposing server messages, hints, or row details', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, status: 403,
      error: { code: '42501', message: 'private SQL and credential', details: 'private diary text', hint: 'private account' } });
    const repository = createCalendarRepository({ rpc } as unknown as SupabaseClient<Database>);
    await expect(repository.loadCalendar()).rejects.toThrow('HTTP 403; code 42501');
    const error = await repository.loadCalendar().catch(e => e);
    expect(JSON.stringify(error) + error.message).not.toMatch(/private|credential/);
    expect(rpc).toHaveBeenCalledWith('load_shared_calendar');
  });

  it('does not echo arbitrary exception messages or invalid diagnostic codes', () => {
    expect(calendarLoadError(new Error('private token'))).not.toContain('private');
    expect(new CalendarRequestError(500, 'private token').message).not.toContain('private');
  });
});
