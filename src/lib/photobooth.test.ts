import { describe, expect, it } from 'vitest';
import { arrangePhotos, stripHeight } from './photobooth';
describe('photo strip layout', () => {
  it('alternates Deena and Sarim regardless of who saves first', () => {
    expect(arrangePhotos({ mode: 'together', shot_count: 4 }, [{ person_key: 'sarim', photos: ['s1','s2'] }, { person_key: 'deena', photos: ['d1','d2'] }])).toEqual(['d1','s1','d2','s2']);
  });
  it('keeps the other person’s positions empty in an unfinished strip', () => {
    expect(arrangePhotos({ mode: 'together', shot_count: 4 }, [{ person_key: 'sarim', photos: ['s1','s2'] }])).toEqual([null,'s1',null,'s2']);
  });
  it('keeps three shot strips at the correct canvas size', () => {
    expect(arrangePhotos({ mode: 'solo', shot_count: 3 }, [{ person_key: 'deena', photos: ['1','2','3'] }])).toEqual(['1','2','3']);
    expect(stripHeight(3)).toBe(1140); expect(stripHeight(4)).toBe(1470);
  });
});
