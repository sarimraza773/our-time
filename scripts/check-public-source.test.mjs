import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkPublicSource } from './check-public-source.mjs';

const temporary = [];
afterEach(async () => {
  for (const directory of temporary.splice(0)) {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep) || !basename(directory).startsWith('our-time-source-check-')) throw new Error('Refusing cleanup outside the disposable test directory.');
    await rm(directory, { recursive: true, force: true });
  }
});
async function fixture(name, text) { const directory = await mkdtemp(join(tmpdir(), 'our-time-source-check-')); temporary.push(directory); await writeFile(join(directory, name), text); return directory; }
describe('public source preparation boundaries', () => {
  it('allows a blank example and rejects configured examples', async () => {
    const root = await fixture('.env.example', 'VITE_SUPABASE_URL=\nVITE_SUPABASE_PUBLISHABLE_KEY=\n');
    await expect(checkPublicSource(root, ['.env.example'])).resolves.toBeUndefined();
    await writeFile(join(root, '.env.example'), 'VITE_SUPABASE_URL=https://example.invalid');
    await expect(checkPublicSource(root, ['.env.example'])).rejects.toThrow(/blank/);
  });
  it.each(['.env.local','qa/private-photo.jpeg','outputs/diary.json','supabase/migrations/202611180001_link_two_users.sql','src/data/demo.ts','public/personal-photo.jpeg'])('refuses local artifacts and unreviewed data: %s', async file => {
    await expect(checkPublicSource(process.cwd(), [file])).rejects.toThrow();
  });
  it('refuses embedded secrets without putting their value in the error', async () => {
    const token = `sb_secret_${'x'.repeat(32)}`;
    const root = await fixture('example.ts', `const key = '${token}';`);
    await expect(checkPublicSource(root, ['example.ts'])).rejects.toThrow('Possible embedded credential in example.ts; review locally without printing its contents.');
  });
});
