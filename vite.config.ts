import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { validatePublicBuildEnvironment } from './src/lib/supabaseConfiguration.ts';

export default defineConfig(({ command, mode }) => {
  const production = command === 'build' || mode === 'production';
  // A Pages deployment must never silently publish the missing-configuration card.
  // Local builds still support the existing setup screen without connecting remotely.
  if (command === 'build') {
    try {
      validatePublicBuildEnvironment(loadEnv(mode, process.cwd(), 'VITE_'), process.env.GITHUB_ACTIONS === 'true');
    } catch {
      throw new Error('Set VITE_SUPABASE_URL (HTTPS) and VITE_SUPABASE_PUBLISHABLE_KEY (public key only) in GitHub Actions repository variables. A legacy public VITE_SUPABASE_ANON_KEY is also supported. Never use database passwords or service-role/secret keys.');
    }
  }
  return {
    base: production ? '/our-time/' : '/',
    // The app is a static Supabase client. Pages needs no Sites/Worker runtime.
    plugins: [react()],
    server: { host: '127.0.0.1' },
    // Exported review copies must not be discovered as duplicate product tests.
    test: { exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**', 'outputs/**', 'work/**', 'qa/**'] },
  };
});
