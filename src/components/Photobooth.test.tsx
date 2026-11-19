// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Photobooth } from './Photobooth';
import type { MemoryRepository } from '../data/memoryRepository';
vi.mock('../lib/photobooth', async importOriginal => ({ ...await importOriginal<typeof import('../lib/photobooth')>(), renderStrip: vi.fn(async () => {}), normalizePhoto: vi.fn(async () => new Blob(['photo'], { type: 'image/jpeg' })), canvasBlob: vi.fn(async () => new Blob(['png'])), downloadBlob: vi.fn() }));
let repository: MemoryRepository; let getUserMedia: ReturnType<typeof vi.fn>; let stop: ReturnType<typeof vi.fn>;
beforeEach(() => {
  repository = { load: vi.fn(async () => []), save: vi.fn(async () => {}), subscribe: vi.fn(() => () => {}) };
  stop = vi.fn(); getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }] }));
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn(), translate: vi.fn(), scale: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,cGhvdG8=');
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 720 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 540 });
  Object.defineProperty(HTMLVideoElement.prototype, 'readyState', { configurable: true, get: () => 4 });
  URL.createObjectURL = vi.fn(() => 'blob:test'); URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
function mount() { const view = render(<Photobooth repository={repository} calendarId="calendar" userId="user" person="sarim" onClose={() => {}} />); fireEvent.click(screen.getByRole('button', { name: /Open photobooth/ })); return view; }
describe('photobooth privacy and capture lifecycle', () => {
  it('opens without camera permission and releases tracks and preview when unmounted', async () => {
    const view = mount(); expect(getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open Camera' }));
    await screen.findByRole('button', { name: 'Stop camera' });
    const video = screen.getByLabelText('Mirrored camera preview') as HTMLVideoElement;
    expect(video.srcObject).toBeTruthy(); view.unmount(); expect(stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull(); expect(repository.save).not.toHaveBeenCalled();
  });
  it('stops a camera permission request that resolves after close', async () => {
    let resolve!: (value: unknown) => void; getUserMedia.mockImplementation(() => new Promise(r => { resolve = r; }));
    const view = mount(); fireEvent.click(screen.getByRole('button', { name: 'Open Camera' })); view.unmount();
    await act(async () => resolve({ getTracks: () => [{ stop }] })); expect(stop).toHaveBeenCalledOnce();
  });
  it('offers upload after permission denial', async () => {
    getUserMedia.mockRejectedValue(new DOMException('Denied', 'NotAllowedError')); mount(); fireEvent.click(screen.getByRole('button', { name: 'Open Camera' }));
    await screen.findByText(/Camera permission was declined/); expect(screen.getByLabelText('Upload Photo')).toBeDefined();
  });
  it('cancels countdown on close without saving', async () => {
    const view = mount(); fireEvent.click(screen.getByRole('button', { name: 'Open Camera' })); await screen.findByRole('button', { name: 'Stop camera' });
    vi.useFakeTimers(); fireEvent.click(screen.getByRole('button', { name: 'Take 4 shots' }));
    expect(screen.getAllByRole('status').some(s => s.textContent === '3')).toBe(true); view.unmount(); await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(repository.save).not.toHaveBeenCalled(); expect(stop).toHaveBeenCalledOnce();
  });
  it('captures a three-shot sequence, supports retakes, and retains preview after a failed save', async () => {
    repository.save = vi.fn(async () => { throw new Error('Network unavailable'); });
    mount(); fireEvent.change(screen.getByLabelText('Shots'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open Camera' })); await screen.findByRole('button', { name: 'Stop camera' });
    vi.useFakeTimers(); fireEvent.click(screen.getByRole('button', { name: 'Take 3 shots' })); await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    expect(screen.getAllByAltText(/Shot [123]/)).toHaveLength(3); expect(repository.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retake shot 3' })); await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    fireEvent.click(screen.getByRole('button', { name: 'Save to Memories' })); await act(async () => {});
    expect(repository.save).toHaveBeenCalledOnce(); expect(screen.getByRole('alert').textContent).toContain('Network unavailable');
    expect(screen.getAllByAltText(/Shot [123]/)).toHaveLength(3);
  });
  it('rejects unsupported uploads without reading or sending them', () => {
    mount(); fireEvent.change(screen.getByLabelText('Upload Photo'), { target: { files: [new File(['<svg/>'], 'bad.svg', { type: 'image/svg+xml' })] } });
    expect(screen.getByRole('alert').textContent).toContain('JPEG, PNG or WebP'); expect(repository.save).not.toHaveBeenCalled();
  });
  it('uploads locally, offers movable keyboard stickers, and never saves without a click', async () => {
    mount(); fireEvent.change(screen.getByLabelText('Upload Photo'), { target: { files: [new File(['photo'], 'test.jpg', { type: 'image/jpeg' })] } });
    await screen.findByAltText('Shot 1'); expect(repository.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Add sammy sticker' }));
    const sticker = screen.getByRole('button', { name: /Move sammy sticker/ });
    fireEvent.keyDown(sticker, { key:'ArrowRight' }); expect(sticker.style.left).toBe('51%');
    fireEvent.keyDown(sticker, { key:'Delete' }); expect(screen.queryByRole('button', { name:/Move sammy sticker/ })).toBeNull();
  });
  it('takes and explicitly saves only two shots in Together mode', async () => {
    render(<Photobooth repository={repository} calendarId="calendar" userId="user" person="sarim" onClose={()=>{}} />);
    fireEvent.click(screen.getByRole('button', { name:/Start a Together Strip/ }));
    expect(screen.queryByLabelText('Shots')).toBeNull(); fireEvent.click(screen.getByRole('button', { name:'Open Camera' }));
    await screen.findByRole('button', { name:'Stop camera' }); vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name:'Take 2 shots' })); await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(repository.save).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name:'Save my two photos' })); await act(async () => {});
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ mode:'together',shot_count:4 }),'user',expect.any(Array));
    expect(vi.mocked(repository.save).mock.calls[0][2]).toHaveLength(2);
  });
});
