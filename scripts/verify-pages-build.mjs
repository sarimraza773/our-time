import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const root = process.cwd(), dist = resolve(root, 'dist'), base = '/our-time/';
function ensure(condition, message) { if (!condition) throw new Error(message); }
const html = await readFile(resolve(dist, 'index.html'), 'utf8');
async function checkUrl(url) {
  if (url.startsWith('data:') || url.startsWith('#')) return;
  ensure(url.startsWith(base), 'Build contains an asset URL outside /our-time/.');
  const target = resolve(dist, decodeURIComponent(url.slice(base.length).split(/[?#]/)[0]));
  ensure(target.startsWith(dist + sep), 'Build contains an invalid asset path.');
  ensure((await stat(target)).isFile(), 'Build references a missing asset.');
}
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) await checkUrl(match[1]);
const assets = await readdir(resolve(dist, 'assets'));
for (const file of assets.filter(name => name.endsWith('.css'))) {
  const css = await readFile(resolve(dist, 'assets', file), 'utf8');
  for (const match of css.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) await checkUrl(match[1]);
}
let applicationJs = '';
for (const file of assets.filter(name => name.endsWith('.js'))) {
  const js = await readFile(resolve(dist, 'assets', file), 'utf8');
  applicationJs += js;
  ensure(!/["'`]\/assets\//.test(js), 'Runtime JavaScript contains an unprefixed /assets/ URL.');
  ensure(!js.includes('LOCAL QA FIXTURE') && !js.includes('our-time-disposable-journal-qa') && !js.includes('Synthetic local QA'), 'QA fixture leaked into the production build.');
}
for (const control of ['Recurring event', 'Event Color', 'Custom color', 'Period Tracker', 'All 24 hours', 'Set phases', 'Automatic predicted period log']) {
  ensure(applicationJs.includes(control), `Production bundle is missing required control: ${control}`);
}
const artwork = ['botanical-frame.png', 'sticker-sammy.jpeg', 'sticker-rupert.jpeg', 'sticker-chadwick.jpeg', 'sticker-carlisle.jpeg'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const file of artwork) {
  ensure(hash(await readFile(resolve(root, 'public/assets', file))) === hash(await readFile(resolve(dist, 'assets', file))), 'A decorative asset is missing or changed in the build.');
}
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    ensure(!entry.isSymbolicLink(), 'Static artifact must not contain links.');
    const name = relative(dist, resolve(directory, entry.name)).split(sep).join('/');
    ensure(!/(^|\/)(?:\.env[^/]*|server|qa|work|supabase|\.git|\.openai)(\/|$)/.test(name), 'Static artifact contains non-public files.');
    if (entry.isDirectory()) await inspect(resolve(directory, entry.name));
  }
}
await inspect(dist);
await writeFile(resolve(dist, '.nojekyll'), '');
console.log(`PASS: /our-time/ HTML, CSS and JavaScript URLs; ${artwork.length} unchanged decorative assets; static-only artifact. Fonts use the existing system font stacks.`);
