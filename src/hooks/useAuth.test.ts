// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { users } from '../test/calendarFixtures';

const mock = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(), unsubscribe: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { auth: mock } }));
import { useAuth } from './useAuth';
let onAuth: (event: string, session: Session | null) => void;
const session = { user: { id: users.sarim }, access_token: 'test-token' } as Session;
beforeEach(() => {
  vi.clearAllMocks();
  mock.onAuthStateChange.mockImplementation(callback => { onAuth = callback; return { data: { subscription: { unsubscribe: mock.unsubscribe } } }; });
  mock.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mock.signInWithPassword.mockResolvedValue({ error: null }); mock.signOut.mockResolvedValue({ error: null });
});
afterEach(cleanup);
describe('Supabase authentication boundary', () => {
  it('shows initialization until session restoration and keeps the authenticated UUID', async () => {
    let restore!: (value: unknown) => void;
    mock.getSession.mockImplementation(() => new Promise(resolve => { restore = resolve; }));
    const view = renderHook(useAuth);
    expect(view.result.current.loading).toBe(true);
    await act(async () => { restore({ data: { session }, error: null }); });
    expect(view.result.current.loading).toBe(false); expect(view.result.current.session?.user.id).toBe(users.sarim);
    view.unmount(); expect(mock.unsubscribe).toHaveBeenCalledOnce();
  });
  it('does not overwrite a newer signed-out event with an old restoration result', async () => {
    let restore!: (value: unknown) => void;
    mock.getSession.mockImplementation(() => new Promise(resolve => { restore = resolve; }));
    const view = renderHook(useAuth);
    act(() => onAuth('SIGNED_OUT', null));
    await act(async () => { restore({ data: { session }, error: null }); });
    expect(view.result.current.session).toBeNull();
  });
  it('uses password auth, handles credentials errors, then responds to sign-in and sign-out events', async () => {
    const view = renderHook(useAuth);
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    mock.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
    await act(async () => { await view.result.current.signIn(' sarim@example.test ', 'test-password'); });
    expect(mock.signInWithPassword).toHaveBeenCalledWith({ email: 'sarim@example.test', password: 'test-password' });
    expect(view.result.current.error).toContain('did not match');
    act(() => onAuth('SIGNED_IN', session));
    expect(view.result.current.session?.user.id).toBe(users.sarim);
    await act(async () => { await view.result.current.signOut(); });
    expect(mock.signOut).toHaveBeenCalledWith({ scope: 'local' });
    act(() => onAuth('SIGNED_OUT', null)); expect(view.result.current.session).toBeNull();
  });
  it('reports sign-out failure without pretending the session ended', async () => {
    const view = renderHook(useAuth); act(() => onAuth('SIGNED_IN', session));
    mock.signOut.mockResolvedValueOnce({ error: { message: 'offline' } });
    await act(async () => { await view.result.current.signOut(); });
    expect(view.result.current.session).toBe(session); expect(view.result.current.error).toContain('could not finish');
  });
});
