import { describe, expect, it } from 'vitest';
import { defaultFormat, diaryWrite, readFormat } from './journal';
import { diaryDraft } from '../test/journalFixtures';

describe('safe diary content mapping', () => {
  it('keeps plain text literal and round trips supported formatting', () => {
    const draft = { ...diaryDraft, title: '  A small joy  ', content: '<img src=x onerror=alert(1)>', formatting: { ...defaultFormat, font: 'handwritten' as const, size: 24, color: '#813e55', bold: true, italic: true, underline: true, align: 'center' as const, headingTilt: -3 } };
    expect(diaryWrite(draft)).toEqual({ title: 'A small joy', content: draft.content, formatting: draft.formatting });
    expect(readFormat(JSON.parse(JSON.stringify(draft.formatting)))).toEqual(draft.formatting);
  });
  it('normalizes untrusted styles and rejects empty or excessive writing', () => {
    expect(readFormat({ font: '__proto__', size: 300, color: 'url(evil)', bold: 'true', align: 'sideways', headingTilt: 180 })).toEqual(defaultFormat);
    expect(() => diaryWrite({ ...diaryDraft, title: ' ' })).toThrow(/title/);
    expect(() => diaryWrite({ ...diaryDraft, content: ' ' })).toThrow(/Write/);
    expect(() => diaryWrite({ ...diaryDraft, content: 'x'.repeat(50_001) })).toThrow();
  });
});
