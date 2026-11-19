import { useEffect, useRef, useState } from 'react';
import type { OwnerId } from '../types';
import type { MemoryRepository } from '../data/memoryRepository';
import { useMemories } from '../hooks/useMemories';
import { canvasBlob, cover, downloadBlob, filters, normalizePhoto, renderStrip, stickerAssets, stripHeight, type Filter, type Memory, type MemoryView, type StickerPlacement } from '../lib/photobooth';
import './photobooth.css';
import { publicAsset } from '../lib/assets';

export function Photobooth({ repository, calendarId, userId, person, onClose }: { repository: MemoryRepository; calendarId: string; userId: string; person: OwnerId; onClose: () => void }) {
  const library = useMemories(repository, calendarId);
  const [session, setSession] = useState<{ memory?: MemoryView; together: boolean } | null>(null);
  const root = useRef<HTMLDivElement>(null); const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement; close.current?.focus();
    const oldOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose(); }
      if (e.key === 'Tab') {
        const nodes = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? []).filter(el => el.getClientRects().length);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    root.current?.addEventListener('keydown', key);
    const node = root.current;
    return () => { node?.removeEventListener('keydown', key); document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, [onClose]);
  return <div className="booth-backdrop" ref={root}><section className="booth-paper" role="dialog" aria-modal="true" aria-labelledby="booth-title">
    <header className="booth-heading"><div><p className="eyebrow">A little corner of our world</p><h2 id="booth-title">{session ? 'Our photobooth' : 'Our memories'}</h2></div><button ref={close} className="paper-button" onClick={onClose}>Close ✕</button></header>
    {session ? session.memory && !library.memories.some(m => m.id === session.memory!.id) ? <><p role="alert">This shared strip is unavailable. Reconnect and refresh Memories before continuing.</p><button className="paper-button" onClick={() => setSession(null)}>Back to Memories</button></> : <BoothSession key={session.memory?.id ?? String(session.together)} repository={repository} calendarId={calendarId} userId={userId} person={person} existing={session.memory ? library.memories.find(m => m.id === session.memory!.id) : undefined} together={session.together}
      onBack={() => { setSession(null); library.refresh(); }} onSaved={() => { setSession(null); library.refresh(); }} /> : <>
      <p>Little moments, pressed between the pages. Just for Deena &amp; Sarim.</p>
      <div className="booth-actions"><button className="paper-button primary" onClick={() => setSession({ together: false })}>▣ Open photobooth</button><button className="paper-button" onClick={() => setSession({ together: true })}>♥ Start a Together Strip</button><button className="paper-button" onClick={library.refresh}>Refresh memories</button></div>
      <p className="booth-note" role="status">{library.loading ? 'Opening our scrapbook…' : library.connected ? 'Connected · private memories' : 'Connection interrupted · refresh to reconnect'}</p>
      {library.error && <p role="alert">{library.error} Apply the photobooth migration if this is the first visit.</p>}
      {!library.loading && !library.error && library.memories.length === 0 && <div className="scrapbook-empty">✿<h3>Room for our first little moment</h3><p>Take a strip today, or leave two frames for each other.</p></div>}
      <div className="scrapbook-grid">{library.memories.map(memory => <MemoryCard key={memory.id} memory={memory} person={person} onJoin={() => setSession({ memory, together: true })} />)}</div>
    </>}
  </section></div>;
}

function MemoryCard({ memory, person, onJoin }: { memory: MemoryView; person: OwnerId; onJoin: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null); const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => { let valid = true; setReady(false); setError(''); const staging = document.createElement('canvas'); void renderStrip(staging, memory.photos, memory).then(() => { if (valid && canvas.current) { canvas.current.width = staging.width; canvas.current.height = staging.height; canvas.current.getContext('2d')?.drawImage(staging,0,0); setReady(true); } }).catch(e => { if (valid) setError(String(e)); }); return () => { valid = false; }; }, [memory]);
  const missing = memory.mode === 'together' && !memory.contributions.some(c => c.person_key === person);
  const complete = memory.photos.every(Boolean);
  return <article className="memory-card"><span className="paper-tape" aria-hidden="true" /><canvas ref={canvas} role="img" aria-label={`${memory.title}, ${complete ? 'complete' : 'waiting for partner'}`} />
    <h3>{memory.title}</h3><p>{new Date(memory.created_at).toLocaleDateString()} · {memory.mode === 'together' ? complete ? 'Together, at last ♥' : 'Waiting for ' + (memory.contributions[0]?.person_key === 'deena' ? 'Sarim' : 'Deena') : 'A little moment'}</p>
    {missing && <button className="paper-button primary" onClick={onJoin}>Add my two photos</button>}
    <button className="paper-button" disabled={!complete || !ready} onClick={() => { if (canvas.current) void canvasBlob(canvas.current).then(blob => downloadBlob(blob, `our-time-${memory.id}.png`)).catch(e => setError(String(e))); }}>Download strip</button>
    {error && <p role="alert">{error}</p>}
  </article>;
}

