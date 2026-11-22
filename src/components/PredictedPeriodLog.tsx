import { useEffect, useState, type FormEvent } from 'react';
import { prettyDate, type PeriodDraft } from '../lib/period';
import type { CyclePrediction } from '../lib/cyclePlanning';

export function PredictedPeriodLog({ predictions, starts, enabled, today, saving, onConfirm, onDismiss, onDirty, onBegin, resetKey = 0 }: {
 predictions: CyclePrediction[]; starts: number; enabled: boolean; today: string; saving: boolean;
 onConfirm: (prediction: CyclePrediction, draft: PeriodDraft) => Promise<boolean>;
 onDismiss: (prediction: CyclePrediction) => Promise<boolean>; onDirty: (dirty: boolean) => void; onBegin?: () => boolean; resetKey?: number;
}) {
 const [confirming,setConfirming]=useState<CyclePrediction|null>(null),[draft,setDraft]=useState<PeriodDraft|null>(null);
 useEffect(()=>{setConfirming(null);setDraft(null);},[resetKey]);
 const begin=(prediction:CyclePrediction)=>{
  if(onBegin && !onBegin()) return;
  setConfirming(prediction);setDraft({id:crypto.randomUUID(),start_date:prediction.start_date<=today?prediction.start_date:today,end_date:prediction.end_date<=today?prediction.end_date:null,notes:''});onDirty(true);
 };
 const submit=async(e:FormEvent)=>{e.preventDefault();if(confirming&&draft&&await onConfirm(confirming,draft)){setConfirming(null);setDraft(null);onDirty(false);}};
 return <section className="cycle-prediction-log"><h3>Automatic predicted period log</h3>
  <p className="cycle-muted">{!enabled?'Automatic logging is paused in Cycle settings.':starts<3?`${starts} of 3 recorded period starts. Automatic predictions begin after the third start.`:'Automatic predictions are enabled. Predicted entries never count as actual periods until confirmed.'}</p>
  {!predictions.length&&starts>=3&&<p className="cycle-muted">No automatic entry yet. The next usable forecast appears after settings and recorded starts are reconciled.</p>}
  {[...predictions].reverse().map(p=><article key={p.id} className={`prediction-log-entry ${p.status}`}><div><strong>{prettyDate(p.start_date)} – {prettyDate(p.end_date)}</strong>
   <p>{p.status==='predicted'?(p.start_date>today?'Predicted · Upcoming':p.end_date>=today?'Predicted · Expected in progress':'Predicted · Awaiting confirmation'):p.status==='confirmed'?(p.confirmed_entry_id?'Prediction confirmed · See actual record below':'Previously confirmed · Actual record removed'):p.status==='dismissed'?'Dismissed · Did not happen as predicted':'Superseded · Forecast changed'} · {p.end_date>=p.start_date?'Automatically added':''}</p>
   </div>{p.status==='predicted'&&<div className="cycle-actions"><button className="paper-button" disabled={saving} onClick={()=>begin(p)}>Confirm / correct bleeding dates</button><button className="cycle-remove" disabled={saving} onClick={()=>{void onDismiss(p);}}>Did not happen / Dismiss</button></div>}</article>)}
  {confirming&&draft&&<form className="cycle-form" onSubmit={submit}><fieldset disabled={saving}><h4>Confirm actual bleeding</h4><p>Only confirm bleeding that actually happened. Correct the predicted dates before saving.</p>
   <div className="cycle-pair"><label>Actual period start<input type="date" required min="1900-01-01" max={today} value={draft.start_date} onChange={e=>setDraft({...draft,start_date:e.target.value})}/></label><label>Actual period end (optional)<input type="date" min={draft.start_date} max={today} value={draft.end_date??''} onChange={e=>setDraft({...draft,end_date:e.target.value||null})}/></label></div>
   <label>Confirmation notes<textarea maxLength={2000} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
   <div className="cycle-actions"><button type="button" className="paper-button" onClick={()=>{setConfirming(null);setDraft(null);onDirty(false);}}>Cancel confirmation</button><button className="paper-button primary">Save confirmed period</button></div>
  </fieldset></form>}
 </section>;
}
