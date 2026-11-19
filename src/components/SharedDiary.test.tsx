// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bookshelf } from './Bookshelf';
import { SharedDiary } from './SharedDiary';
import { useSharedJournal } from '../hooks/useSharedJournal';
import { diaryDraft, diaryEntry, fakeJournal } from '../test/journalFixtures';
import { calendarId, emptySnapshot } from '../test/calendarFixtures';
import type { JournalRepository } from '../data/journalRepository';
import { JournalAccessError } from '../data/journalRepository';

beforeEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function TestRoom({ repo, close = () => {}, showDiary = true }: { repo: JournalRepository; close?: () => void; showDiary?: boolean }) {
  const journal = useSharedJournal(repo, calendarId);
  return <><Bookshelf books={journal.books} loading={journal.loading} saving={journal.saving} error={journal.loadError || journal.saveError} onSave={journal.saveBook} onOpen={() => {}} onRefresh={journal.refresh} />{showDiary && <SharedDiary journal={journal} profiles={emptySnapshot().profiles} onClose={close} />}</>;
}
async function ready() { await waitFor(() => expect((screen.getByRole('button', { name: '＋ New entry' }) as HTMLButtonElement).disabled).toBe(false)); }
describe('interactive bookshelf and diary', () => {
  it('renames on Enter and blur, and cancels on Escape without a write', async () => {
    const { repo } = fakeJournal(); render(<TestRoom repo={repo} showDiary={false} />); await waitFor(() => expect((screen.getByLabelText('Rename BOTANY') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByLabelText('Rename BOTANY'));
    let input = screen.getByRole('textbox', { name: 'Title of BOTANY' });
    fireEvent.change(input, { target: { value: 'Our diary' } }); fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByLabelText('Rename Our diary'); expect(repo.saveBook).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText('Rename POETRY')); input = screen.getByRole('textbox', { name: 'Title of POETRY' });
    fireEvent.change(input, { target: { value: 'Love letters' } }); fireEvent.blur(input);
    await screen.findByLabelText('Rename Love letters');
    fireEvent.click(screen.getByLabelText('Rename Our diary')); input = screen.getByRole('textbox', { name: 'Title of Our diary' });
    fireEvent.change(input, { target: { value: 'Do not save' } }); fireEvent.keyDown(input, { key: 'Escape' }); fireEvent.blur(input);
    expect(repo.saveBook).toHaveBeenCalledTimes(2); expect(screen.getByLabelText('Rename Our diary')).toBe(document.activeElement);
  });
  it('creates an entry with all formatting, reads safely, edits and persists on remount', async () => {
    const { repo } = fakeJournal(); const room = render(<TestRoom repo={repo} />); await ready();
    fireEvent.click(screen.getByRole('button', { name: '＋ New entry' }));
    fireEvent.change(screen.getByLabelText('Entry title'), { target: { value: diaryDraft.title } });
    fireEvent.change(screen.getByLabelText('Diary body'), { target: { value: '<script>still just words</script>\nOur little day.' } });
    fireEvent.change(screen.getByLabelText('Font'), { target: { value: 'handwritten' } });
    fireEvent.change(screen.getByLabelText('Size'), { target: { value: '24' } });
    fireEvent.change(screen.getByLabelText('Ink'), { target: { value: '#813e55' } });
    for (const label of ['Bold','Italic','Underline']) fireEvent.click(screen.getByRole('button', { name: label }));
    fireEvent.change(screen.getByLabelText('Alignment'), { target: { value: 'center' } });
    fireEvent.change(screen.getByLabelText('Heading tilt'), { target: { value: '-3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
    await screen.findByRole('button', { name: 'Edit entry' });
    const saved = vi.mocked(repo.saveEntry).mock.calls[0][1];
    expect(saved.formatting).toEqual({ font: 'handwritten', size: 24, color: '#813e55', bold: true, italic: true, underline: true, align: 'center', headingTilt: -3 });
    expect(room.container.querySelector('script')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit entry' }));
    fireEvent.change(screen.getByLabelText('Diary body'), { target: { value: 'A letter back.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save entry' })); await screen.findByText('A letter back.');
    room.unmount(); render(<TestRoom repo={repo} />); await ready();
    fireEvent.click(screen.getByRole('button', { name: /A small joy.*Deena/ })); expect(screen.getByText('A letter back.')).toBeDefined();
  });
  it('keeps writing on rejected save, and guards cancel/close with dirty drafts', async () => {
    const { repo } = fakeJournal(); vi.mocked(repo.saveEntry).mockRejectedValue(new Error('Connection lost; draft kept'));
    const close = vi.fn(); render(<TestRoom repo={repo} close={close} />); await ready();
    fireEvent.click(screen.getByRole('button', { name: '＋ New entry' }));
    fireEvent.change(screen.getByLabelText('Entry title'), { target: { value: 'Keep me' } });
    fireEvent.change(screen.getByLabelText('Diary body'), { target: { value: 'These are unsaved words.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save entry' })); await screen.findAllByText('Connection lost; draft kept');
    expect((screen.getByLabelText('Diary body') as HTMLTextAreaElement).value).toBe('These are unsaved words.');
    vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect(screen.getByLabelText('Diary body')).toBeDefined();
    fireEvent.keyDown(document, { key: 'Escape' }); expect(close).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect(screen.queryByLabelText('Diary body')).toBeNull(); expect(repo.saveEntry).toHaveBeenCalledTimes(1);
  });
  it('requires deletion confirmation and leaves the entry intact when kept', async () => {
    const { repo } = fakeJournal({ books: [], entries: [diaryEntry] }); render(<TestRoom repo={repo} />); await ready();
    fireEvent.click(screen.getByRole('button', { name: /A small joy.*Deena/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete entry' })); expect(repo.deleteEntry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep entry' })); expect(repo.deleteEntry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete entry' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(repo.deleteEntry).toHaveBeenCalledOnce()); await screen.findByText('The page was removed from our shared diary.');
  });
  it('keeps an editing draft when the partner changes the entry, and blocks a stale save', async () => {
    const fake = fakeJournal({ books: [], entries: [diaryEntry] }); render(<TestRoom repo={fake.repo} />); await ready();
    fireEvent.click(screen.getByRole('button', { name: /A small joy.*Deena/ })); fireEvent.click(screen.getByRole('button', { name: 'Edit entry' }));
    fireEvent.change(screen.getByLabelText('Diary body'), { target: { value: 'My unsaved words' } });
    fake.replace({ books: [], entries: [{ ...diaryEntry, content: 'Partner words', version: 2 }] });
    await screen.findByText(/This page has changed elsewhere/);
    expect((screen.getByLabelText('Diary body') as HTMLTextAreaElement).value).toBe('My unsaved words');
    expect((screen.getByRole('button', { name: 'Save entry' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('traps keyboard focus in the open book', async () => {
    const { repo } = fakeJournal(); render(<TestRoom repo={repo} />); await ready();
    const first = screen.getByRole('button', { name: 'Close diary ✕' }), last = screen.getByRole('button', { name: 'Refresh pages' });
    first.focus(); fireEvent.keyDown(first, { key: 'Tab', shiftKey: true }); expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: 'Tab' }); expect(document.activeElement).toBe(first);
  });
  it('removes an open editing draft from view after membership is revoked', async () => {
    const fake = fakeJournal({ books: [], entries: [diaryEntry] }); render(<TestRoom repo={fake.repo} />); await ready();
    fireEvent.click(screen.getByRole('button', { name: /A small joy.*Deena/ })); fireEvent.click(screen.getByRole('button', { name: 'Edit entry' }));
    vi.mocked(fake.repo.load).mockRejectedValue(new JournalAccessError('Membership required'));
    fake.notify();
    await screen.findByText(/Access to our shared diary has changed/);
    expect(screen.queryByLabelText('Diary body')).toBeNull(); expect(screen.queryByText(diaryEntry.content)).toBeNull();
    expect((screen.getByRole('button', { name: '＋ New entry' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('confirms deletion against the version originally reviewed, even if the partner edits meanwhile', async () => {
    const fake = fakeJournal({ books: [], entries: [diaryEntry] }); render(<TestRoom repo={fake.repo} />); await ready();
    fireEvent.click(screen.getByRole('button', { name: /A small joy.*Deena/ })); fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }));
    fake.replace({ books: [], entries: [{ ...diaryEntry, content: 'New partner writing', version: 2 }] });
    await screen.findByText('New partner writing');
    vi.mocked(fake.repo.deleteEntry).mockRejectedValue(new Error('This page changed. Refresh and review before deleting.'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await screen.findAllByText('This page changed. Refresh and review before deleting.');
    expect(vi.mocked(fake.repo.deleteEntry).mock.calls[0][1].version).toBe(1);
    expect(screen.getByText('New partner writing')).toBeDefined();
  });
});