function BoothSession({ repository, calendarId, userId, person, existing, together, onBack, onSaved }: { repository: MemoryRepository; calendarId: string; userId: string; person: OwnerId; existing?: MemoryView; together: boolean; onBack: () => void; onSaved: () => void }) {
  const [memory, setMemory] = useState<Memory>(() => existing ?? { id: crypto.randomUUID(), calendar_id: calendarId, title: together ? 'Together, a little closer' : 'Our little moments', mode: together ? 'together' : 'solo', shot_count: 4, frame: 'rose', stickers: [], created_at: new Date().toISOString() });
  const count = together ? 2 : memory.shot_count;
  const [shots, setShots] = useState<(string | null)[]>(() => Array(count).fill(null));
  const [selected, setSelected] = useState(0); const [filter, setFilter] = useState<Filter>('Original');
  const [active, setActive] = useState(false); const [opening, setOpening] = useState(false); const [busy, setBusy] = useState(false); const [saving, setSaving] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null); const [error, setError] = useState('');
  const [previewReady, setPreviewReady] = useState(false);
  const video = useRef<HTMLVideoElement>(null); const stream = useRef<MediaStream | null>(null); const mounted = useRef(true); const operation = useRef(0); const lock = useRef(false); const canvas = useRef<HTMLCanvasElement>(null);
  const cameraRequest = useRef(0);
  const stop = () => { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; if (video.current) video.current.srcObject = null; setActive(false); };
  useEffect(() => { mounted.current = true; const element = video.current; return () => { mounted.current = false; operation.current++; cameraRequest.current++; stream.current?.getTracks().forEach(track => track.stop()); if (element) element.srcObject = null; }; }, []);
  useEffect(() => {
    const hide = () => { if (document.hidden) { operation.current++; cameraRequest.current++; stop(); setBusy(false); lock.current = false; setCountdown(null); } };
    document.addEventListener('visibilitychange', hide); return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  const displayPhotos = together ? (person === 'deena' ? [shots[0], existing?.photos[1] ?? null, shots[1], existing?.photos[3] ?? null] : [existing?.photos[0] ?? null, shots[0], existing?.photos[2] ?? null, shots[1]]) : shots;
  useEffect(() => {
    let valid = true; setPreviewReady(false);
    // Render into an isolated canvas so a slow previous render cannot overwrite a newer preview.
    const staging = document.createElement('canvas');
    const previewFilters: Filter[] = together ? (person === 'deena' ? [filter, 'Original', filter, 'Original'] : ['Original', filter, 'Original', filter]) : shots.map(() => filter);
    void renderStrip(staging, displayPhotos, memory, previewFilters).then(() => { if (valid && canvas.current) { canvas.current.width = staging.width; canvas.current.height = staging.height; canvas.current.getContext('2d')?.drawImage(staging, 0, 0); setPreviewReady(true); } }).catch(e => { if (valid) setError(String(e)); });
    return () => { valid = false; };
  }, [shots, memory, filter, existing]);
  async function openCamera() {
    if (opening || active) return; setOpening(true); setError(''); const token = ++cameraRequest.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs HTTPS or localhost and a supported browser. You can upload photos instead.');
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false });
      if (!mounted.current || cameraRequest.current !== token) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media; video.current!.srcObject = media; await video.current!.play();
      if (!mounted.current || cameraRequest.current !== token) { media.getTracks().forEach(t => t.stop()); return; }
      setActive(true);
    } catch (e) { if (mounted.current && cameraRequest.current === token) { stop(); setError(e instanceof Error && e.name !== 'NotAllowedError' ? e.message : 'Camera permission was declined. You can still upload photos below.'); } }
    finally { if (mounted.current) setOpening(false); }
  }
  async function capture(all: boolean) {
    if (lock.current || !active) return; lock.current = true; setBusy(true); setError(''); const token = ++operation.current;
    try {
      const indices = all ? Array.from({ length: count }, (_, i) => i) : [selected];
      for (const index of indices) {
        for (let n = 3; n > 0; n--) { if (!mounted.current || token !== operation.current) return; setCountdown(n); await new Promise(resolve => setTimeout(resolve, 1000)); }
        if (!mounted.current || token !== operation.current) return;
        const v = video.current!; if (!v.videoWidth || v.readyState < 2) throw new Error('The camera is still warming up. Please try again.');
        const shot = document.createElement('canvas'); shot.width = 720; shot.height = 540; const ctx = shot.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable.');
        // Match the familiar mirrored selfie preview.
        ctx.translate(720, 0); ctx.scale(-1, 1); cover(ctx, v, v.videoWidth, v.videoHeight, 0, 0, 720, 540);
        const src = shot.toDataURL('image/jpeg', .9); setShots(current => current.map((old, i) => i === index ? src : old)); setSelected(index); setCountdown(null);
      }
    } catch (e) { if (mounted.current) setError(String(e)); }
    finally { if (mounted.current && token === operation.current) { setBusy(false); setCountdown(null); lock.current = false; } }
  }
  async function upload(file?: File) {
    if (!file || lock.current) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) { setError('Choose a JPEG, PNG or WebP photo under 15 MB.'); return; }
    lock.current = true; setBusy(true); setError(''); const url = URL.createObjectURL(file); const index = selected; const token = ++operation.current;
    try { const blob = await normalizePhoto(url, 'Original'); const reader = new FileReader(); const src = await new Promise<string>((resolve, reject) => { reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); }); if (mounted.current && token === operation.current) { setShots(current => current.map((old, i) => i === index ? src : old)); setSelected(Math.min(index + 1, count - 1)); } }
    catch (e) { if (mounted.current) setError(String(e)); }
    finally { URL.revokeObjectURL(url); if (mounted.current && token === operation.current) { lock.current = false; setBusy(false); } }
  }
  async function save() {
    if (lock.current || shots.some(s => !s)) return; lock.current = true; setSaving(true); setError('');
    try { const blobs = await Promise.all(shots.map(src => normalizePhoto(src!, filter))); await repository.save(memory, userId, blobs); if (mounted.current) { stop(); onSaved(); } }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Save failed. Your preview is still here.'); }
    finally { lock.current = false; if (mounted.current) setSaving(false); }
  }
  function moveSticker(id: string, x: number, y: number) { setMemory(m => ({ ...m, stickers: m.stickers.map(s => s.id === id ? { ...s, x: Math.max(.02, Math.min(.98, x)), y: Math.max(.02, Math.min(.98, y)) } : s) })); }
  const disabled = busy || saving;
  return <><button className="booth-back paper-button" disabled={saving} onClick={onBack}>‹ Memories</button><p className="booth-note">{together ? `Two photos from ${person === 'deena' ? 'Deena' : 'Sarim'}, two from your person. Deena → Sarim → Deena → Sarim.` : 'Three or four moments. One tiny keepsake.'}</p>
    <div className="booth-workspace"><div className="booth-controls"><div className="camera-frame"><video ref={video} muted playsInline aria-label="Mirrored camera preview" style={{ filter: filters[filter] }} />{!active && <div className="camera-placeholder">▣<span>Your camera is resting</span></div>}{countdown && <strong className="booth-countdown" role="status" aria-live="assertive">{countdown}</strong>}</div>
      <p className="booth-note" role="status">{active ? '● Camera active · photos stay here until Save' : 'Camera off · nothing is uploaded until Save'}</p>
      <div className="booth-actions"><button className="paper-button" disabled={opening || disabled} onClick={active ? stop : openCamera}>{opening ? 'Opening…' : active ? 'Stop camera' : 'Open Camera'}</button><label className="paper-button upload-label">Upload Photo<input aria-label="Upload Photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} /></label></div>
      <fieldset disabled={disabled}><legend>Make it yours</legend>{!together && <label>Shots<select value={memory.shot_count} onChange={e => { const n = Number(e.target.value); setMemory(m => ({ ...m, shot_count: n })); setShots(current => Array.from({ length: n }, (_, i) => current[i] ?? null)); setSelected(0); }}><option value={3}>3 shots</option><option value={4}>4 shots</option></select></label>}
      <label>Filter<select value={filter} onChange={e => setFilter(e.target.value as Filter)}>{Object.keys(filters).map(f => <option key={f}>{f}</option>)}</select></label>
      <label>Caption<input maxLength={80} disabled={!!existing} value={memory.title} onChange={e => setMemory(m => ({ ...m, title: e.target.value }))} /></label>
      <label>Paper<select disabled={!!existing} value={memory.frame} onChange={e => setMemory(m => ({ ...m, frame: e.target.value as Memory['frame'] }))}><option value="rose">Rose ribbon</option><option value="blue">Blue skies</option><option value="cream">Vintage cream</option></select></label></fieldset>
      <div className="shot-picker" aria-label="Choose a shot to replace">{shots.map((src, i) => <button className={selected === i ? 'selected' : ''} key={i} disabled={disabled} aria-pressed={selected === i} onClick={() => setSelected(i)}>{src ? <img src={src} alt={`Shot ${i + 1}`} style={{ filter: filters[filter] }} /> : <span>{i + 1}</span>}<small>{src ? 'Retake' : 'Add photo'}</small></button>)}</div>
      <div className="booth-actions"><button className="paper-button primary" disabled={!active || disabled} onClick={() => { void capture(true); }}>Take {count} shots</button><button className="paper-button" disabled={!active || disabled} onClick={() => { void capture(false); }}>Retake shot {selected + 1}</button><button className="paper-button" disabled={disabled} onClick={() => setShots(Array(count).fill(null))}>Retake all</button>{busy && <button className="paper-button" onClick={() => { operation.current++; lock.current = false; setBusy(false); setCountdown(null); }}>Cancel countdown</button>}</div>
      {!existing && <fieldset disabled={disabled}><legend>Little stickers · drag or use arrow keys</legend><div className="sticker-tray">{stickerAssets.map(asset => <button key={asset} disabled={memory.stickers.length >= 16} aria-label={`Add ${asset} sticker`} onClick={() => setMemory(m => ({ ...m, stickers: [...m.stickers, { id: crypto.randomUUID(), asset, x: .5, y: .9 }] }))}><img src={publicAsset(`assets/sticker-${asset}.jpeg`)} alt="" /></button>)}</div><button className="paper-button" onClick={() => setMemory(m => ({ ...m, stickers: [] }))}>Clear stickers</button></fieldset>}
    </div><div><div className="strip-editor" style={{ aspectRatio: `480 / ${stripHeight(displayPhotos.length)}` }}><canvas ref={canvas} role="img" aria-label="Your photo strip preview" />{!existing && memory.stickers.map(sticker => <StickerHandle key={sticker.id} sticker={sticker} disabled={disabled} onMove={moveSticker} onRemove={() => setMemory(m => ({ ...m, stickers: m.stickers.filter(s => s.id !== sticker.id) }))} />)}</div><p className="booth-note">{together ? 'Empty frames are waiting for your person.' : 'A keepsake for our scrapbook.'}</p></div></div>
    {error && <p className="booth-error" role="alert">{error}</p>}<div className="booth-actions booth-footer"><button className="paper-button primary" disabled={disabled || shots.some(s => !s) || !memory.title.trim()} onClick={() => { void save(); }}>{saving ? 'Saving privately…' : together ? 'Save my two photos' : 'Save to Memories'}</button><button className="paper-button" disabled={disabled || !previewReady || displayPhotos.some(s => !s)} onClick={() => { if (canvas.current) void canvasBlob(canvas.current).then(b => downloadBlob(b, 'our-time-strip.png')).catch(e => setError(String(e))); }}>Download PNG</button></div>
  </>;
}

function StickerHandle({ sticker, disabled, onMove, onRemove }: { sticker: StickerPlacement; disabled: boolean; onMove: (id: string, x: number, y: number) => void; onRemove: () => void }) {
  const dragging = useRef(false);
  return <button className="sticker-handle" disabled={disabled} aria-label={`Move ${sticker.asset} sticker with arrow keys; Delete to remove`} style={{ left: `${sticker.x * 100}%`, top: `${sticker.y * 100}%` }}
    onPointerDown={e => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }}
    onPointerMove={e => { if (!dragging.current) return; const rect = e.currentTarget.parentElement!.getBoundingClientRect(); onMove(sticker.id, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height); }}
    onKeyDown={e => { const delta = e.shiftKey ? .05 : .01; if (e.key.startsWith('Arrow')) { e.preventDefault(); onMove(sticker.id, sticker.x + (e.key === 'ArrowRight' ? delta : e.key === 'ArrowLeft' ? -delta : 0), sticker.y + (e.key === 'ArrowDown' ? delta : e.key === 'ArrowUp' ? -delta : 0)); } if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onRemove(); } }}>✥</button>;
}
