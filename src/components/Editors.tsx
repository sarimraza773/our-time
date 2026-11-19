import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DateTime } from 'luxon';
import type { CalendarEvent, EventCategory, OwnerId, RecurringRule } from '../types';

const CATEGORIES: {value:EventCategory;label:string}[] = [
  ['class','Class'],['study','Study'],['sleep','Sleep'],['friends','With Friends'],['food','Food'],['freeTime','Free Time'],['personal','Personal / Other'],['dateNight','Date Night'],['call','Call'],['sharedTime','Shared Time']
].map(([value,label])=>({value:value as EventCategory,label}));

const blankEvent = (day:DateTime, ownerId:OwnerId, zone:string): CalendarEvent => {
  // The selected planner date is a calendar date, not an instant to convert to
  // the owner's timezone. A Sarim entry for Sunday should open on Sunday there.
  const start = DateTime.fromISO(`${day.toISODate()}T10:00`, {zone});
  const stamp = DateTime.now().toUTC().toISO()!;
  return {id:`event-${crypto.randomUUID()}`,ownerId,title:'',category:'personal',startUtc:start.toUTC().toISO()!,endUtc:start.plus({hours:1}).toUTC().toISO()!,timezone:zone,notes:'',isRecurring:false,openToStudyTogether:false,editable:true,createdAt:stamp,updatedAt:stamp};
};

export function EventEditor({ event, day, ownerId, zone, pending = false, error = '', onSave, onDelete, onClose }: { event:CalendarEvent|null|undefined; day:DateTime; ownerId:OwnerId; zone:string; pending?:boolean; error?:string; onSave:(event:CalendarEvent)=>void; onDelete:(event:CalendarEvent)=>void; onClose:()=>void }) {
  const [draft,setDraft] = useState<CalendarEvent>(()=>event ?? blankEvent(day,ownerId,zone));
  useEffect(()=>setDraft(event ?? blankEvent(day,ownerId,zone)),[event,day,ownerId,zone]);
  const start = DateTime.fromISO(draft.startUtc).setZone(draft.timezone);
  const end = DateTime.fromISO(draft.endUtc).setZone(draft.timezone);
  const setLocal = (field:'startUtc'|'endUtc',date:string,time:string) => setDraft((current)=>({...current,[field]:DateTime.fromISO(`${date}T${time}`,{zone:current.timezone}).toUTC().toISO()!}));
  return (
    <AnimatePresence>
      <motion.div className="modal-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onMouseDown={(e)=>{if(e.currentTarget===e.target)onClose()}}>
        <motion.form className="editor-card" initial={{opacity:0,y:24,scale:.97}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:18,scale:.98}} onSubmit={(e)=>{e.preventDefault();const startValue=DateTime.fromISO(draft.startUtc);let endValue=DateTime.fromISO(draft.endUtc);if(endValue<=startValue)endValue=endValue.plus({days:1});onSave({...draft,endUtc:endValue.toUTC().toISO()!,updatedAt:DateTime.now().toUTC().toISO()!})}}>
          <fieldset className="editor-fields" disabled={pending}><header><div><p className="eyebrow">{event?'Edit this moment':'Add to the day'}</p><h2>{event?'Event details':'New event'}</h2></div><button type="button" onClick={onClose} aria-label="Close event editor">×</button></header>
          <label>Title<input required value={draft.title} onChange={(e)=>setDraft({...draft,title:e.target.value})} placeholder="What’s happening?" autoFocus /></label>
          <div className="field-pair"><label>Owner<select value={draft.ownerId} onChange={(e)=>setDraft({...draft,ownerId:e.target.value as OwnerId,timezone:e.target.value==='deena'?'Asia/Kuala_Lumpur':'America/New_York'})}><option value="deena">Deena</option><option value="sarim">Sarim</option></select></label><label>Category<select value={draft.category} onChange={(e)=>setDraft({...draft,category:e.target.value as EventCategory})}>{CATEGORIES.map((c)=><option key={c.value} value={c.value}>{c.label}</option>)}</select></label></div>
          <div className="field-pair"><label>Date<input type="date" value={start.toISODate()!} onChange={(e)=>{setLocal('startUtc',e.target.value,start.toFormat('HH:mm'));setLocal('endUtc',e.target.value,end.toFormat('HH:mm'))}} /></label><label>Timezone<select value={draft.timezone} onChange={(e)=>setDraft({...draft,timezone:e.target.value})}><option value="Asia/Kuala_Lumpur">Kuala Lumpur</option><option value="America/New_York">Pennsylvania</option></select></label></div>
          <div className="field-pair"><label>Start<input type="time" value={start.toFormat('HH:mm')} onChange={(e)=>setLocal('startUtc',start.toISODate()!,e.target.value)} /></label><label>End<input type="time" value={end.toFormat('HH:mm')} onChange={(e)=>setLocal('endUtc',end.toISODate()!,e.target.value)} /></label></div>
          <label>Notes<textarea value={draft.notes} onChange={(e)=>setDraft({...draft,notes:e.target.value})} placeholder="Optional little details…" /></label>
          {draft.category==='study'&&<label className="check-label"><input type="checkbox" checked={draft.openToStudyTogether} onChange={(e)=>setDraft({...draft,openToStudyTogether:e.target.checked})}/><span>Open to study together</span></label>}
          <div className="editor-actions">{event&&<button type="button" className="danger" onClick={()=>onDelete(draft)}>Delete</button>}<span /><button type="button" className="quiet" onClick={onClose}>Cancel</button><motion.button className="primary" whileTap={{scale:.96}}>Save event ✦</motion.button></div>
        </fieldset>{error&&<p className="cloud-error" role="alert">{error}</p>}{pending&&<p role="status">Saving to our calendar…</p>}</motion.form>
      </motion.div>
    </AnimatePresence>
  );
}

