import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { createAuthService } from '../services/auth';

const authService = supabase ? createAuthService(supabase) : null;
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    let active = true, authChanged = false;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      authChanged = true;
      if (active) { setSession(next); setLoading(false); }
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authChanged) return;
      if (error) setError('We could not restore your session. Please sign in again.');
      setSession(data.session); setLoading(false);
    }).catch(() => { if (active && !authChanged) { setError('We could not restore your session. Please sign in again.'); setLoading(false); } });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  const perform = async (operation: () => Promise<void>) => {
    setPending(true); setError('');
    try { await operation(); } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setPending(false); }
  };
  return { session, loading, error, pending,
    signIn: (email: string, password: string) => perform(() => authService!.signIn(email, password)),
    signOut: () => perform(() => authService!.signOut()),
  };
}
