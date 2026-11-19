// Vite replaces BASE_URL at build time. Use this for runtime images/canvas loads;
// static CSS url() references are rebased by Vite itself.
export function publicAsset(path: string, base = import.meta.env.BASE_URL) {
  return `${base}${path.replace(/^\/+/, '')}`;
}
