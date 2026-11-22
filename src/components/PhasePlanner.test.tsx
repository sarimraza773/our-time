// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,describe,it,expect,vi } from 'vitest';
import { PhasePlanner } from './PhasePlanner';
import { PredictedPeriodLog } from './PredictedPeriodLog';
import { DEFAULT_CYCLE } from '../lib/period';
import { makePhasePlan, type CyclePrediction } from '../lib/cyclePlanning';
afterEach(cleanup);
describe('phase editor and automatic prediction controls',()=>{
 it('edits phase days and exact dates, and saves all four phases with a future-duration preference',async()=>{
  const save=vi.fn(async()=>true);
  render(<PhasePlanner anchor="2026-03-01" settings={DEFAULT_CYCLE} plans={[]} saving={false} onSave={save} onRemove={async()=>true} onCancel={()=>{}} onDirty={()=>{}}/>);
  fireEvent.change(screen.getByLabelText('Menstruation days'),{target:{value:'6'}});
  expect(screen.getByLabelText<HTMLInputElement>('Menstruation end').value).toBe('2026-03-06');
  expect(screen.getByLabelText<HTMLInputElement>('Follicular start').value).toBe('2026-03-07');
  fireEvent.change(screen.getByLabelText('Luteal end'),{target:{value:'2026-03-31'}});
  expect(screen.getByLabelText<HTMLInputElement>('Luteal days').value).toBe('14');
  fireEvent.click(screen.getByLabelText('Use these durations for future cycles'));
  fireEvent.click(screen.getByRole('button',{name:'Save phases'}));
  await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({cycle_start_date:'2026-03-01',phases:expect.arrayContaining([expect.objectContaining({phase:'luteal',end_date:'2026-03-31'})])}),true,undefined));
 });
 it('shows validation for overlaps and handles cleared date inputs without crashing',()=>{
  const save=vi.fn(async()=>true);
  render(<PhasePlanner anchor="2026-03-01" settings={DEFAULT_CYCLE} plans={[]} saving={false} onSave={save} onRemove={async()=>true} onCancel={()=>{}} onDirty={()=>{}}/>);
  fireEvent.change(screen.getByLabelText('Ovulation start'),{target:{value:''}});
  expect(screen.getByLabelText<HTMLInputElement>('Ovulation days').value).toBe('');
  fireEvent.change(screen.getByLabelText('Ovulation start'),{target:{value:'2026-03-01'}});
  fireEvent.submit(screen.getByRole('button',{name:'Save phases'}).closest('form')!);
  expect(screen.getByRole('alert').textContent).toMatch(/no overlapping dates/);expect(save).not.toHaveBeenCalled();
 });
 it('loads a saved plan and confirms removal separately from period records',async()=>{
  const remove=vi.fn(async()=>true), plan={...makePhasePlan('2026-03-01',DEFAULT_CYCLE),user_id:'synthetic-owner',updated_at:'v1'};
  render(<PhasePlanner anchor="2026-03-01" settings={DEFAULT_CYCLE} plans={[plan]} saving={false} onSave={async()=>true} onRemove={remove} onCancel={()=>{}} onDirty={()=>{}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Remove this phase plan'}));expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Confirm phase removal'}));await waitFor(()=>expect(remove).toHaveBeenCalledWith(plan));
 });
 const prediction:CyclePrediction={id:'p1',user_id:'synthetic-owner',anchor_start:'2026-02-26',start_date:'2026-03-26',end_date:'2026-03-30',status:'predicted',confirmed_entry_id:null,updated_at:'v1'};
 it('labels a due log Predicted and requires a separate confirmation with actual date corrections',async()=>{
  const confirm=vi.fn(async()=>true);
  render(<PredictedPeriodLog predictions={[prediction]} starts={3} enabled today="2026-03-27" saving={false} onConfirm={confirm} onDismiss={async()=>true} onDirty={()=>{}}/>);
  expect(screen.getByText(/Predicted · Expected in progress/)).toBeTruthy();expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Confirm / correct bleeding dates'}));
  expect(screen.getByLabelText<HTMLInputElement>('Actual period end (optional)').value).toBe('');
  fireEvent.change(screen.getByLabelText('Actual period start'),{target:{value:'2026-03-25'}});
  fireEvent.click(screen.getByRole('button',{name:'Save confirmed period'}));
  await waitFor(()=>expect(confirm).toHaveBeenCalledWith(prediction,expect.objectContaining({start_date:'2026-03-25',end_date:null})));
 });
 it('waits for three recorded starts and keeps dismissal separate from confirmation',()=>{
  const dismiss=vi.fn(async()=>true),confirm=vi.fn(async()=>true);
  const view=render(<PredictedPeriodLog predictions={[]} starts={2} enabled today="2026-03-27" saving={false} onConfirm={confirm} onDismiss={dismiss} onDirty={()=>{}}/>);
  expect(screen.getByText(/2 of 3 recorded period starts/)).toBeTruthy();
  view.rerender(<PredictedPeriodLog predictions={[prediction]} starts={3} enabled today="2026-03-27" saving={false} onConfirm={confirm} onDismiss={dismiss} onDirty={()=>{}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Did not happen / Dismiss'}));expect(dismiss).toHaveBeenCalledWith(prediction);expect(confirm).not.toHaveBeenCalled();
 });
});
