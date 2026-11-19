import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = loadEnv('development', root, 'VITE_');
const url = env.VITE_SUPABASE_URL?.trim();
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || env.VITE_SUPABASE_ANON_KEY?.trim();

async function verify() {
  if (!url || !key) {
    console.log('PENDING: Fill VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in this copy\'s .env.local. No request sent.');
    process.exitCode = 2;
    return;
  }
  // Never print values, server response bodies, tokens or database rows.
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password || (parsed.protocol !== 'https:' &&
      !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)))) throw Error();
    if (!key.startsWith('sb_publishable_')) {
      const parts = key.split('.');
      if (parts.length !== 3 || JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))).role !== 'anon') throw Error();
    }
  } catch {
    console.log('INVALID: Use the HTTPS Project URL and a public publishable/anon key. No request sent.');
    process.exitCode = 2;
    return;
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(15000) }) },
  });
  const response = await fetch(new URL('auth/v1/settings', url.endsWith('/') ? url : `${url}/`), {
    headers: { apikey: key }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    console.log(`FAIL: Auth settings endpoint returned HTTP ${response.status}. Check project/key and reachability.`);
    process.exitCode = 1;
    return;
  }
  const settings = await response.json();
  console.log('PASS: Project Auth settings endpoint is reachable with the configured public key.');
  console.log(settings.disable_signup === true ? 'PASS: Public signup is disabled.' : 'CHECK: Confirm public signup is disabled in the dashboard.');
  if (settings.disable_signup === false) process.exitCode = 1;

  for (const table of ['profiles', 'shared_calendars', 'calendar_members', 'calendar_events', 'recurring_rules', 'recurring_exceptions', 'photo_memories', 'photo_contributions', 'bookshelf_titles', 'diary_entries']) {
    const { error, status } = await client.from(table).select('*').limit(1);
    if (error && [401, 403].includes(status)) {
      console.log(`PASS: Anonymous SELECT denied for ${table}.`);
    } else {
      const reason = error ? `HTTP ${status}; schema/configuration/network requires inspection` : 'anonymous SELECT unexpectedly succeeded; inspect grants/RLS even if empty';
      console.log(`FAIL: ${table}: ${reason}.`);
      process.exitCode = 1;
    }
  }
  const snapshot = await client.rpc('load_shared_calendar');
  if (snapshot.error && [401, 403].includes(snapshot.status)) console.log('PASS: Anonymous calendar snapshot denied.');
  else {
    console.log('FAIL: Anonymous snapshot did not produce the expected permission denial. Inspect migration/grants.');
    process.exitCode = 1;
  }
  const journal = await client.rpc('load_shared_journal', { p_calendar_id: '00000000-0000-0000-0000-000000000000' });
  if (journal.error && [401, 403].includes(journal.status)) console.log('PASS: Anonymous journal snapshot denied.');
  else {
    console.log('FAIL: Anonymous journal snapshot did not produce the expected permission denial. Inspect migration/grants.');
    process.exitCode = 1;
  }
  console.log('PENDING: Real Deena/Sarim sessions, outsider RLS, private Storage, shared diary CRUD and two-client Realtime checks. No data was written.');
}

await verify().catch(() => {
  console.log('FAIL: Verification could not complete. Check network access and project configuration. No response or credential values are logged.');
  process.exitCode = 1;
});
