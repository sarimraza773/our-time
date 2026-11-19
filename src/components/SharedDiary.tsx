import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { SharedJournal } from '../hooks/useSharedJournal';
import { defaultFormat, journalColors, journalFonts, type DiaryDraft, type DiaryEntry, type DiaryFormat } from '../lib/journal';
import type { ProfileRow } from '../data/database';
import './journal.css';

export function SharedDiary({ journal, profiles, onClose }: { journal: SharedJournal; profiles: ProfileRow[]; onClose: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ draft: DiaryDraft; original?: DiaryEntry } | null>(null);
  const [deleting, setDeleting] = useState<DiaryEntry | null>(null), [notice, setNotice] = useState('');
  const root = useRef<HTMLElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const newButton = useRef<HTMLButtonElement>(null), editButton = useRef<HTMLButtonElement>(null), wasEditing = useRef(false);
  const active = journal.entries.find(e => e.id === selected);
  const dirty = !!editor && (!editor.original
    ? !!(editor.draft.title || editor.draft.content || JSON.stringify(editor.draft.formatting) !== JSON.stringify(defaultFormat))
    : JSON.stringify(editor.draft) !== JSON.stringify({ id: editor.original.id, title: editor.original.title, content: editor.original.content, formatting: editor.original.formatting }));
  const canLeave = () => !journal.saving && (!dirty || window.confirm('Leave this page and discard your unsaved writing?'));
  const closeRef = useRef(() => {});
  closeRef.current = () => { if (canLeave()) onClose(); };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRef.current(); }
      if (e.key === 'Tab') {
        const controls = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])].filter(el => !el.closest('[hidden]'));
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => {
    if (editor) { wasEditing.current = true; root.current?.querySelector<HTMLInputElement>('#diary-entry-title')?.focus(); }
    else if (wasEditing.current) { wasEditing.current = false; (editButton.current ?? newButton.current)?.focus(); }
  }, [editor?.draft.id]);
  useEffect(() => {
    if (journal.accessDenied) { setEditor(null); setSelected(null); setDeleting(null); }
  }, [journal.accessDenied]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    addEventListener('beforeunload', guard);
    return () => removeEventListener('beforeunload', guard);
  }, [dirty]);
  const begin = (entry?: DiaryEntry) => {
    if (!canLeave()) return;
    journal.clearSaveError(); setNotice(''); setDeleting(null);
    setEditor({ original: entry, draft: entry ? { id: entry.id, title: entry.title, content: entry.content, formatting: { ...entry.formatting } } : { id: crypto.randomUUID(), title: '', content: '', formatting: { ...defaultFormat } } });
  };
  const change = (patch: Partial<DiaryDraft>) => setEditor(value => value ? { ...value, draft: { ...value.draft, ...patch } } : value);
  const format = (patch: Partial<DiaryFormat>) => { if (editor) change({ formatting: { ...editor.draft.formatting, ...patch } }); };
  const save = async () => {
    if (!editor) return;
    if (await journal.saveEntry(editor.draft, editor.original)) { setSelected(editor.draft.id); setEditor(null); setNotice('Your words are saved in our shared diary.'); }
  };
  const cancel = () => { if (canLeave()) { setEditor(null); journal.clearSaveError(); setNotice('Unsaved changes discarded.'); } };
  const author = (entry: DiaryEntry) => profiles.find(p => p.id === entry.created_by)?.display_name ?? 'A calendar member';
  const f = editor?.draft.formatting;
  const changedElsewhere = !!editor?.original && (!journal.entries.some(e => e.id === editor.original!.id && e.version === editor.original!.version));
  return <div className="diary-backdrop" onClick={e => { if (e.target === e.currentTarget) closeRef.current(); }}>
    <section className="diary-book" ref={root} role="dialog" aria-modal="true" aria-labelledby="diary-heading">
      <header className="diary-heading"><div><p className="eyebrow">Deena &amp; Sarim · a little life, together</p><h2 id="diary-heading">Our shared diary <span aria-hidden="true">❦</span></h2></div><button ref={closeButton} className="paper-button" disabled={journal.saving} onClick={() => closeRef.current()}>Close diary ✕</button></header>
      <div className="diary-spread">
        <aside className="diary-index" aria-label="Diary entries"><p className="diary-inscription">For the little things<br />we want to remember.</p><span className="pressed-flower" aria-hidden="true">✿</span>
          <button ref={newButton} className="paper-button primary" disabled={journal.loading || journal.saving || journal.accessDenied} onClick={() => begin()}>＋ New entry</button>
          <div className="diary-contents">{journal.entries.map(entry => <button key={entry.id} disabled={journal.saving} className={selected === entry.id ? 'selected' : ''} aria-current={selected === entry.id ? 'page' : undefined} onClick={() => { if (canLeave()) { setEditor(null); setSelected(entry.id); setDeleting(null); setNotice(''); journal.clearSaveError(); } }}><strong>{entry.title}</strong><small>{new Date(entry.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} · {author(entry)}</small></button>)}</div>
          <p className="diary-sync" role="status">{journal.loading ? 'Opening our pages…' : journal.connected ? 'Shared connection active' : 'Shared connection interrupted · retry to refresh'}</p><button className="diary-refresh" onClick={journal.refresh}>Refresh pages</button>
        </aside>
        <div className="diary-page">
          {journal.loadError && <p className="diary-error" role="alert">{journal.loadError}</p>}
          {journal.saveError && <p className="diary-error" role="alert">{journal.saveError}</p>}
          {notice && <p role="status" className="diary-notice">{notice}</p>}
          {journal.accessDenied ? <p role="alert">Access to our shared diary has changed. Close this book and sign in again.</p> : editor && f ? <form onSubmit={e => { e.preventDefault(); void save(); }}>
            <fieldset disabled={journal.saving} className="diary-fields">
              <label className="entry-title-label" htmlFor="diary-entry-title">Entry title</label><input id="diary-entry-title" className="diary-title-input" maxLength={160} required value={editor.draft.title} onChange={e => change({ title: e.target.value })} placeholder="A day worth keeping…" style={{ transform: `rotate(${f.headingTilt}deg)` }} />
              <FormatToolbar value={f} onChange={format} />
              <p id="diary-format-hint" className="diary-hint">These choices dress all the words on this page. Only the heading tilts.</p>
              <label className="sr-only" htmlFor="diary-body">Diary body</label><textarea id="diary-body" className="diary-body-input" aria-describedby="diary-format-hint" required maxLength={50_000} value={editor.draft.content} onChange={e => change({ content: e.target.value })} placeholder="Dear us,…" style={bodyStyle(f)} />
            </fieldset>
            {changedElsewhere && <p role="alert" className="diary-error">This page has changed elsewhere. Your draft is kept here; copy it before reopening the latest page.</p>}
            <footer className="diary-actions"><small>Unsaved writing stays here until you save or leave.</small><button type="button" className="paper-button" disabled={journal.saving} onClick={cancel}>Cancel</button><button className="paper-button primary" disabled={journal.saving || changedElsewhere}>{journal.saving ? 'Saving…' : 'Save entry'}</button></footer>
          </form> : active ? <article className="diary-reading">
            <p className="eyebrow">Written by {author(active)}</p><h3 style={{ transform: `rotate(${active.formatting.headingTilt}deg)` }}>{active.title}</h3><p className="diary-date">{new Date(active.updated_at).toLocaleString()} · last saved</p>
            <div className="diary-body" style={bodyStyle(active.formatting)}>{active.content}</div>
            {deleting ? <div className="diary-delete-confirm" role="group" aria-label="Confirm entry deletion"><p>Remove “{deleting.title}” from our shared diary for both of us?</p><button className="paper-button" disabled={journal.saving} onClick={() => setDeleting(null)}>Keep entry</button><button className="paper-button danger" disabled={journal.saving} onClick={async () => { if (await journal.deleteEntry(deleting)) { setDeleting(null); setSelected(null); setNotice('The page was removed from our shared diary.'); } }}>Confirm delete</button></div> : <footer className="diary-actions"><button ref={editButton} className="paper-button" disabled={journal.saving} onClick={() => begin(active)}>Edit entry</button><button className="paper-button danger" disabled={journal.saving} onClick={() => { journal.clearSaveError(); setDeleting(active); }}>Delete entry</button></footer>}
          </article> : <div className="diary-empty"><span aria-hidden="true">❧</span><h3>{selected ? 'This page has been put away.' : 'A place for our words'}</h3><p>{selected ? 'It may have been removed by your partner. Choose another page or begin a new one.' : 'A tiny joy. A long-distance day. Something you never want to forget.'}</p><p>Choose a page, or write a new one.<br />Just for the two of us.</p></div>}
        </div>
      </div><div className="diary-bookmark" aria-hidden="true" />
    </section>
  </div>;
}

