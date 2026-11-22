import { useState, type FormEvent } from 'react';
import { daysBetween, PHASES, prettyDate, type CycleSettings } from '../lib/period';
import { makePhasePlan, resizePhase, validatePhasePlan, type PhasePlan, type PhasePlanDraft } from '../lib/cyclePlanning';

export function PhasePlanner({ anchor, settings, plans, saving, onSave, onRemove, onCancel, onDirty }: {
  anchor: string; settings: CycleSettings | Omit<CycleSettings,'user_id'|'updated_at'>; plans: PhasePlan[]; saving: boolean;
  onSave: (draft: PhasePlanDraft, future: boolean, original?: PhasePlan) => Promise<boolean>;
  onRemove: (plan: PhasePlan) => Promise<boolean>; onCancel: () => void; onDirty: () => void;
}) {
  const existing = (start: string) => plans.find(p => p.cycle_start_date === start);
  const [draft,setDraft] = useState<PhasePlanDraft>(() => existing(anchor) ?? makePhasePlan(anchor,settings));
  const [future,setFuture] = useState(false), [error,setError] = useState(''), [remove,setRemove] = useState(false);
  const duration = (start: string,end: string) => { try { return daysBetween(start,end)+1; } catch { return 0; } };
  const original = existing(draft.cycle_start_date);
  const save = async (e: FormEvent) => {
    e.preventDefault();setError('');
    try { validatePhasePlan(draft,future); if (await onSave(draft,future,original)) onCancel(); }
    catch(e) { setError(e instanceof Error ? e.message : 'Check the phase dates.'); }
  };
  return <form className="cycle-form phase-planner" onSubmit={save}><fieldset disabled={saving}>
    <h3>Set cycle phases</h3><p>Set the dates and number of days for each phase. These are manually set dates, not confirmation of ovulation or bleeding. Recorded bleeding takes priority.</p>
    {plans.length > 0 && <label>Open saved phase plan<select value={original?.cycle_start_date ?? ''} onChange={e => { const plan = existing(e.target.value); if(plan){setDraft(plan);setError('');setRemove(false);} }}><option value="">Choose a saved cycle</option>{plans.map(p=><option key={p.cycle_start_date} value={p.cycle_start_date}>{prettyDate(p.cycle_start_date)}</option>)}</select></label>}
    <label>Cycle start date<input type="date" required min="1900-01-01" max="2199-08-31" value={draft.cycle_start_date} onChange={e => {
      const start=e.target.value;
      if (!start) { setDraft({...draft,cycle_start_date:''}); return; }
      setDraft(existing(start) ?? makePhasePlan(start,settings));setRemove(false);onDirty();
    }}/></label>
    <p className="cycle-muted">Changing a duration moves the following phases. Exact date fields can be adjusted individually; phases cannot overlap.</p>
    {draft.phases.map((phase,index) => <fieldset key={phase.phase} className={`phase-fields phase-${phase.phase}`} aria-labelledby={`phase-heading-${phase.phase}`}><h4 className="phase-heading" id={`phase-heading-${phase.phase}`}>{PHASES[phase.phase].label} · Manually set</h4>
      <label>{PHASES[phase.phase].label} days<input type="number" required min="1" max="90" value={duration(phase.start_date,phase.end_date) || ''} onChange={e => {try {setDraft(resizePhase(draft,index,Number(e.target.value)));onDirty();} catch {setError('Set valid dates before changing a duration.');}}}/></label>
      <div className="cycle-pair"><label>{PHASES[phase.phase].label} start<input type="date" required min={draft.cycle_start_date || '1900-01-01'} max="2199-12-31" value={phase.start_date} onChange={e => {setDraft({...draft,...(index===0?{cycle_start_date:e.target.value}:{}),phases:draft.phases.map((p,i)=>i===index?{...p,start_date:e.target.value}:p)});onDirty();}}/></label>
      <label>{PHASES[phase.phase].label} end<input type="date" required min={phase.start_date || draft.cycle_start_date} max="2199-12-31" value={phase.end_date} onChange={e => {setDraft({...draft,phases:draft.phases.map((p,i)=>i===index?{...p,end_date:e.target.value}:p)});onDirty();}}/></label></div>
    </fieldset>)}
    <label className="cycle-check"><input type="checkbox" checked={future} onChange={e=>{setFuture(e.target.checked);onDirty();}}/>Use these durations for future cycles</label>
    <p className="cycle-muted">Using future durations sets the cycle total to their sum and clears the next-period date override. This plan’s exact dates stay saved for its cycle.</p>
    {error && <p role="alert" className="cycle-error">{error}</p>}
    <div className="cycle-actions">{original && <button type="button" className="cycle-remove" onClick={()=>setRemove(true)}>Remove this phase plan</button>}<button type="button" className="paper-button" onClick={onCancel}>Cancel phases</button><button className="paper-button primary">Save phases</button></div>
    {remove && original && <section className="cycle-confirm" role="alertdialog" aria-label="Remove phase plan"><p>Remove the manual dates for {prettyDate(original.cycle_start_date)}? Recorded periods stay saved. Future default durations are controlled separately in Cycle settings.</p><button type="button" className="paper-button" onClick={()=>setRemove(false)}>Keep phase plan</button><button type="button" className="paper-button" onClick={async()=>{if(await onRemove(original))onCancel();}}>Confirm phase removal</button></section>}
  </fieldset></form>;
}
