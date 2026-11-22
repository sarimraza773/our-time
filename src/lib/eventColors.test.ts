import { describe, it, expect } from 'vitest';
import { eventFill, eventText } from './eventColors';
import { layoutTimelineEvents } from './timelineLayout';
import { event } from '../test/calendarFixtures';
describe('manual and automatic event colors', () => {
  it('accepts exact hex colors, uses readable text and rejects untrusted CSS values', () => {
    expect(eventFill('#123456')).toBe('#123456'); expect(eventText('#000000')).toBe('#ffffff'); expect(eventText('#ffffff')).toBe('#000000');
    expect(eventFill('url(evil)' as '#x')).toBeUndefined();
  });
  it('keeps manually selected shades unchanged while assigning complementary overlapping lanes deterministically', () => {
    const items=[{event:{...event,id:'manual',color:'#abcdef' as const},top:.1,bottom:.3},{event:{...event,id:'a'},top:.1,bottom:.3},{event:{...event,id:'b'},top:.1,bottom:.3}];
    const placed=layoutTimelineEvents(items), reversed=layoutTimelineEvents([...items].reverse());
    expect(placed).toEqual(reversed); expect(new Set(placed.map(x=>x.fill)).size).toBe(3);
    expect(placed.find(x=>x.event.id==='manual')?.fill).toBe('#abcdef');
    const changed=layoutTimelineEvents(items.map(x=>x.event.id==='a'?{...x,event:{...x.event,color:'#000000' as const}}:x));
    expect(changed.find(x=>x.event.id==='manual')?.fill).toBe('#abcdef');
  });
});
