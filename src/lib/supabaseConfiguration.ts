type Environment = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
};

export function publicSupabaseConfiguration(environment: Environment) {
  const url = environment.VITE_SUPABASE_URL?.trim();
  const key = environment.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || environment.VITE_SUPABASE_ANON_KEY?.trim();
  // Error messages deliberately contain no configuration values.
  if (!url || !key) throw new Error('Supabase public configuration is missing');
  const parsed = new URL(url);
  if (parsed.username || parsed.password || (parsed.protocol !== 'https:' &&
    !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)))) {
    throw new Error('Supabase URL must use HTTPS or local HTTP');
  }
  if (!key.startsWith('sb_publishable_')) {
    // Legacy anon JWTs remain supported, but privileged JWTs must never reach a browser.
    const parts = key.split('.');
    if (parts.length !== 3) throw new Error('Use a public Supabase key');
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.role !== 'anon') throw new Error('Use a public Supabase key');
  }
  return { url, key };
}

// Vite can embed the entire VITE_ environment object, including an unused legacy
// key. Validate every supplied browser variable before emitting any production JS.
export function validatePublicBuildEnvironment(environment: Record<string, string>, required = false) {
  const allowed = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY'];
  if (Object.keys(environment).some(name => name.startsWith('VITE_') && !allowed.includes(name))) throw new Error('Only the approved public Supabase variables may enter this browser build.');
  const supplied = allowed.some(name => environment[name]?.trim());
  if (!required && !supplied) return;
  const config = publicSupabaseConfiguration(environment);
  for (const name of ['VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY']) {
    if (environment[name]?.trim()) publicSupabaseConfiguration({ VITE_SUPABASE_URL: config.url, VITE_SUPABASE_PUBLISHABLE_KEY: environment[name] });
  }
  if (required && !config.url.startsWith('https://')) throw new Error('The Pages build requires an HTTPS Supabase project URL.');
}
