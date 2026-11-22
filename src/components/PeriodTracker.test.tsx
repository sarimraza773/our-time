// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PeriodTracker } from './PeriodTracker';
import { CycleAccessError, type PeriodRepository } from '../data/periodRepository';
import { DEFAULT_CYCLE, type CycleSnapshot } from '../lib/period';
const today = '2026-03-20';
function fixture(initial: Omit<CycleSnapshot, 'ownerUserId'> = { entries: [], settings: null }) {
  let data: CycleSnapshot = { ...structuredClone(initial), ownerUserId: 'synthetic-owner' }; let version = 0;
  const repository: PeriodRepository = {
    load: vi.fn(async () => structuredClone(data)),
    saveEntry: vi.fn(async (user, draft) => { data.entries = [...data.entries.filter(e => e.id !== draft.id),{...draft,user_id:user,updated_at:String(++version)}]; }),
    saveSettings: vi.fn(async (user, value) => { data.settings = {...value,user_id:user,updated_at:String(++version)}; }),
    deleteEntry: vi.fn(async (_user, entry) => { data.entries = data.entries.filter(e => e.id !== entry.id); }),
    savePhasePlan: vi.fn(async()=>{}), deletePhasePlan: vi.fn(async()=>{}), dismissPrediction: vi.fn(async()=>{}), confirmPrediction: vi.fn(async()=>{}),
    deleteAll: vi.fn(async () => { data = {ownerUserId:'synthetic-owner',entries:[],settings:null}; }),
  };
  const show = (viewer = "synthetic-owner") => render(<PeriodTracker repository={repository} userId={viewer} today={today} onClose={() => {}} />);
  return {repository,show};
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('private cycle journal interactions with simulated persistence', () => {
  it('handles first-time logging, ending, editing and remount persistence', async () => {
    const {show,repository}=fixture(); const view=show(); await screen.findByText('No periods logged yet. Only your two linked accounts can access these dates.');
    fireEvent.click(screen.getByRole('button',{name:'＋ Log Period'}));
    fireEvent.change(screen.getByLabelText('Period start date'),{target:{value:'2026-03-18'}});
    fireEvent.change(screen.getByLabelText('Notes (optional)'),{target:{value:'Synthetic note'}});
    fireEvent.click(screen.getByRole('button',{name:'Save period'}));
    await screen.findByText('Saved to Deena’s tracker.'); expect(repository.saveEntry).toHaveBeenCalledOnce();
    expect(screen.getByText('Cycle day 3')).toBeTruthy(); expect(screen.getByText('Ongoing — end not recorded')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Mark ended / Edit'}));
    fireEvent.change(screen.getByLabelText('Period end date (optional)'),{target:{value:'2026-03-20'}}); fireEvent.click(screen.getByRole('button',{name:'Save period'}));
    await screen.findByRole('button',{name:'Edit'}); view.unmount(); show();
    await screen.findByText('Synthetic note'); expect(screen.getByText('3 recorded days · Actual record')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Edit'}));
    fireEvent.change(screen.getByLabelText('Period start date'),{target:{value:'2026-03-17'}}); fireEvent.click(screen.getByRole('button',{name:'Save period'}));
    await screen.findByText('4 recorded days · Actual record');
  });
  it('saves manual settings and override, explores month cells, and confirms deletions', async () => {
    const {show,repository}=fixture({entries:[{id:'one',user_id:'synthetic-owner',start_date:'2026-03-01',end_date:'2026-03-05',notes:'',updated_at:'v1'}],settings:null});
    show(); await screen.findByRole('button',{name:'Cycle settings'}); fireEvent.click(screen.getByRole('button',{name:'Cycle settings'}));
    fireEvent.change(screen.getByLabelText('Estimate source'),{target:{value:'manual'}}); fireEvent.click(screen.getByRole('button',{name:'Save settings'}));
    await waitFor(() => expect(screen.queryByRole('button',{name:'Save settings'})).toBeNull());
    expect(screen.getAllByText('Mar 29, 2026').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button',{name:'Adjust Cycle / Override'}));
    fireEvent.change(screen.getByLabelText('Expected next-period date (manual prediction)'),{target:{value:'2026-04-02'}});
    fireEvent.click(screen.getByRole('button',{name:'Save adjustment'})); await screen.findByText('Apr 2, 2026');
    expect(repository.saveSettings).toHaveBeenLastCalledWith('synthetic-owner',expect.objectContaining({expected_next_date:'2026-04-02',override_anchor:'2026-03-01'}),expect.anything());
    fireEvent.click(screen.getByRole('button',{name:'Adjust Cycle / Override'}));
    fireEvent.click(screen.getByRole('button',{name:'Reset override'})); fireEvent.click(screen.getByRole('button',{name:'Save adjustment'}));
    await waitFor(() => expect(screen.queryByRole('button',{name:'Save adjustment'})).toBeNull());
    expect(repository.saveSettings).toHaveBeenLastCalledWith('synthetic-owner',expect.objectContaining({expected_next_date:null,override_anchor:null,missed_prediction_on:null}),expect.anything());
    expect(repository.saveEntry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Next cycle month'})); expect(screen.getByRole('heading',{name:'April 2026'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:/2026-04-02,.*estimated/})); expect(screen.getByText(/Future \/ predicted/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Remove'})); expect(repository.deleteEntry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Keep data'})); fireEvent.click(screen.getByRole('button',{name:'Delete all tracker data'}));
    fireEvent.click(screen.getByRole('button',{name:'Confirm deletion'})); await screen.findByText('No periods logged yet. Only your two linked accounts can access these dates.'); expect(repository.deleteAll).toHaveBeenCalledOnce();
  });
  it('marks a missed forecast without recording bleeding and permits a later override', async () => {
    const {show,repository}=fixture({entries:[{id:'one',user_id:'synthetic-owner',start_date:'2026-02-01',end_date:'2026-02-05',notes:'',updated_at:'v1'}],settings:{...DEFAULT_CYCLE,estimate_mode:'manual',user_id:'synthetic-owner',updated_at:'v1'}});
    show(); await screen.findByRole('button',{name:'Adjust Cycle / Override'}); fireEvent.click(screen.getByRole('button',{name:'Adjust Cycle / Override'}));
    fireEvent.click(screen.getByLabelText('The expected period has not occurred')); fireEvent.click(screen.getByRole('button',{name:'Save adjustment'}));
    await waitFor(() => expect(repository.saveSettings).toHaveBeenCalledWith('synthetic-owner',expect.objectContaining({missed_prediction_on:'2026-03-01'}),expect.anything()));
    expect(repository.saveEntry).not.toHaveBeenCalled();
  });
  it('lets Sarim save into Deena’s shared tracker and explains both-account access', async () => {
    const {show,repository}=fixture();show('synthetic-sarim');
    await screen.findByRole('button',{name:'＋ Log Period'});
    expect(screen.getByText(/Both linked accounts can view and edit/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'＋ Log Period'}));fireEvent.click(screen.getByRole('button',{name:'Save period'}));
    await screen.findByText('Saved to Deena’s tracker.');
    expect(repository.saveEntry).toHaveBeenCalledWith('synthetic-owner',expect.anything(),expect.anything(),undefined);
  });
  it('clears data when access is denied on refresh and offers a retry for connection errors', async () => {
    const {show,repository}=fixture(); show(); await screen.findByRole('button',{name:'Cycle settings'});
    vi.mocked(repository.load).mockRejectedValueOnce(new CycleAccessError('Private access denied'));
    fireEvent.click(screen.getByRole('button',{name:'Refresh tracker'})); await screen.findByText('Private access denied');
    expect(screen.queryByRole('button',{name:'＋ Log Period'})).toBeNull();
  });
  it('retains an unsaved period draft when a write fails', async () => {
    const {show,repository}=fixture(); show(); await screen.findByRole('button',{name:'＋ Log Period'});
    vi.mocked(repository.saveEntry).mockRejectedValueOnce(new Error('Connection unavailable'));
    fireEvent.click(screen.getByRole('button',{name:'＋ Log Period'})); fireEvent.click(screen.getByRole('button',{name:'Save period'}));
    await screen.findByText('Connection unavailable'); expect(screen.getByLabelText<HTMLInputElement>('Period start date').value).toBe(today);
  });
});
