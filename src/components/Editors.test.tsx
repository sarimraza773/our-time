// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';
import { EventEditor, RecurringScheduleEditor } from './Editors';
import { event, rule } from '../test/calendarFixtures';
const day = DateTime.fromISO('2026-03-01');
afterEach(cleanup);
const show = (existing = false, recurring = false) => {
  const onSave = vi.fn(), onSaveRule = vi.fn();
  render(<EventEditor event={existing ? { ...event, isRecurring: recurring } : null} day={day} ownerId="deena" zone="Asia/Kuala_Lumpur" onSave={onSave} onSaveRule={onSaveRule} onDelete={() => {}} onClose={() => {}} onEditSeries={recurring ? () => {} : undefined} />);
  return { onSave, onSaveRule };
};
describe('visible event controls', () => {
  it('defaults unchecked, expands weekly controls, and collapses without saving a recurrence', () => {
    const { onSave, onSaveRule } = show();
    const toggle = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Recurring event' });
    expect(toggle.checked).toBe(false); expect(screen.queryByLabelText('Repeat every')).toBeNull();
    fireEvent.click(toggle); expect(screen.getByLabelText('Repeat every')).toBeTruthy(); expect(screen.getByRole('button',{name:'Monday'})).toBeTruthy();
    fireEvent.click(screen.getByLabelText('No end date')); expect(screen.getByLabelText('Ends on')).toBeTruthy();
    fireEvent.click(toggle); expect(screen.queryByLabelText('Repeat every')).toBeNull();
    fireEvent.change(screen.getByLabelText('Title'),{target:{value:'A moment'}}); fireEvent.submit(screen.getByRole('dialog'));
    expect(onSave).toHaveBeenCalledOnce(); expect(onSaveRule).not.toHaveBeenCalled();
  });
  it('saves weekday, interval, end and custom color through the existing rule callback', () => {
    const { onSaveRule } = show(); fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Tea'}});
    fireEvent.click(screen.getByLabelText('Recurring event')); fireEvent.change(screen.getByLabelText('Repeat every'),{target:{value:'custom'}});
    fireEvent.change(screen.getByLabelText('Repeat interval'),{target:{value:'2'}});
    fireEvent.click(screen.getByRole('button',{name:'Tuesday'})); fireEvent.change(screen.getByLabelText('Custom color'),{target:{value:'#183243'}});
    fireEvent.click(screen.getByLabelText('No end date')); fireEvent.change(screen.getByLabelText('Ends on'),{target:{value:'2026-04-01'}});
    fireEvent.submit(screen.getByRole('dialog'));
    expect(onSaveRule).toHaveBeenCalledWith(expect.objectContaining({pattern:'weekly',interval:2,weekdays:[7,2].sort(),endDate:'2026-04-01',color:'#183243'}));
  });
  it('initializes an occurrence checked and keeps individual save/delete and series actions', () => {
    const { onSave, onSaveRule } = show(true,true);
    expect(screen.getByRole<HTMLInputElement>('checkbox',{name:'Recurring event'}).checked).toBe(true);
    expect(screen.getByRole('button',{name:'Delete occurrence'})).toBeTruthy(); expect(screen.getByRole('button',{name:'Edit series'})).toBeTruthy();
    fireEvent.submit(screen.getByRole('dialog')); expect(onSave).toHaveBeenCalledOnce(); expect(onSaveRule).not.toHaveBeenCalled();
  });
  it('initializes existing series settings and preserves saved color', () => {
    render(<RecurringScheduleEditor rule={{...rule,startDate:'2026-03-01',pattern:'monthly',interval:2,color:'#abcdef',endDate:'2026-10-01'}} ownerId="deena" onSave={() => {}} onClose={() => {}} />);
    expect(screen.getByLabelText<HTMLInputElement>('Custom color').value).toBe('#abcdef');
    expect(screen.getByLabelText<HTMLInputElement>('Ends on').value).toBe('2026-10-01');
  });
});
