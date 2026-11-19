import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../data/database';

export function createAuthService(client: SupabaseClient<Database>) {
  return {
    async signIn(email: string, password: string) {
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(error.message === 'Invalid login credentials'
        ? 'That email and password did not match. Please try again.' : 'We could not sign you in. Check your connection and account details, then try again.');
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw new Error('Sign out could not finish. Please reconnect and try again.');
    },
  };
}
