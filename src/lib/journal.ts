export const BOOKS = [
  { key: 'botany', title: 'BOTANY' },
  { key: 'poetry', title: 'POETRY' },
  { key: 'history', title: 'A HISTORY OF US' },
  { key: 'journey', title: 'NOTES FROM OUR JOURNEY' },
] as const;
export type BookKey = typeof BOOKS[number]['key'];
export const journalFonts = { serif: 'Georgia, serif', handwritten: '"Segoe Print", "Bradley Hand", cursive', classic: '"Palatino Linotype", Palatino, serif', sans: '"Segoe UI", sans-serif' };
export const journalColors = { 'Warm ink': '#3d2d26', Rose: '#813e55', Blue: '#203a73', Moss: '#435338', Plum: '#654066' };
export type DiaryFormat = { font: keyof typeof journalFonts; size: number; color: string; bold: boolean; italic: boolean; underline: boolean; align: 'left' | 'center' | 'right'; headingTilt: number };
export const defaultFormat: DiaryFormat = { font: 'serif', size: 18, color: '#3d2d26', bold: false, italic: false, underline: false, align: 'left', headingTilt: 0 };
export type BookTitle = { calendar_id: string; book_key: BookKey; title: string; updated_at: string };
export type DiaryDraft = { id: string; title: string; content: string; formatting: DiaryFormat };
export type DiaryEntry = DiaryDraft & { calendar_id: string; created_by: string; created_at: string; updated_at: string; version: number };
export type JournalSnapshot = { books: BookTitle[]; entries: DiaryEntry[] };

// Treat persisted formatting as untrusted. Only these explicit CSS values reach the page.
export function readFormat(value: unknown): DiaryFormat {
  const f = (value && typeof value === 'object' ? value : {}) as Partial<DiaryFormat>;
  return {
    font: f.font && Object.hasOwn(journalFonts, f.font) ? f.font : defaultFormat.font,
    size: typeof f.size === 'number' && Number.isInteger(f.size) && f.size >= 14 && f.size <= 32 ? f.size : 18,
    color: Object.values(journalColors).includes(f.color ?? '') ? f.color! : defaultFormat.color,
    bold: f.bold === true, italic: f.italic === true, underline: f.underline === true,
    align: f.align === 'center' || f.align === 'right' ? f.align : 'left',
    headingTilt: [-3, 0, 3].includes(f.headingTilt ?? 99) ? f.headingTilt! : 0,
  };
}
export function diaryWrite(draft: DiaryDraft) {
  const title = draft.title.trim(), content = draft.content;
  if (!title || title.length > 160) throw new Error('Give this page a title of 1–160 characters.');
  if (!content.trim() || content.length > 50_000) throw new Error('Write a little on this page (up to 50,000 characters).');
  return { title, content, formatting: readFormat(draft.formatting) };
}
