// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicAsset } from './assets';
import { renderStrip } from './photobooth';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('GitHub Pages runtime image paths', () => {
  it('supports the development root and the repository subdirectory', () => {
    vi.stubEnv('BASE_URL', '/'); expect(publicAsset('/assets/botanical-frame.png')).toBe('/assets/botanical-frame.png');
    vi.stubEnv('BASE_URL', '/our-time/'); expect(publicAsset('assets/botanical-frame.png')).toBe('/our-time/assets/botanical-frame.png');
  });
  it('loads exported photobooth stickers from the repository subdirectory', async () => {
    vi.stubEnv('BASE_URL', '/our-time/'); const requested: string[] = [];
    vi.stubGlobal('Image', class {
      onload?: () => void;
      set src(value: string) { requested.push(value); queueMicrotask(() => this.onload?.()); }
    });
    const context = { fillRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn() };
    const canvas = { getContext: () => context } as unknown as HTMLCanvasElement;
    await renderStrip(canvas, [null, null, null], { title: 'Disposable test', frame: 'rose', created_at: '2026-11-18T00:00Z', stickers: [{ id: 'test', asset: 'sammy', x: .5, y: .5 }] });
    expect(requested).toEqual(['/our-time/assets/sticker-sammy.jpeg']); expect(context.drawImage).toHaveBeenCalledOnce();
  });
});
