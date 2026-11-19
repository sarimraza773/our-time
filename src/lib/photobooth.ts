import type { OwnerId } from '../types';
import { publicAsset } from './assets';

export const filters = { Original: 'none', Warm: 'sepia(.3) saturate(1.15)', 'Black & white': 'grayscale(1)', 'Faded film': 'sepia(.2) contrast(.8) brightness(1.1)', 'Soft pink': 'sepia(.2) hue-rotate(310deg) saturate(.8)' };
export type Filter = keyof typeof filters;
export const stickerAssets = ['sammy', 'rupert', 'chadwick', 'carlisle'] as const;
export type StickerPlacement = { id: string; asset: typeof stickerAssets[number]; x: number; y: number };
export type Memory = { id: string; calendar_id: string; title: string; mode: 'solo' | 'together'; shot_count: number; frame: 'rose' | 'blue' | 'cream'; stickers: StickerPlacement[]; created_at: string };
export type Contribution = { memory_id: string; calendar_id: string; user_id: string; person_key: OwnerId; paths: string[] };
export type MemoryView = Memory & { contributions: Contribution[]; photos: (string | null)[] };
export function arrangePhotos(memory: Pick<Memory, 'mode' | 'shot_count'>, contributions: { person_key: OwnerId; photos: string[] }[]): (string | null)[] {
  if (memory.mode === 'solo') return Array.from({ length: memory.shot_count }, (_, i) => contributions[0]?.photos[i] ?? null);
  const deena = contributions.find(c => c.person_key === 'deena')?.photos ?? [];
  const sarim = contributions.find(c => c.person_key === 'sarim')?.photos ?? [];
  return [deena[0] ?? null, sarim[0] ?? null, deena[1] ?? null, sarim[1] ?? null];
}
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('This photo could not be opened. Try a JPEG, PNG or WebP image.')); image.src = src; });
}
export function cover(ctx: CanvasRenderingContext2D, image: CanvasImageSource, iw: number, ih: number, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / iw, h / ih); const sw = w / scale, sh = h / scale;
  ctx.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}
export function canvasBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the photo.')), type, .9));
}
export async function normalizePhoto(src: string, filter: Filter): Promise<Blob> {
  const image = await loadImage(src); const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 540;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas is unavailable on this device.');
  ctx.filter = filters[filter]; cover(ctx, image, image.naturalWidth, image.naturalHeight, 0, 0, 720, 540);
  return canvasBlob(canvas, 'image/jpeg');
}
export function stripHeight(count: number) { return 150 + count * 330; }
export async function renderStrip(canvas: HTMLCanvasElement, photos: (string | null)[], memory: Pick<Memory, 'title' | 'frame' | 'stickers' | 'created_at'>, filter: Filter | Filter[] = 'Original') {
  canvas.width = 480; canvas.height = stripHeight(photos.length);
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas is unavailable on this device.');
  ctx.fillStyle = memory.frame === 'rose' ? '#f6dce1' : memory.frame === 'blue' ? '#dce7ed' : '#f6efdf'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < photos.length; i++) {
    const y = 24 + i * 330; ctx.fillStyle = '#ece3d5'; ctx.fillRect(24, y, 432, 306);
    if (photos[i]) { const image = await loadImage(photos[i]!); ctx.filter = filters[Array.isArray(filter) ? filter[i] : filter]; cover(ctx, image, image.naturalWidth, image.naturalHeight, 24, y, 432, 306); ctx.filter = 'none'; }
    else { ctx.fillStyle = '#805f66'; ctx.font = '20px Georgia'; ctx.textAlign = 'center'; ctx.fillText('A little space for you ♥', 240, y + 160); }
  }
  ctx.fillStyle = '#68434e'; ctx.textAlign = 'center'; ctx.font = '26px Georgia'; ctx.fillText(memory.title || 'Our little moments', 240, canvas.height - 77, 420);
  ctx.font = '17px Georgia'; ctx.fillText(new Date(memory.created_at).toLocaleDateString() + ' · Our Time', 240, canvas.height - 40);
  for (const sticker of memory.stickers) { const image = await loadImage(publicAsset(`assets/sticker-${sticker.asset}.jpeg`)); ctx.drawImage(image, sticker.x * 480 - 35, sticker.y * canvas.height - 35, 70, 70); }
}
export function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
