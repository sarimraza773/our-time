import { copyFile, lstat, mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { checkPublicSource } from './check-public-source.mjs';

const root = process.cwd();
const files = [
  '.gitignore', '.env.example', '.github/workflows/deploy-pages.yml', 'index.html', 'package.json', 'package-lock.json',
  'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'vite.config.ts', 'GITHUB_PAGES.md', 'PERIOD_TRACKER.md',
  'scripts/check-public-source.mjs', 'scripts/check-public-source.test.mjs', 'scripts/prepare-github-source.mjs', 'scripts/verify-pages-build.mjs', 'scripts/preview-pages.mjs', 'scripts/verify-supabase.mjs',
  'public/favicon.svg', ...['botanical-frame.png','sticker-sammy.jpeg','sticker-rupert.jpeg','sticker-chadwick.jpeg','sticker-carlisle.jpeg'].map(name => `public/assets/${name}`),
  ...['202609260001_shared_calendar.sql','202610190001_photobooth.sql','202611170001_shared_diary.sql','202611210001_event_colors_and_repeats.sql','202611220001_custom_event_colors.sql','202611220002_private_period_tracker.sql'].map(name => `supabase/migrations/${name}`), 'supabase/verify-security.sql',
];
async function collect(directory) {
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error('Source export does not follow symbolic links.');
    if (entry.isDirectory()) await collect(file);
    else if (/\.(?:ts|tsx|css)$/.test(file) && file !== 'src/data/demo.ts') files.push(file);
    else if (file !== 'src/data/demo.ts') throw new Error(`Unexpected source file; review before exporting: ${file}`);
  }
}
await collect('src');
await checkPublicSource(root, files);
const output = resolve(root, 'outputs', `github-pages-source-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(resolve(root, 'outputs'), { recursive: true });
await mkdir(output, { recursive: false }); // Never overwrite or recursively delete an earlier candidate.
for (const file of files) {
  if (!(await lstat(resolve(root, file))).isFile()) throw new Error('Source export accepts only regular files.');
  await mkdir(dirname(resolve(output, file)), { recursive: true });
  await copyFile(resolve(root, file), resolve(output, file));
}
await writeFile(resolve(output, 'README.md'), '# Our Time\n\nExisting shared calendar, photobooth, bookshelf and diary for Deena and Sarim.\n\nSee [GITHUB_PAGES.md](GITHUB_PAGES.md) for the reviewed build, repository, GitHub Pages and Supabase setup. Deployment is manually triggered after approval. No personal calendar entries, diary records, photo memories, credentials, account-link SQL or local environment files are included.\n');
console.log(`Prepared ${files.length + 1} source files for review: ${output}`);
console.log('No Git repository was initialized, no remote repository was created, and nothing was committed, pushed or deployed. Review the source and decorative artwork before making it public.');
