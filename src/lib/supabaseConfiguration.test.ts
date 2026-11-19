import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { publicSupabaseConfiguration as config, validatePublicBuildEnvironment } from './supabaseConfiguration';

const url = 'https://our-time-test.supabase.co';
const jwt = (role: string) => `header.${btoa(JSON.stringify({ role }))}.signature`;

describe('public Supabase configuration', () => {
  it('accepts and trims the publishable variable, preferring it over the legacy variable', () => {
    expect(config({ VITE_SUPABASE_URL: ` ${url} `, VITE_SUPABASE_PUBLISHABLE_KEY: ' sb_publishable_test ', VITE_SUPABASE_ANON_KEY: jwt('service_role') }))
      .toEqual({ url, key: 'sb_publishable_test' });
  });
  it('supports the existing public anon variable', () => {
    expect(config({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: jwt('anon') }).key).toBe(jwt('anon'));
  });
  it.each(['sb_secret_private', jwt('service_role'), jwt('authenticated'), 'invalid'])('rejects a private or invalid key without echoing it (%#)', key => {
    expect(() => config({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key })).toThrow('Use a public Supabase key');
  });
  it('rejects missing values and remote HTTP, while allowing localhost development', () => {
    expect(() => config({})).toThrow('missing');
    expect(() => config({ VITE_SUPABASE_URL: 'http://example.com', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' })).toThrow('HTTPS');
    expect(config({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }).url).toContain('127.0.0.1');
  });
});

describe('production browser environment boundary', () => {
  it('reads the exact variable names supplied by the GitHub Pages workflow, with either public-key format', () => {
    const workflow = readFileSync(new URL('../../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');
    const bindings = [...workflow.matchAll(/(VITE_SUPABASE_\w+):\s*\$\{\{ vars\.(VITE_SUPABASE_\w+) \}\}/g)];
    expect(bindings.map(match => [match[1], match[2]])).toEqual([
      ['VITE_SUPABASE_URL', 'VITE_SUPABASE_URL'],
      ['VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
      ['VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'],
    ]);
    for (const name of ['VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY']) {
      const environment = Object.fromEntries(bindings.map(match => [match[1], match[1] === 'VITE_SUPABASE_URL' ? url : match[1] === name ? (name.endsWith('ANON_KEY') ? jwt('anon') : 'sb_publishable_test') : '']));
      expect(() => validatePublicBuildEnvironment(environment, true)).not.toThrow();
      expect(config(environment).key).toBe(environment[name]);
    }
  });
  it('allows a local setup-screen build but requires configuration in Pages CI', () => {
    expect(() => validatePublicBuildEnvironment({})).not.toThrow();
    expect(() => validatePublicBuildEnvironment({}, true)).toThrow(/missing/);
    expect(() => validatePublicBuildEnvironment({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }, true)).not.toThrow();
  });
  it('rejects a privileged legacy key even if the valid preferred key would hide it at runtime', () => {
    expect(() => validatePublicBuildEnvironment({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', VITE_SUPABASE_ANON_KEY: jwt('service_role') }, true)).toThrow(/public Supabase key/);
  });
  it('rejects accidental private VITE variables without echoing their values', () => {
    expect(() => validatePublicBuildEnvironment({ VITE_DATABASE_PASSWORD: 'disposable-value' })).toThrow('Only the approved public Supabase variables');
  });
  it('requires HTTPS for a deployed build', () => {
    expect(() => validatePublicBuildEnvironment({ VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }, true)).toThrow(/HTTPS/);
  });
});
