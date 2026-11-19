import { execFileSync } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const publicFiles = new Set(['public/favicon.svg', ...['botanical-frame.png','sticker-sammy.jpeg','sticker-rupert.jpeg','sticker-chadwick.jpeg','sticker-carlisle.jpeg'].map(name => `public/assets/${name}`)]);
export async function checkPublicSource(root, files) {
  for (const file of files) {
    if (file.includes('\\') || file.startsWith('/') || file.split('/').includes('..')) throw new Error('Invalid source path.');
    if (/(^|\/)(?:\.env[^/]*|node_modules|dist|outputs|work|qa|\.openai|\.idea|\.temp|\.branches)(\/|$)/.test(file) && file !== '.env.example') throw new Error(`Private/local file is not allowed in public source: ${file}`);
    if (/CONSOLIDATION\.json$|src\/data\/demo\.ts$|_link_two_users\.sql$|_safe\.sql$|\.(?:pem|key|p12|pfx|dump|backup)$/i.test(file)) throw new Error(`Local data/setup file is not allowed in public source: ${file}`);
    if (file.startsWith('public/') && !publicFiles.has(file)) throw new Error(`Review new public media before publishing: ${file}`);
    const target = resolve(root, file);
    if (!target.startsWith(resolve(root) + sep) || (await lstat(target)).isSymbolicLink()) throw new Error('Source paths must be regular files inside the repository.');
    if (publicFiles.has(file) && !file.endsWith('.svg')) continue;
    const content = await readFile(target, 'utf8');
    if (file === '.env.example' && content.split(/\r?\n/).some(line => /^\s*VITE_[A-Z_]+\s*=\s*\S/.test(line))) throw new Error('.env.example must have blank configuration values.');
    if (/sb_(?:secret|publishable)_[A-Za-z0-9_-]{25,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|postgres(?:ql)?:\/\/[^\s"'`]+:[^\s"'`]+@|\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+/.test(content)) throw new Error(`Possible embedded credential in ${file}; review locally without printing its contents.`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.cwd();
  const git = (...args) => execFileSync('git', ['-c', `safe.directory=${root}`, ...args], { cwd: root, encoding: 'utf8' }).trimEnd();
  if (resolve(git('rev-parse', '--show-toplevel')).toLowerCase() !== resolve(root).toLowerCase()) throw new Error('Run this check at the new our-time repository root, not the preserved parent repository. Use npm run prepare:github first.');
  const files = git('ls-files', '-z').split('\0').filter(Boolean);
  if (!files.length) throw new Error('No tracked source files to check. Stage only the reviewed source export first.');
  await checkPublicSource(root, files);
  console.log(`PASS: ${files.length} tracked files checked for local artifacts, unreviewed media and common embedded credentials. Manual source review is still required.`);
}
