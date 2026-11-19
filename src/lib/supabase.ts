import { createClient } from '@supabase/supabase-js';
import type { Database } from '../data/database';
import { publicSupabaseConfiguration } from './supabaseConfiguration';

let configurationError = '';
let client: ReturnType<typeof createClient<Database>> | null = null;
try {
  const { url, key } = publicSupabaseConfiguration(import.meta.env);
  client = createClient<Database>(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
} catch {
  configurationError = 'Cloud configuration is missing or invalid. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart the local app. See SUPABASE_CONNECTION.md for setup.';
}
export const supabase = client;
export const cloudConfigurationError = configurationError;