const blankRule = (ownerId:OwnerId):RecurringRule => ({id:`rule-${crypto.randomUUID()}`,ownerId,title:'',category:'study',timezone:ownerId==='deena'?'Asia/Kuala_Lumpur':'America/New_York',startTime:'09:00',endTime:'10:00',pattern:'weekdays',weekdays:[],active:true,notes:'',openToStudyTogether:false});

export function RecurringScheduleEditor({ rule, ownerId, pending = false, error = '', onSave, onClose }: {rule:RecurringRule|null|undefined;ownerId:OwnerId;pending?:boolean;error?:string;onSave:(rule:RecurringRule)=>void;onClose:()=>void}) {
  const [draft,setDraft]=useState<RecurringRule>(()=>rule??blankRule(ownerId));
  useEffect(()=>setDraft(rule??blankRule(ownerId)),[rule,ownerId]);
  const toggleDay=(day:number)=>setDraft({...draft,weekdays:draft.weekdays.includes(day)?draft.weekdays.filter((d)=>d!==day):[...draft.weekdays,day].sort()});
  return <div className="modal-backdrop" onMouseDown={(e)=>{if(e.currentTarget===e.target)onClose()}}><motion.form className="editor-card rule-editor" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} onSubmit={(e)=>{e.preventDefault();onSave(draft)}}>
    <fieldset className="editor-fields" disabled={pending}><header><div><p className="eyebrow">A rhythm that repeats</p><h2>{rule?'Edit schedule':'New recurring schedule'}</h2></div><button type="button" onClick={onClose}>×</button></header>
    <label>Title<input required value={draft.title} onChange={(e)=>setDraft({...draft,title:e.target.value})} placeholder="e.g. Psychology Lecture" autoFocus /></label>
    <div className="field-pair"><label>Owner<select value={draft.ownerId} onChange={(e)=>{const id=e.target.value as OwnerId;setDraft({...draft,ownerId:id,timezone:id==='deena'?'Asia/Kuala_Lumpur':'America/New_York'})}}><option value="deena">Deena</option><option value="sarim">Sarim</option></select></label><label>Category<select value={draft.category} onChange={(e)=>setDraft({...draft,category:e.target.value as EventCategory})}>{CATEGORIES.map((c)=><option key={c.value} value={c.value}>{c.label}</option>)}</select></label></div>
    <label>Repeats<select value={draft.pattern} onChange={(e)=>setDraft({...draft,pattern:e.target.value as RecurringRule['pattern']})}><option value="daily">Every day</option><option value="weekdays">Weekdays</option><option value="weekly">Weekly</option><option value="custom">Custom days</option></select></label>
    {(draft.pattern==='custom'||draft.pattern==='weekly')&&<fieldset className="weekday-picker"><legend>Days</legend>{['M','T','W','T','F','S','S'].map((label,i)=><button type="button" key={`${label}-${i}`} className={draft.weekdays.includes(i+1)?'selected':''} onClick={()=>toggleDay(i+1)}>{label}</button>)}</fieldset>}
    <div className="field-pair"><label>Start<input type="time" value={draft.startTime} onChange={(e)=>setDraft({...draft,startTime:e.target.value})}/></label><label>End<input type="time" value={draft.endTime} onChange={(e)=>setDraft({...draft,endTime:e.target.value})}/></label></div>
    {draft.category==='study'&&<label className="check-label"><input type="checkbox" checked={draft.openToStudyTogether} onChange={(e)=>setDraft({...draft,openToStudyTogether:e.target.checked})}/><span>Open to study together</span></label>}
    <div className="editor-actions"><span/><button type="button" className="quiet" onClick={onClose}>Cancel</button><button className="primary">Save schedule</button></div>
  </fieldset>{error&&<p className="cloud-error" role="alert">{error}</p>}{pending&&<p role="status">Saving to our calendar…</p>}</motion.form></div>;
}