function bodyStyle(f: DiaryFormat): CSSProperties {
  return { fontFamily: journalFonts[f.font], fontSize: f.size, color: f.color, fontWeight: f.bold ? 700 : 400, fontStyle: f.italic ? 'italic' : 'normal', textDecoration: f.underline ? 'underline' : 'none', textAlign: f.align };
}
function FormatToolbar({ value: f, onChange }: { value: DiaryFormat; onChange: (patch: Partial<DiaryFormat>) => void }) {
  return <div className="diary-toolbar" role="group" aria-label="Page formatting">
    <label>Font<select value={f.font} onChange={e => onChange({ font: e.target.value as DiaryFormat['font'] })}><option value="serif">Storybook</option><option value="handwritten">Handwritten</option><option value="classic">Classic letter</option><option value="sans">Simple</option></select></label>
    <label>Size<select value={f.size} onChange={e => onChange({ size: Number(e.target.value) })}>{Array.from({ length: 19 }, (_, i) => i + 14).map(size => <option key={size} value={size}>{size}px</option>)}</select></label>
    <label>Ink<select value={f.color} onChange={e => onChange({ color: e.target.value })}>{Object.entries(journalColors).map(([name, color]) => <option key={color} value={color}>{name}</option>)}</select></label>
    <span className="format-toggles">{(['bold', 'italic', 'underline'] as const).map(key => <button type="button" key={key} aria-label={key[0].toUpperCase() + key.slice(1)} aria-pressed={f[key]} onClick={() => onChange({ [key]: !f[key] })}><span style={{ fontWeight: key === 'bold' ? 700 : 400, fontStyle: key === 'italic' ? 'italic' : 'normal', textDecoration: key === 'underline' ? 'underline' : 'none' }}>{key[0].toUpperCase()}</span></button>)}</span>
    <label>Alignment<select value={f.align} onChange={e => onChange({ align: e.target.value as DiaryFormat['align'] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
    <label>Heading tilt<select value={f.headingTilt} onChange={e => onChange({ headingTilt: Number(e.target.value) })}><option value={-3}>A little left</option><option value={0}>Upright</option><option value={3}>A little right</option></select></label>
  </div>;
}
