import { useEffect, useRef, useState } from 'react';
import { BOOKS, type BookKey, type BookTitle } from '../lib/journal';
import './journal.css';

export function Bookshelf({ books, loading, saving, error, onSave, onOpen, onRefresh }: {
  books: BookTitle[]; loading: boolean; saving: boolean; error: string;
  onSave: (key: BookKey, title: string) => Promise<boolean>; onOpen: () => void; onRefresh: () => void;
}) {
  return <aside className="book-stack" aria-label="Our shared bookshelf">
    {BOOKS.map((book, index) => <BookSpine key={book.key} bookKey={book.key} title={books.find(b => b.book_key === book.key)?.title ?? book.title}
      diary={index === 0} disabled={loading || saving} onSave={onSave} onOpen={onOpen} />)}
    <p className="bookshelf-note" role="status">{loading ? 'Opening our bookshelf…' : saving ? 'Saving to our bookshelf…' : '✿ Titles are ours to change'}</p>
    {error && <p className="bookshelf-error" role="alert">{error}<button onClick={onRefresh}>Retry bookshelf</button></p>}
  </aside>;
}

function BookSpine({ bookKey, title, diary, disabled, onSave, onOpen }: { bookKey: BookKey; title: string; diary: boolean; disabled: boolean; onSave: (key: BookKey, title: string) => Promise<boolean>; onOpen: () => void }) {
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(title), [error, setError] = useState('');
  const titleButton = useRef<HTMLButtonElement>(null), committing = useRef(false), cancelled = useRef(false);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (editing) restoreFocus.current = true;
    else if (restoreFocus.current) { restoreFocus.current = false; titleButton.current?.focus(); }
  }, [editing]);
  const finish = async () => {
    if (committing.current || cancelled.current) return;
    if (!draft.trim()) { setError('A little title, please.'); return; }
    if (draft.trim() === title) { setEditing(false); return; }
    committing.current = true; setError('');
    try {
      if (await onSave(bookKey, draft)) { setEditing(false); titleButton.current?.focus(); }
      else setError('Title not confirmed saved. Keep your edit and retry.');
    } finally { committing.current = false; }
  };
  return <article className={`book-spine ${diary ? 'diary-spine' : ''}`}>
    {editing ? <input autoFocus aria-label={`Title of ${title}`} aria-invalid={!!error} title={error || 'Enter or leave to save; Escape to cancel'} maxLength={48} value={draft} disabled={disabled}
      onChange={e => setDraft(e.target.value)} onBlur={() => { void finish(); }} onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelled.current = true; setEditing(false); titleButton.current?.focus(); }
        if (e.key === 'Enter') { e.preventDefault(); void finish(); }
      }} /> : <button className="book-title" ref={titleButton} disabled={disabled} title={`Rename ${title}`} aria-label={`Rename ${title}`} onClick={() => { cancelled.current = false; setDraft(title); setError(''); setEditing(true); }}><span>{title}</span><small aria-hidden="true">✎</small></button>}
    {diary && <button className="book-open" aria-label="Open shared diary" title="Open our shared diary" onClick={onOpen}><span aria-hidden="true">❧</span><small>open</small></button>}
    {error && <span className="spine-error" role="alert">{error}<button onClick={() => { void finish(); }}>Retry</button></span>}
  </article>;
}
